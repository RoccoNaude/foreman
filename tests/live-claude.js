// Opt-in, token-consuming Claude Code issue workflow: node tests/live-claude.js
// Installs this checkout as a plugin into isolated config under .tmp/, then drives
// /foreman:start-task through owner clarification and separate approvals.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const model = "claude-opus-5-5"
const automaticClosing = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?):?\s+(?:(?:[\w.-]+\/[\w.-]+)?#\d+|https:\/\/github\.com\/\S+\/issues\/\d+)/i
for (const keyword of ["fix", "fixes", "fixed", "close", "closes", "closed", "resolve", "resolves", "resolved"]) assert.ok(automaticClosing.test(`${keyword} #42`))
for (const text of ["Issue #42: correct exported value", "Issue #42: Fix exported value"]) assert.ok(!automaticClosing.test(text))
const isIssueRead = args => (args[0] === "issue" && args[1] === "view")
  || (args[0] === "api" && args[1] === "repos/fixture/consumer/issues/42" && args.slice(2).every((arg, i, rest) => arg === "--jq" ? i + 1 < rest.length : rest[i - 1] === "--jq"))
assert.ok(isIssueRead(["api", "repos/fixture/consumer/issues/42", "--jq", ".title"]))
for (const args of [["api", "repos/fixture/consumer/issues/42", "-X", "PATCH"], ["api", "repos/fixture/consumer/issues/42", "--jq", ".t", "-f", "state=closed"], ["issue", "close", "42"]]) assert.ok(!isIssueRead(args))
const forbiddenShell = /\bpush\b|\bgh\b[^;&|\n]*(?:^|\s)(?:auth|comment|edit|close|reopen|create|delete|--method|-X|-f|-F|--field|--raw-field|--input)(?=[\s=]|$)/
for (const command of ["git push", "git push origin main", "gh issue close 42", "gh issue comment 42 -b x", "gh api -X PATCH repos/x", "gh api repos/x --method=PATCH", "gh auth login"]) assert.ok(forbiddenShell.test(command))
for (const command of ["gh issue view 42 --repo fixture/consumer --json number,url,title,body,state", "git status --short", "node --test source.test.js"]) assert.ok(!forbiddenShell.test(command))

const credentialsFile = join(process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME, ".claude"), ".credentials.json")
const oauth = JSON.parse(readFileSync(credentialsFile, "utf8")).claudeAiOauth
assert.ok(oauth?.accessToken, "Claude Code OAuth login required")
// Only the short-lived access token is passed, in memory; the refresh token never leaves the owner's config.
assert.ok(oauth.expiresAt - Date.now() > 60 * 60_000, "Access token expires within an hour; start Claude Code once to refresh it, then rerun")

mkdirSync(join(root, ".tmp"), { recursive: true })
const sandbox = mkdtempSync(join(root, ".tmp/live-claude-"))
// Shields the CommonJS gh fixture from the repository's "type": "module".
writeFileSync(join(sandbox, "package.json"), '{"private":true}')
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("CLAUDE") && !key.startsWith("ANTHROPIC")))
for (const [key, name] of Object.entries({ HOME: "home", CLAUDE_CONFIG_DIR: "config", XDG_CONFIG_HOME: "xdg-config", TMPDIR: "tmp" })) {
  env[key] = join(sandbox, name)
  mkdirSync(env[key], { recursive: true })
}
function run(command, args, cwd = sandbox, extra = {}) {
  return execFileSync(command, args, { cwd, env: { ...env, ...extra, PWD: cwd }, encoding: "utf8", timeout: 1_800_000, maxBuffer: 64 * 1024 * 1024 })
}

// Install the working tree's tracked files, as the Claude Code marketplace would.
const source = join(sandbox, "plugin")
mkdirSync(source)
execFileSync("bash", ["-c", 'git ls-files -z | xargs -0 tar -cf - | tar -xf - -C "$0"', source], { cwd: root })
run("claude", ["plugin", "marketplace", "add", source])
run("claude", ["plugin", "install", "foreman@foreman"])

