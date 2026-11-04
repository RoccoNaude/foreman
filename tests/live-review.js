// Opt-in, token-consuming acceptance check: node tests/live-review.js
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, globSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
mkdirSync(join(root, ".tmp"), { recursive: true })
const sandbox = mkdtempSync(join(root, ".tmp/live-review-"))
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
// Transfer only OpenAI access through memory. V2 stores credentials in its DB,
// not the legacy auth.json. Remove this isolated DB (including WAL) on exit.
process.on("exit", () => {
  for (const name of ["opencode.db", "opencode.db-wal", "opencode.db-shm"])
    rmSync(join(env.XDG_DATA_HOME, "opencode", name), { force: true })
})
const credentials = execFileSync("opencode", ["auth", "export", "openai"], {
  cwd: root, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
})
execFileSync("opencode", ["auth", "import", "--standalone"], {
  cwd: sandbox, env, input: credentials, encoding: "utf8", timeout: 30_000,
  stdio: ["pipe", "pipe", "pipe"],
})
const cache = process.env.XDG_CACHE_HOME || join(process.env.HOME, ".cache")
const skills = globSync(join(cache, "opencode/npm/@dietrichgebert/ponytail@latest/*/node_modules/@dietrichgebert/ponytail/skills/ponytail-review/SKILL.md"))
assert.ok(skills.length, "Install ponytail-review before the live check")
const skill = readFileSync(skills.at(-1), "utf8")

