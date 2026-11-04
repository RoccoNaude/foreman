// Opt-in, token-consuming workflow checks: node tests/live-commands.js
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
mkdirSync(join(root, ".tmp"), { recursive: true })
const sandbox = mkdtempSync(join(root, ".tmp/live-commands-"))
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith("OPENCODE_")) delete env[key]
for (const [key, directory] of Object.entries({
  HOME: "home", XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data",
  XDG_CACHE_HOME: "cache", XDG_STATE_HOME: "state", TMPDIR: "tmp",
  npm_config_cache: "npm-cache", BUN_INSTALL_CACHE_DIR: "bun-cache",
})) {
  env[key] = join(sandbox, directory)
  mkdirSync(env[key], { recursive: true })
}
env.OPENCODE_CONFIG_PROJECT_DISABLE = "true"
env.OPENCODE_DISABLE_FREE_MODELS = "true"
function run(command, args, cwd = sandbox) {
  return execFileSync(command, args, { cwd, env: { ...env, PWD: cwd }, encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 })
}
writeFileSync(join(sandbox, "package.json"), '{"private":true}')
const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", sandbox], root))[0]
run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", join(sandbox, packed.filename)])
const installed = join(sandbox, "node_modules/opencode-foreman")
process.on("exit", () => {
  for (const name of ["opencode.db", "opencode.db-wal", "opencode.db-shm"])
    rmSync(join(env.XDG_DATA_HOME, "opencode", name), { force: true })
})
const credentials = execFileSync("opencode", ["auth", "export", "openai"], {
  cwd: root, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
})
execFileSync("opencode", ["auth", "import", "--standalone"], {
  cwd: sandbox, env, input: credentials, timeout: 30_000, stdio: ["pipe", "pipe", "pipe"],
})

for (const scenario of ["missing", "invalid", "absent", "level", "model", "second-review", "models"]) {
  const project = join(sandbox, scenario)
  mkdirSync(project)
  env.OPENCODE_CONFIG = join(project, "opencode.json")
  run("git", ["init", "-b", "main"], project)
  const trace = join(project, "trace.jsonl")
  const result = join(project, "result.json")
  const fixture = join(project, "fixture")
  mkdirSync(fixture)
  writeFileSync(join(fixture, "package.json"), '{"name":"command-fixture","type":"module","exports":"./index.js"}')
  const task = scenario === "invalid" ? "BAD" : scenario === "second-review"
    ? "F01 Resume checkpoint at step 6: I approved the plan and branch earlier. The first independent review had Must fix findings, fixes and checks completed, and the second independent review still reports Must fix: source.js returns the wrong value."
    : "F01"
  writeFileSync(join(fixture, "index.js"), `
import { appendFileSync, writeFileSync } from "node:fs"
export default { id: "command-fixture", async setup(ctx) {
  await ctx.tool.hook("execute.before", event => {
    appendFileSync(${JSON.stringify(trace)}, JSON.stringify({tool:event.tool,input:event.input}) + "\\n")
  })
  await ctx.command.transform(editor => editor.add({ name: "exercise", execute: async () => {
    const session = await ctx.session.create()
    await ctx.session.command({ sessionID: session.id, name: ${JSON.stringify(scenario === "models" ? "foreman/models" : "foreman/start-task")}, text: ${JSON.stringify(task)} })
    await ctx.session.wait({ sessionID: session.id })
    writeFileSync(${JSON.stringify(result)}, JSON.stringify(await ctx.session.context({ sessionID: session.id })))
  } }))
} }
`)
  writeFileSync(join(project, "opencode.json"), JSON.stringify({
    plugins: [installed, fixture], model: scenario === "model" ? "openai/gpt-6-luna" : "openai/gpt-6.1-sol#medium",
    permissions: [{ action: "*", resource: "*", effect: "deny" },
      { action: "external_directory", resource: `${installed}/shared*`, effect: "allow" },
      ...["read", "glob", "grep"].map(action => ({ action, resource: "*", effect: "allow" }))],
  }))
  if (scenario !== "missing") writeFileSync(join(project, ".foreman.md"), "# Settings\nMain branch: main\nTracker: tasks.md\nPlan: None\nChecks: node --test\nProtected data: none\nLevel A also covers: none\n")
  writeFileSync(join(project, "tasks.md"), `# Open findings\n## ${scenario === "absent" ? "F02" : "F01"}: Correct source\n**Model**: ${scenario === "level" ? "unknown" : "A"}\nStatus: Open\nFix source.js to return 1, with its test.\n`)
  writeFileSync(join(project, "source.js"), "export const value = 0\n")
  const output = run("opencode", ["api", "--standalone", "post", "/api/session", "--data", "{}"], project)
  const session = JSON.parse(output).data
  run("opencode", ["api", "--standalone", "post", `/api/session/${session.id}/command`, "--data", JSON.stringify({ name: "exercise", text: "" })], project)
  const messages = JSON.parse(readFileSync(result, "utf8"))
  const attempted = messages.filter(message => message.type === "assistant").flatMap(message => message.content || []).filter(part => part.type === "tool")
  assert.ok(attempted.every(part => ["read", "glob", "grep"].includes(part.name)), `${scenario}: forbidden attempted tool`)
  const text = messages.filter(message => message.type === "assistant").flatMap(message => message.content || []).filter(part => part.type === "text").map(part => part.text).join("\n")
  writeFileSync(join(project, "answer.txt"), text)
  const tools = readFileSync(trace, { encoding: "utf8", flag: "a+" }).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
  assert.ok(!tools.some(event => ["shell", "patch", "edit", "subagent"].includes(event.tool)), `${scenario}: forbidden action`)
  assert.ok(!tools.some(event => event.tool === "read" && event.input.path?.endsWith("source.js")), `${scenario}: read code past stop gate`)
  if (scenario === "missing") assert.match(text, /missing|not.*(?:exist|found)|no.*\.foreman/i)
  if (scenario === "invalid") assert.match(text, /invalid|not.*(?:valid|supported)|unsupported|shape|format/i)
  if (scenario === "absent") assert.match(text, /not.*(?:found|exist)|absent|missing|no.*F01/i)
  if (scenario === "level") assert.match(text, /invalid|unknown|clarif|valid.*level/i)
  if (scenario === "model") {
    assert.match(text, /below|insufficient|does not qualify|not qualified|level C|level \*\*C\*\*/i)
    assert.match(text, /Astra|6\.1[ -]Sol|gpt-6\.1-sol/i)
    assert.doesNotMatch(text, /access.*denied|can.t verify/i)
  }
  if (scenario === "second-review") {
    assert.match(text, /hand(?:ing)? (?:it |this |the task )?(?:back|off)|handback|stop(?:ped|ping)?/i)
    assert.match(text, /second|two|2/)
    assert.match(text, /must.fix|block/i)
  }
  if (scenario === "models") assert.equal(text.trim(), readFileSync(join(root, "shared/model-levels.md"), "utf8").trim())
  assert.equal(readFileSync(join(project, "source.js"), "utf8"), "export const value = 0\n")
  console.log(`PASS ${scenario}: ${project}`)
}
console.log(`Live command evidence: ${sandbox}`)