const project = join(sandbox, "consumer")
const bin = join(sandbox, "bin")
mkdirSync(project)
mkdirSync(bin)
const ghTrace = join(sandbox, "gh-calls.jsonl")
const shellTrace = join(sandbox, "shell-calls.jsonl")
env.PATH = `${bin}:${env.PATH}`
// Synthetic issue transport with no Model line, so start-task must ask the owner for a level.
writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(ghTrace)}, JSON.stringify(args) + "\\n")
if (!(${isIssueRead.toString()})(args)) process.exit(1)
console.log(JSON.stringify({number:42,url:"https://github.com/fixture/consumer/issues/42",title:"Correct exported value",state:"OPEN",body:"Change source.js value from 0 to 1 and add source.test.js asserting it is 1. No other behavior is required."}))
`, { mode: 0o755 })
const guard = join(sandbox, "guard.cjs")
writeFileSync(guard, `const { appendFileSync, readFileSync } = require("node:fs")
const event = JSON.parse(readFileSync(0, "utf8"))
const command = event.tool_input?.command || ""
appendFileSync(${JSON.stringify(shellTrace)}, JSON.stringify({ command, agent: event.agent_type || null }) + "\\n")
if (${forbiddenShell}.test(command)) { console.error("Fixture forbids push and GitHub writes"); process.exit(2) }
`)
const settings = join(sandbox, "settings.json")
writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node ${JSON.stringify(guard)}` }] }] } }))

writeFileSync(join(project, ".foreman.md"), "# Fixture\nMain branch: main\nTracker: None\nPlan: None\nExpected load: one user importing a constant; no concurrency or performance requirements.\nChecks: node --test source.test.js\nReview authorization: The fixture owner approves read-only Git inspection and the configured Node check during independent review. No additional conversational approval is needed for those checks.\nProtected data: none\nAsk first: commits and merges\nLevel A also covers: none\n")
writeFileSync(join(project, "package.json"), '{"type":"module"}')
writeFileSync(join(project, "source.js"), "export const value = 0\n")
const git = (...args) => run("git", args, project).trim()
git("init", "-b", "main")
git("remote", "add", "origin", "https://github.com/fixture/consumer.git")
git("config", "user.name", "Fixture")
git("config", "user.email", "fixture@example.invalid")
git("add", ".")
git("commit", "-m", "baseline")
const baseline = git("rev-parse", "main")

