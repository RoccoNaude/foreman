import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("../", import.meta.url))
mkdirSync(join(root, ".tmp"), { recursive: true })
const sandbox = mkdtempSync(join(root, ".tmp/package-test-"))
writeFileSync(join(sandbox, "package.json"), '{"private":true}')
const env = { ...process.env }
for (const [key, directory] of Object.entries({
  HOME: "home", XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data",
  XDG_CACHE_HOME: "cache", XDG_STATE_HOME: "state", TMPDIR: "tmp",
  npm_config_cache: "npm-cache", BUN_INSTALL_CACHE_DIR: "bun-cache",
})) {
  env[key] = join(sandbox, directory)
  mkdirSync(env[key], { recursive: true })
}
// Do not let a caller's inline configuration connect tests to their setup.
for (const key of Object.keys(env)) {
  if (key.startsWith("OPENCODE_")) delete env[key]
}
env.OPENCODE_DISABLE_FREE_MODELS = "true"
function run(command, args, cwd = sandbox) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8", timeout: 120_000 })
}
const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", sandbox], root))[0]
run("npm", ["install", "--prefix", sandbox, "--no-audit", "--no-fund", "--ignore-scripts", join(sandbox, packed.filename)])
const installed = join(sandbox, "node_modules/opencode-foreman")

test("artifact contains unchanged shared sources and only intended runtime files", () => {
  const files = packed.files.map(file => file.path)
  function check(directory) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) check(path)
      else {
        assert.ok(files.includes(path), path)
        assert.deepEqual(readFileSync(join(installed, path)), readFileSync(join(root, path)))
      }
    }
  }
  check("shared")
  assert.ok(files.includes(".opencode/plugins/foreman.mjs"))
  assert.ok(files.includes(".opencode/plugins/reviewer.md"))
  assert.ok(files.includes(".opencode/plugins/start-task.md"))
  assert.ok(files.includes(".opencode/plugins/index.js"))
  assert.ok(!files.some(path => /^(claude-code|\.claude-plugin|\.tmp|tests)\//.test(path)))
  assert.deepEqual(readdirSync(join(sandbox, "node_modules")), [".package-lock.json", "opencode-foreman"])
})