for (const scenario of ["available", "unavailable", "failed", "empty"]) {
  const project = join(sandbox, scenario)
  mkdirSync(project)
  const config = join(project, "opencode.json")
  const trace = join(project, "trace.jsonl")
  const fixture = join(project, "fixture")
  mkdirSync(fixture)
  writeFileSync(join(fixture, "package.json"), '{"name":"live-review-fixture","type":"module","exports":"./index.js"}')
  writeFileSync(join(fixture, "index.js"), `
import { appendFileSync } from "node:fs"
export default { id: "live-review-fixture", async setup(ctx) {
  await ctx.tool.hook("execute.before", event => {
    appendFileSync(${JSON.stringify(trace)}, JSON.stringify({tool:event.tool,input:event.input}) + "\\n")
    if (${JSON.stringify(scenario)} === "failed" && event.tool === "skill")
      throw new Error("Injected skill execution failure")
  })
  await ctx.session.hook("context", event => {
    appendFileSync(${JSON.stringify(trace)}, JSON.stringify({model:event.model,agent:event.agent}) + "\\n")
  })
} }
`)
  const settings = {
    plugins: [installed, fixture],
    model: "openai/gpt-6-luna",
    skills: { paths: scenario === "unavailable" ? [] : [join(project, "skills")] },
  }
  writeFileSync(config, JSON.stringify(settings))
  if (scenario !== "unavailable") {
    const directory = join(project, "skills/ponytail-review")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "SKILL.md"), skill)
  }
  writeFileSync(join(project, ".gitignore"), "opencode.json\nfixture/\ntrace.jsonl\nskills/\nscratch/\n")
  writeFileSync(join(project, ".foreman.md"), `# Fixture project
Main branch: main
Task tracker: tasks.md
Expected load: one user calling a small pure function.
Project files: index.js, index.test.js, tasks.md
Checks: node --test index.test.js
Scratch folder: scratch/
Protected data: none
Ask first: source changes
Never run: commits, pushes, merges, deletes or edits during review.
`)
  writeFileSync(join(project, "tasks.md"), "# Task 9\nAdd divide(a, b), returning a / b. Zero b must throw RangeError. Wire it into index.js and test it.\n")
  writeFileSync(join(project, "index.js"), "export const name = 'fixture'\n")
  writeFileSync(join(project, "index.test.js"), "import assert from 'node:assert/strict'\nimport { name } from './index.js'\nassert.equal(name, 'fixture')\n")
  writeFileSync(join(project, "package.json"), '{"type":"module"}')
  run("git", ["init", "-b", "main"], project)
  run("git", ["add", "."], project)
  run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture baseline"], project)
  run("git", ["switch", "-c", "task-9"], project)
  if (scenario !== "empty") {
    writeFileSync(join(project, "divide.js"), "export function divide(a, b) { return a * b }\n")
    writeFileSync(join(project, "index.js"), "export const name = 'fixture'\nexport { divide } from './divide.js'\n")
  }
  env.OPENCODE_CONFIG = config
  const before = run("git", ["diff", "main"], project)
  const status = run("git", ["status", "--short"], project)
  const untracked = scenario === "empty" ? undefined : readFileSync(join(project, "divide.js"))
  const output = run("opencode", ["run", "--standalone", "--agent", "foreman-reviewer", "--format", "json", "--auto",
    "Review task 9 from tasks.md on branch task-9 against main. Changes may be uncommitted and untracked. Follow your reviewer procedure. You have owner approval to invoke read-only Git inspection and the configured node check through the shell tool permission system; do not pause to ask conversationally."], project)
  writeFileSync(join(project, "transcript.jsonl"), output)
  const events = readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line))
  const tools = events.filter(event => event.tool)
  const transcript = output.trim().split("\n").map(line => JSON.parse(line))
  const finalText = transcript.filter(event => event.type === "text").map(event => event.part.text).join("\n")
  const text = output.replaceAll("\\n", "\n")
  assert.ok(events.some(event => event.agent === "foreman-reviewer" && event.model.id === "gpt-6.1-sol" && event.model.variant === "high"))
  assert.match(text, /Merge: no, fix /)
  assert.doesNotMatch(text, /Merge: yes/)
  if (scenario === "unavailable") {
    assert.match(text, /unavailable|not available|not installed/i)
    assert.ok(tools.some(event => JSON.stringify(event.input).includes("divide.js")), "Fallback must inspect the untracked defect")
    assert.match(text, /divide\.js.*(?:1|L1)/)
    for (const path of ["index.js", "divide.js", "index.test.js"]) {
      assert.ok(tools.some(event => event.tool === "read"
        && event.input.path?.endsWith(path) && !event.input.offset && !event.input.limit), `Fallback must read ${path} in full`)
    }
    assert.match(finalText, /multipli|a \* b|zero|RangeError/i)
  } else {
    const load = tools.findIndex(event => event.tool === "skill" && event.input.id === "ponytail-review")
    assert.ok(load >= 0, "Available skill must be loaded")
    const inspection = tools.findIndex(event => /divide\.js|index\.js|git diff/.test(JSON.stringify(event.input)))
    assert.ok(inspection === -1 || load < inspection, "Skill must precede change inspection")
    if (scenario === "failed") {
      assert.match(text, /failed skill execution|skill.*fail/i)
      assert.equal(inspection, -1, "Failed skill must stop review")
    } else {
      assert.ok(transcript.some(event => event.type === "tool_use" && event.part.tool === "skill"
        && event.part.state.input.id === "ponytail-review" && event.part.state.status === "completed"), "ponytail-review must load successfully")
      if (scenario === "empty") assert.match(finalText, /empty|no (?:changes|differences|staged)/i)
      else {
        assert.match(finalText, /divide\.js.*(?:1|L1)/)
        assert.match(finalText, /multipli|a \* b|zero|RangeError/i)
      }
    }
  }
  assert.equal(run("git", ["diff", "main"], project), before, "Review mutated tracked source")
  if (untracked) assert.deepEqual(readFileSync(join(project, "divide.js")), untracked, "Review mutated untracked source")
  // Transcript is written by the harness, not the reviewer.
  assert.equal(run("git", ["status", "--short"], project).replace("?? transcript.jsonl\n", ""), status)
  console.log(`PASS ${scenario}: ${project}`)
}
console.log(`Live acceptance evidence: ${sandbox}`)