const evidence = join(sandbox, "evidence.json")
const turns = []
let sessionID
function turn(text) {
  const args = ["-p", text, "--model", model, "--effort", "medium", "--output-format", "stream-json", "--verbose",
    "--settings", settings, "--permission-mode", "acceptEdits", "--allowedTools", "Bash Read Edit Write Glob Grep Agent Skill"]
  if (sessionID) args.push("--resume", sessionID)
  const events = run("claude", args, project, { CLAUDE_CODE_OAUTH_TOKEN: oauth.accessToken })
    .split("\n").filter(Boolean).map(line => JSON.parse(line))
  const result = events.findLast(event => event.type === "result")
  assert.ok(result && !result.is_error, `Turn failed: ${result?.result}`)
  sessionID = result.session_id
  turns.push({ text, events, answer: result.result, branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD"), status: git("status", "--porcelain") })
  writeFileSync(evidence, JSON.stringify(turns, null, 2))
  return result.result
}
const assistant = events => events.filter(event => event.type === "assistant")
const toolUses = events => assistant(events).flatMap(event => (event.message.content || []).filter(part => part.type === "tool_use").map(part => ({ ...part, parent: event.parent_tool_use_id })))

let answer = turn("/foreman:start-task issue #42 Keep the change limited to source.js and its test.")
const init = turns[0].events.find(event => event.type === "system" && event.subtype === "init")
assert.ok(init?.model?.startsWith(model), "Session model")
assert.ok(toolUses(turns[0].events).some(tool => tool.name === "Bash" && /gh issue view|gh api/.test(tool.input.command)), "Issue must be fetched")
assert.match(answer, /level/i)
assert.match(answer, /\?|which|provide|confirm|choose/i, "Must ask the owner for the missing level")
assert.ok(!toolUses(turns[0].events).some(tool => (tool.name === "Read" && /source\.js$/.test(tool.input.file_path || ""))
  || (tool.name === "Bash" && /source\.js/.test(tool.input.command || ""))), "No code read before the level is agreed")
assert.equal(git("status", "--porcelain"), "")
assert.equal(git("branch", "--show-current"), "main")

answer = turn("Test user: use level A for this issue. Continue to the plan and stop for my approval.")
assert.match(answer, /Opus 5\.5|claude-opus-5-5/, "Session model must be checked against the agreed level")
assert.equal(git("status", "--porcelain"), "", "Plan approval must precede edits")
assert.equal(git("branch", "--show-current"), "main")

turn("Test user: I approve the proposed plan and task branch. Implement, run checks and obtain the independent reviewer. You may run read-only Git inspection and node checks. Stop before committing; commit and merge are NOT approved.")
assert.match(git("branch", "--show-current"), /^issue-42-/)
assert.equal(git("rev-parse", "HEAD"), baseline, "No commit without approval")
assert.equal(git("rev-parse", "main"), baseline)
const events = turns.at(-1).events
const reviews = toolUses(events).filter(tool => ["Agent", "Task"].includes(tool.name) && tool.input.subagent_type === "foreman:reviewer")
assert.equal(reviews.length, 1, "Exactly one independent review")
const [review] = reviews
// Headless Claude Code may expose no Agent effort parameter; then start-task must disclose it (#27).
const effortSet = review.input.effort === "high"
if (!effortSet) {
  assert.equal(review.input.effort, undefined, "Level A review effort must be high when set")
  assert.match(review.input.prompt, /effort/i, "Unset review effort must be disclosed")
  console.warn("WARNING: reviewer Agent call had no effort parameter; level A high effort not applied")
}
for (const part of ["https://github.com/fixture/consumer/issues/42", "Correct exported value", "source.js"]) assert.ok(review.input.prompt.includes(part), `Reviewer snapshot must include ${part}`)
assert.match(review.input.prompt, /level[^\n]{0,40}\bA\b|\bA\b[^\n]{0,40}level/i, "Reviewer snapshot must include the agreed level")
assert.match(review.input.prompt, /clarif|owner|test user|agreed/i, "Reviewer snapshot must include the owner clarification")
const reviewer = assistant(events).filter(event => event.parent_tool_use_id === review.id)
assert.ok(reviewer.length, "Reviewer transcript must be present")
assert.ok(reviewer.every(event => event.message.model?.startsWith(model)), "Reviewer must run on its fixed model")
const verdict = events.find(event => event.type === "user" && (event.message.content || []).some(part => part.type === "tool_result" && part.tool_use_id === review.id))
assert.ok(verdict && !verdict.message.content.find(part => part.tool_use_id === review.id).is_error, "Independent review must not fail")
assert.match(JSON.stringify(verdict.message.content), /Merge: yes/, "Independent review must approve")

turn("Test user: I approve the proposed commit only. Make the commit now, then stop. Merge and branch deletion are NOT approved.")
assert.notEqual(git("rev-parse", "HEAD"), baseline)
assert.equal(git("rev-parse", "main"), baseline, "No merge without separate approval")
turn("Test user: I approve merging this reviewed commit into main and deleting the task branch. Do not push.")
assert.equal(git("branch", "--show-current"), "main")
assert.notEqual(git("rev-parse", "main"), baseline)
assert.equal(git("status", "--porcelain"), "")
assert.equal(git("branch", "--format=%(refname:short)"), "main")
assert.match(readFileSync(join(project, "source.js"), "utf8"), /value\s*=\s*1/)
run("node", ["--test", "source.test.js"], project)

const reads = readFileSync(ghTrace, "utf8").trim().split("\n").map(line => JSON.parse(line))
assert.ok(reads.length && reads.every(isIssueRead), "No GitHub writes")
const shells = readFileSync(shellTrace, "utf8").trim().split("\n").map(line => JSON.parse(line))
assert.ok(!shells.some(call => forbiddenShell.test(call.command)), "No push or GitHub write attempts")
assert.ok(!automaticClosing.test(git("log", "--format=%B")), "No automatic-closing commit text")
console.log(`PASS Claude Code synthetic issue workflow${effortSet ? "" : " (reviewer effort not settable)"}: ${sandbox}`)