test("installed artifact loads globally and locally; agent transforms create and dispose", async (t) => {
  assert.equal(run("opencode", ["--version"]).trim(), "opencode v2.2.5")
  const fixture = join(sandbox, "fixture")
  mkdirSync(fixture)
  writeFileSync(join(fixture, "package.json"), JSON.stringify({
    name: "foreman-test-fixture", type: "module", exports: "./index.js",
  }))
  writeFileSync(join(fixture, "index.js"), `
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import foreman from "opencode-foreman"
import { probe } from ${JSON.stringify(new URL("./runtime-probe.js", import.meta.url).href)}
export default {
  id: "foreman-test-fixture",
  async setup(ctx) {
    assert.equal(foreman.id, "foreman")
    const id = "foreman-test-reviewer"
    const register = () => ctx.agent.transform(editor => editor.update(id, agent => {
      agent.mode = "subagent"
      agent.description = "Test-only agent contribution"
      agent.permissions = [{ action: "*", resource: "*", effect: "deny" }]
      agent.system = readFileSync(new URL("../../shared/model-levels.md", import.meta.resolve("opencode-foreman")), "utf8")
    }))
    const registration = await register()
    assert.ok((await ctx.agent.list()).data.some(agent => agent.id === id))
    await registration.dispose()
    await registration.dispose()
    assert.ok(!(await ctx.agent.list()).data.some(agent => agent.id === id))
    await register()
    await ctx.agent.reload()
    assert.equal((await ctx.agent.list()).data.filter(agent => agent.id === id).length, 1)
    await ctx.command.transform(editor => editor.add({
      name: "foreman-test-probe",
      execute: async () => {
        await probe(ctx)
      },
    }))
  },
}
`)
  const globalConfig = join(env.XDG_CONFIG_HOME, "opencode/opencode.json")
  mkdirSync(resolve(globalConfig, ".."), { recursive: true })
  const project = join(sandbox, "project")
  const otherProject = join(sandbox, "other-project")
  mkdirSync(project)
  mkdirSync(otherProject)
  const localConfig = join(project, "opencode.json")
  const config = {
    plugins: [installed, fixture],
    model: "openai/gpt-6-luna",
    providers: { openai: {
      settings: { apiKey: "test-only", baseURL: "http://127.0.0.1:1/v1" },
    } },
  }
  function agents(cwd) {
    return JSON.parse(run("opencode", ["api", "--standalone", "get", "/api/agent"], cwd)).data
  }
  function check(cwd, expected) {
    const available = agents(cwd)
    const reviewer = available.filter(agent => agent.id === "foreman-reviewer")
    // The checkout is discovered in local mode even without explicit config.
    if (expected || !env.OPENCODE_CONFIG_PROJECT_DISABLE) {
      assert.equal(reviewer.length, 1)
      assert.equal(reviewer[0].mode, "subagent")
      assert.deepEqual(reviewer[0].model, { providerID: "openai", id: "gpt-6.1-sol", variant: "high" })
      const shared = join(env.OPENCODE_CONFIG_PROJECT_DISABLE ? installed : root, "shared")
      assert.equal(reviewer[0].system, readFileSync(join(root, ".opencode/plugins/reviewer.md"), "utf8")
        .replaceAll("$SHARED", shared))
      assert.equal(readFileSync(join(shared, "github-issues.md"), "utf8"), readFileSync(join(root, "shared/github-issues.md"), "utf8"))
    } else assert.equal(reviewer.length, 0)
    const matches = available.filter(agent => agent.id === "foreman-test-reviewer")
    assert.equal(matches.length, expected ? 1 : 0)
    if (expected) {
      assert.equal(matches[0].mode, "subagent")
      assert.equal(matches[0].system, readFileSync(join(root, "shared/model-levels.md"), "utf8"))
    }
  }
  // Suppress ancestor checkout discovery while testing the global artifact alone.
  env.OPENCODE_CONFIG_PROJECT_DISABLE = "true"
  writeFileSync(globalConfig, JSON.stringify(config))
  check(project, true)
  check(otherProject, true)
  writeFileSync(globalConfig, "{}")
  check(project, false)
  delete env.OPENCODE_CONFIG_PROJECT_DISABLE
  // Checkout discovery takes precedence over a configured package with the same ID.
  writeFileSync(localConfig, JSON.stringify(config))
  check(project, true)
  check(otherProject, false)
  writeFileSync(localConfig, "{}")
  check(project, false)
  assert.equal(readFileSync(globalConfig, "utf8"), "{}")
  assert.equal(readFileSync(localConfig, "utf8"), "{}")
  assert.deepEqual(readdirSync(project), ["opencode.json"])
  assert.deepEqual(readdirSync(join(env.XDG_CONFIG_HOME, "opencode")), ["opencode.json"])

  // Exercise automatic cleanup on config reload, not just explicit disposal.
  async function startServer(serverEnv, cwd = project) {
    const server = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
      cwd, env: serverEnv, stdio: ["ignore", "pipe", "pipe"],
    })
    t.after(() => server.kill())
    return await new Promise((accept, reject) => {
      let output = ""
      const timer = setTimeout(() => reject(new Error("Test server startup timed out")), 20_000)
      function failed(error) {
        clearTimeout(timer)
        reject(error)
      }
      server.once("error", failed)
      server.once("exit", () => failed(new Error("Test server exited before startup")))
      server.stderr.resume()
      server.stdout.on("data", chunk => {
        output += chunk
        const url = output.match(/server listening on (http:\/\/[^\s]+)/)?.[1]
        const password = output.match(/server password ([^\s]+)/)?.[1]
        if (url && password) {
          clearTimeout(timer)
          accept({ url, password, server })
        }
      })
    })
  }
  let connection = await startServer(env)
  async function request(path) {
    const response = await fetch(`${connection.url}${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`opencode:${connection.password}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
    })
    assert.equal(response.status, 200)
    return (await response.json()).data
  }
  async function waitForLoaded(expected) {
    const deadline = Date.now() + 15_000
    do {
      const agents = await request("/api/agent")
      const plugins = await request("/api/plugin")
      const commands = await request("/api/command")
      if (agents.filter(agent => agent.id === "foreman-test-reviewer").length === (expected ? 1 : 0)
        && commands.filter(command => ["foreman/start-task", "foreman/models"].includes(command.name)).length === (expected ? 2 : 0)
        && agents.filter(agent => agent.id === "foreman-reviewer").length === (expected ? 1 : 0)
        && plugins.filter(plugin => plugin.id === "foreman" && plugin.state.status === "active").length === (expected ? 1 : 0)) return
      await new Promise(resolve => setTimeout(resolve, 100))
    } while (Date.now() < deadline)
    assert.fail(`Plugin reload did not reach loaded=${expected}`)
  }
  await request("/api/agent")
  const discovered = (await request("/api/plugin")).filter(plugin => plugin.id === "foreman")
  assert.equal(discovered.length, 1)
  assert.equal(discovered[0].state.status, "active")
  assert.equal(discovered[0].source.path, join(root, ".opencode/plugins/index.js"))
  connection.server.kill()
  connection = await startServer({
    ...env, OPENCODE_CONFIG_PROJECT_DISABLE: "true", OPENCODE_CONFIG: localConfig,
  })
  await waitForLoaded(false)
  writeFileSync(localConfig, JSON.stringify(config))
  await waitForLoaded(true)
  const configured = (await request("/api/plugin")).find(plugin => plugin.id === "foreman")
  assert.equal(configured.source.path, installed)
  // Global contributions must work in both consumers without project copies.
  connection.server.kill()
  writeFileSync(globalConfig, JSON.stringify(config))
  writeFileSync(localConfig, "{}")
  for (const cwd of [project, otherProject]) {
    connection = await startServer({ ...env, OPENCODE_CONFIG_PROJECT_DISABLE: "true" }, cwd)
    await waitForLoaded(true)
    assert.equal((await request("/api/plugin")).find(plugin => plugin.id === "foreman").source.path, installed)
    connection.server.kill()
  }
  writeFileSync(globalConfig, "{}")
  writeFileSync(localConfig, JSON.stringify(config))
  connection = await startServer({ ...env, OPENCODE_CONFIG_PROJECT_DISABLE: "true", OPENCODE_CONFIG: localConfig })
  await waitForLoaded(true)
  const headers = {
    Authorization: `Basic ${Buffer.from(`opencode:${connection.password}`).toString("base64")}`,
    "Content-Type": "application/json",
  }
  const sessionResponse = await fetch(`${connection.url}/api/session`, {
    method: "POST", headers, body: "{}",
  })
  assert.equal(sessionResponse.status, 200)
  const session = (await sessionResponse.json()).data
  const probeResponse = await fetch(`${connection.url}/api/session/${session.id}/command`, {
    method: "POST", headers, body: JSON.stringify({ name: "foreman-test-probe", text: "" }),
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(probeResponse.status, 204, await probeResponse.text())
  writeFileSync(localConfig, "{}")
  await waitForLoaded(false)
  writeFileSync(localConfig, JSON.stringify(config))
  await waitForLoaded(true)
  writeFileSync(localConfig, "{}")
  await waitForLoaded(false)
})
