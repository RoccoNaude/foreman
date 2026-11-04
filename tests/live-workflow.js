// Opt-in, token-consuming integrated workflow with explicit fixture-user approvals.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const blocking = process.argv.includes("--blocking")
const issue = process.argv.includes("--issue")
const automaticClosing = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\b/i
for (const keyword of ["fix", "fixes", "fixed", "close", "closes", "closed", "resolve", "resolves", "resolved"]) assert.ok(automaticClosing.test(`${keyword} #42`))
assert.ok(!automaticClosing.test("Issue #42: correct exported value"))
const isIssueRead = args => (args[0] === "issue" && args[1] === "view")
  || (args.length === 2 && args[0] === "api" && args[1] === "repos/fixture/consumer/issues/42")
assert.ok(isIssueRead(["api", "repos/fixture/consumer/issues/42"]))
for (const args of [["issue", "close", "42"], ["api", "repos/fixture/consumer/issues/42", "--method", "PATCH"], ["api", "repos/fixture/consumer/issues/42", "-f", "state=closed"]]) assert.ok(!isIssueRead(args))
// Conservative fixture guard: allow Git global options, reject mutating subcommands.
const forbiddenGit = /\bgit\b[^;&|\n]*\b(?:commit|merge|push)\b/
for (const command of ["git commit -m test", "git -C . commit -m test", "git -c user.name=Fixture merge main", "git push"]) assert.ok(forbiddenGit.test(command))
for (const command of ["git status --short", "git diff main", "git log --oneline", "node --test source.test.js"]) assert.ok(!forbiddenGit.test(command))
mkdirSync(join(root, ".tmp"), { recursive: true })
const sandbox = mkdtempSync(join(root, ".tmp/live-workflow-"))
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith("OPENCODE_")) delete env[key]
for (const [key, name] of Object.entries({ HOME: "home", XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data", XDG_CACHE_HOME: "cache", XDG_STATE_HOME: "state", TMPDIR: "tmp", npm_config_cache: "npm-cache", BUN_INSTALL_CACHE_DIR: "bun-cache" })) {
  env[key] = join(sandbox, name)
  mkdirSync(env[key], { recursive: true })
}
env.OPENCODE_CONFIG_PROJECT_DISABLE = "true"
env.OPENCODE_DISABLE_FREE_MODELS = "true"
function run(command, args, cwd = sandbox) {
  return execFileSync(command, args, { cwd, env: { ...env, PWD: cwd }, encoding: "utf8", timeout: 900_000, maxBuffer: 16 * 1024 * 1024 })
}
writeFileSync(join(sandbox, "package.json"), '{"private":true}')
const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", sandbox], root))[0]
run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(sandbox, packed.filename)])
const installed = join(sandbox, "node_modules/opencode-foreman")
process.on("exit", () => {
  for (const name of ["opencode.db", "opencode.db-wal", "opencode.db-shm"]) rmSync(join(env.XDG_DATA_HOME, "opencode", name), { force: true })
})
const credentials = execFileSync("opencode", ["auth", "export", "openai"], { cwd: root, timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] })
execFileSync("opencode", ["auth", "import", "--standalone"], { cwd: sandbox, env, input: credentials, timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] })
const project = join(sandbox, "consumer")
const fixture = join(sandbox, "fixture")
mkdirSync(project)
mkdirSync(fixture)
const evidence = join(sandbox, "evidence.json")
writeFileSync(join(fixture, "package.json"), '{"name":"workflow-fixture","type":"module","exports":"./index.js"}')
writeFileSync(join(fixture, "index.js"), `
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
export default { id: "workflow-fixture", async setup(ctx) {
  const trace = [], turns = [], reviewers = new Set(), injections = []
  // Runtime tool consent is fixture-only; conversational approvals are tested separately.
  await ctx.permission.hook("evaluate", event => {
    if (event.effect === "ask") event.effect = "allow"
  })
  await ctx.tool.hook("execute.before", event => {
    const checkSource = event.tool === "shell" && /node.*--test/.test(event.input.command)
      ? readFileSync(${JSON.stringify(join(project, "source.js"))}, "utf8") : undefined
    trace.push({id:event.id,sessionID:event.sessionID,tool:event.tool,input:event.input,checkSource})
    if (event.tool === "shell" && /\\bpush\\b/.test(event.input.command)) throw new Error("Fixture forbids push")
  })
  await ctx.session.hook("context", event => {
    trace.push({agent:event.agent,model:event.model})
    if (event.agent === "foreman-reviewer" && !reviewers.has(event.sessionID)) {
      reviewers.add(event.sessionID)
      if (${blocking}) {
        const source = ${JSON.stringify(join(project, "source.js"))}
        const before = readFileSync(source, "utf8")
        injections.push({sessionID:event.sessionID,before,toolIndex:trace.length})
        // Introduce a real defect at each review boundary; never replace reviewer output.
        writeFileSync(source, "export const value = 0\\n")
      }
    }
  })
  await ctx.command.transform(editor => editor.add({name:"exercise",execute:async () => {
    const session = await ctx.session.create()
    const git = (...args) => execFileSync("git", args, {cwd:${JSON.stringify(project)},encoding:"utf8"}).trim()
    const baseline = git("rev-parse", "main")
    const turn = async (text, first = false) => {
      if (first) await ctx.session.command({sessionID:session.id,name:"foreman/start-task",text})
      else await ctx.session.prompt({sessionID:session.id,text})
      await ctx.session.wait({sessionID:session.id})
      const context = await ctx.session.context({sessionID:session.id})
      turns.push({text,context,branch:git("branch","--show-current"),head:git("rev-parse","HEAD"),status:git("status","--porcelain")})
      writeFileSync(${JSON.stringify(evidence)}, JSON.stringify({turns,trace,injections},null,2))
    }
    await turn(${JSON.stringify(issue ? "issue #42 Keep the change limited to source.js and its test." : "F01")}, true)
    assert.equal(git("status","--porcelain"), "", "Plan approval must precede edits")
    assert.equal(git("branch","--show-current"), "main")
    await turn("Test user: I approve the proposed plan and task branch. Implement, run checks and obtain the independent reviewer. You may run read-only Git inspection and node checks. Stop before committing; commit and merge are NOT approved.")
    if (${issue}) assert.match(git("branch", "--show-current"), /^issue-42-/)
    assert.equal(git("rev-parse","main"), baseline)
    assert.equal(git("rev-parse","HEAD"), baseline, "No commit without approval")
    assert.notEqual(git("branch","--show-current"), "main")
    assert.ok(trace.some(e => e.agent === "foreman-reviewer" && e.model.id === "gpt-6.1-sol" && e.model.variant === "high"))
    assert.ok(reviewers.size, "Independent review session required")
    const reviews = []
    for (const sessionID of reviewers) {
      const reviewed = await ctx.session.get({sessionID})
      assert.notEqual(reviewed.outcome, "failed", "Independent review must not fail")
      const context = await ctx.session.context({sessionID})
      const text = context.filter(m => m.type === "assistant").flatMap(m => m.content || []).filter(p => p.type === "text").map(p => p.text).join("\\n")
      reviews.push({sessionID,context})
      assert.match(text, ${blocking ? '/Merge: no/' : '/Merge: yes/'}, "Independent review must return the expected verdict")
      assert.doesNotMatch(text, ${blocking ? '/Merge: yes/' : '/Merge: no/'})
      if (${blocking}) {
        const parts = context.filter(m => m.type === "assistant").flatMap(m => m.content || [])
        assert.ok(parts.some(p => p.type === "tool" && p.name === "read" && p.state?.status === "completed" && p.state.input.path.endsWith("source.js")), "Reviewer must read injected source")
        assert.match(text, /source\\.js/i, "Reviewer must identify the defective file")
        assert.match(text, /(?:value|export|return|constant).{0,100}(?:0|zero)|(?:0|zero).{0,100}(?:1|one)/is, "Reviewer must identify the incorrect value")
        assert.match(text, /must.fix/i, "Defect must be blocking")
      }
    }
    writeFileSync(${JSON.stringify(evidence)}, JSON.stringify({turns,trace,injections,reviews},null,2))
    if (${blocking}) {
      assert.equal(reviewers.size, 2, "Exactly two actual independent review sessions required")
      assert.equal(trace.filter(e => e.tool === "subagent").length, 2, "No third review or delegation")
      for (const injection of injections) assert.match(injection.before, /value\\s*=\\s*1/, "Implementation must fix the defect before each review")
      const between = trace.slice(injections[0].toolIndex, injections[1].toolIndex)
      const parts = turns.at(-1).context.filter(m => m.type === "assistant").flatMap(m => m.content || [])
      assert.ok(between.some(e => /value\\s*=\\s*1/.test(e.checkSource || "")
        && /^node --test source\\.test\\.js$/.test(e.input.command.trim())
        && parts.some(p => p.id === e.id && p.state?.status === "completed" && p.state.metadata?.exit === 0)), "Successfully run configured check on fixed source between reviews")
      const answer = turns.at(-1).context.filter(m => m.type === "assistant").flatMap(m => m.content || []).filter(p => p.type === "text").map(p => p.text).join("\\n")
      assert.match(answer, /second|two|2/i)
      assert.match(answer, /hand.{0,30}(?:back|off)|stop|block/i)
      assert.equal(git("rev-list", "--all", "--count"), "1", "No commits anywhere after second blocking review")
      assert.ok(!trace.some(e => e.tool === "shell" && ${forbiddenGit}.test(e.input.command)), "No commit, merge or push attempts")
      return
    }
    await turn("Test user: I approve the proposed commit only. Make the commit now, then stop. Merge and branch deletion are NOT approved.")
    assert.notEqual(git("rev-parse","HEAD"), baseline)
    assert.equal(git("rev-parse","main"), baseline, "No merge without separate approval")
    await turn("Test user: I approve merging this reviewed commit into main and deleting the task branch. Do not push.")
    assert.equal(git("branch","--show-current"), "main")
    assert.notEqual(git("rev-parse","main"), baseline)
    assert.equal(git("status","--porcelain"), "")
    assert.ok(!trace.some(e => e.tool === "shell" && /\\bpush\\b/.test(e.input.command)))
  }}))
} }
`)
const config = join(sandbox, "opencode.json")
env.OPENCODE_CONFIG = config
writeFileSync(config, JSON.stringify({ plugins: [installed, fixture], model: "openai/gpt-6.1-sol#medium" }))
writeFileSync(join(project, ".foreman.md"), `# Fixture\nMain branch: main\nTracker: ${issue ? "None" : "tasks.md"}\nPlan: None\nExpected load: one user importing a constant; no concurrency or performance requirements.\nChecks: node --test source.test.js\nReview authorization: The fixture owner approves read-only Git inspection and the configured Node check during independent review. No additional conversational approval is needed for those checks.\nProtected data: none\nAsk first: commits and merges\nLevel A also covers: none\n`)
if (!issue) writeFileSync(join(project, "tasks.md"), "# Open findings\n## F01: Correct value\n**Model**: A\nStatus: Open\nChange source.js value from 0 to 1 and add source.test.js asserting it is 1.\n\n# Implemented\n| ID | Date | Change | Test |\n|---|---|---|---|\n")
const ghTrace = join(sandbox, "gh-reads.jsonl")
if (issue) {
  // Synthetic issue transport; the live-commands --issues suite tests real GitHub access.
  const bin = join(sandbox, "bin")
  mkdirSync(bin)
  env.PATH = `${bin}:${env.PATH}`
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(ghTrace)}, JSON.stringify(args) + "\\n")
if (!(${isIssueRead.toString()})(args)) process.exit(1)
console.log(JSON.stringify({number:42,url:"https://github.com/fixture/consumer/issues/42",title:"Correct exported value",state:"OPEN",body:"Model: A\\nChange source.js value from 0 to 1 and add source.test.js asserting it is 1. No other behavior is required."}))
`, { mode: 0o755 })
}
writeFileSync(join(project, "package.json"), '{"type":"module"}')
writeFileSync(join(project, "source.js"), "export const value = 0\n")
run("git", ["init", "-b", "main"], project)
if (issue) run("git", ["remote", "add", "origin", "https://github.com/fixture/consumer.git"], project)
run("git", ["config", "user.name", "Fixture"], project)
run("git", ["config", "user.email", "fixture@example.invalid"], project)
run("git", ["add", "."], project)
run("git", ["commit", "-m", "baseline"], project)
const session = JSON.parse(run("opencode", ["api", "--standalone", "post", "/api/session", "--data", "{}"], project)).data
run("opencode", ["api", "--standalone", "post", "/api/session/" + session.id + "/command", "--data", JSON.stringify({name:"exercise",text:""})], project)
if (blocking) {
  assert.match(readFileSync(join(project, "source.js"), "utf8"), /value\s*=\s*0/)
  assert.equal(run("git", ["rev-list", "--all", "--count"], project).trim(), "1")
} else {
  assert.match(readFileSync(join(project, "source.js"), "utf8"), /value\s*=\s*1/)
  run("node", ["--test", "source.test.js"], project)
  assert.equal(run("git", ["branch", "--format=%(refname:short)"], project).trim(), "main")
}
if (issue) {
  const reads = readFileSync(ghTrace, "utf8").trim().split("\n").map(line => JSON.parse(line))
  assert.ok(reads.length > 0)
  assert.ok(reads.every(isIssueRead), "No GitHub writes")
  assert.ok(!automaticClosing.test(run("git", ["log", "--format=%B"], project)), "No automatic-closing commit text")
  assert.ok(!readFileSync(join(project, ".foreman.md"), "utf8").includes("Tracker: tasks.md"))
}
console.log(`PASS ${issue ? "synthetic issue " : ""}${blocking ? "second blocking review handback" : "approved workflow"}: ${sandbox}`)
