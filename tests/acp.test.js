import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("../", import.meta.url))

test("ACP plain prompts expand foreman instructions and stream output before end_turn", { timeout: 60_000 }, async t => {
  mkdirSync(join(root, ".tmp"), { recursive: true })
  const sandbox = mkdtempSync(join(root, ".tmp/acp-test-"))
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith("OPENCODE_")) delete env[key]
  for (const key of ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "TMPDIR"]) {
    env[key] = join(sandbox, key)
    mkdirSync(env[key], { recursive: true })
  }
  env.OPENCODE_CONFIG_PROJECT_DISABLE = "true"
  env.OPENCODE_DISABLE_FREE_MODELS = "true"
  const requests = []
  // Local provider only: proves transport and expansion, not model judgement.
  const server = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request) body += chunk
    if (!body) {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end("{}")
      return
    }
    const input = JSON.parse(body)
    requests.push(input)
    const message = { id: "msg_mock", type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: "ACP mock answer", annotations: [] }] }
    const result = { id: "resp_mock", object: "response", created_at: 1, status: "completed",
      model: "gpt-6-luna", output: [message], usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } }
    if (!input.stream) {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify(result))
      return
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" })
    await new Promise(resolve => setTimeout(resolve, 50))
    for (const event of [
      { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } },
      { type: "response.content_part.added", item_id: message.id, output_index: 0, content_index: 0,
        part: { type: "output_text", text: "", annotations: [] } },
      { type: "response.output_text.delta", item_id: message.id, output_index: 0, content_index: 0, delta: "ACP mock answer" },
      { type: "response.output_text.done", item_id: message.id, output_index: 0, content_index: 0, text: "ACP mock answer" },
      { type: "response.output_item.done", output_index: 0, item: message },
      { type: "response.completed", response: result },
    ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    response.end()
  })
  t.after(() => { server.closeAllConnections(); server.close() })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  env.OPENCODE_CONFIG = join(sandbox, "opencode.json")
  writeFileSync(env.OPENCODE_CONFIG, JSON.stringify({
    plugins: [root], model: "openai/gpt-6-luna",
    providers: { openai: { settings: { apiKey: "mock-only", baseURL: `http://127.0.0.1:${server.address().port}/v1` } } },
  }))
  const child = spawn("opencode", ["acp"], { cwd: sandbox, env, stdio: ["pipe", "pipe", "pipe"] })
  t.after(() => child.kill())
  let stderr = ""
  child.stderr.on("data", chunk => { stderr += chunk })
  let nextID = 1
  const pending = new Map()
  const transcript = []
  const lines = createInterface({ input: child.stdout })
  t.after(() => lines.close())
  function rejectPending(error) {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error) }
    pending.clear()
  }
  child.on("error", rejectPending)
  child.on("exit", code => rejectPending(new Error(`ACP exited ${code}: ${stderr}`)))
  lines.on("line", line => {
    const message = JSON.parse(line)
    transcript.push(message)
    const entry = pending.get(message.id)
    if (entry) {
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
    } else if (message.id) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: message.id,
        error: { code: -32601, message: "Not supported by test client" } }) + "\n")
    }
  })
  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextID++
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`ACP timeout: ${method}: ${stderr}`)) }, 15_000)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    })
  }
  t.after(() => writeFileSync(join(sandbox, "evidence.json"), JSON.stringify({ requests, transcript, stderr }, null, 2)))
  const initialized = await rpc("initialize", { protocolVersion: 1, clientCapabilities: {},
    clientInfo: { name: "foreman-test", version: "1" } })
  assert.equal(initialized.agentInfo.version, "2.2.5")
  const cases = [
    ["ordinary prompt", "ordinary prompt"],
    ["foreman models", "Output only the Markdown table under **Models per level**"],
    ["foreman start-task 7.8 keep $& and\nnotes", "7.8 keep $& and\nnotes\n\nFor `issue"],
    ["foreman start-task issue #42 notes", "issue #42 notes\n\nFor `issue"],
    ["foreman start-task", "No task reference was supplied. Ask me"],
  ]
  for (const [text, expected] of cases) {
    const session = await rpc("session/new", { cwd: sandbox, mcpServers: [] })
    const before = requests.length
    const start = transcript.length
    const result = await rpc("session/prompt", { sessionId: session.sessionId, prompt: [{ type: "text", text }] })
    assert.equal(result.stopReason, "end_turn")
    const updates = transcript.slice(start).filter(message => message.params?.sessionId === session.sessionId)
    assert.equal(updates.filter(message => message.params.update.sessionUpdate === "agent_message_chunk")
      .map(message => message.params.update.content.text).join(""), "ACP mock answer", text)
    const inputs = JSON.stringify(requests.slice(before))
    assert.ok(inputs.includes(JSON.stringify(expected).slice(1, -1)), text)
    if (text === "foreman models") {
      assert.ok(inputs.includes(JSON.stringify(readFileSync(join(root, "shared/model-levels.md"), "utf8")).slice(1, -1)))
    }
    if (text.startsWith("foreman start-task ")) {
      assert.ok(inputs.includes("Ask me to"))
      assert.ok(inputs.includes("approve before writing code"))
      assert.ok(inputs.includes(join(root, "shared/github-issues.md")))
    }
    await rpc("session/close", { sessionId: session.sessionId })
  }
  child.stdin.end()
})
