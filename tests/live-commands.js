// Opt-in, token-consuming workflow checks: node tests/live-commands.js
// Real issue reads: --issues --open-issue N --closed-issue N (read-only; N in the origin remote's GitHub repository)
// Synthetic issue failure paths: --issue-cases (fake gh; no GitHub access)
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const argv = process.argv.slice(2)
const option = name => { const value = argv[argv.indexOf(name) + 1]; return argv.includes(name) ? value : undefined }
const real = argv.includes("--issues")
const cases = argv.includes("--issue-cases")
const issues = real || cases
// Real reads target this checkout's own GitHub repository, so forks test themselves.
const repo = real ? execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim().match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] : undefined
if (real) assert.ok(repo, "origin must be a GitHub remote")
const openIssue = option("--open-issue"), closedIssue = option("--closed-issue")
if (real) assert.ok(/^[1-9]\d*$/.test(openIssue) && /^[1-9]\d*$/.test(closedIssue), "--issues needs --open-issue N and --closed-issue N")
const issueNumbers = real ? `(?:${openIssue}|${closedIssue})` : "[a-zA-Z0-9]+"
const repoPattern = real ? repo.replace(/[.]/g, "\\.") : "[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+"
// gh api: GET only, optionally --jq last; the jq text may not contain " -", so no flag (attached or combined) can follow.
const allowedIssueShell = new RegExp(`^(?:gh api repos/${repoPattern}/issues/${issueNumbers}(?: --jq (?:(?!\\s-)[^;&|<>\`$\\n])+)?|gh issue view (?:${issueNumbers}|https://github\\.com/${repoPattern}/issues/${issueNumbers})(?: --repo ${repoPattern}| --json [a-zA-Z0-9_,]+)*|git remote -v|git remote get-url (?:origin|upstream))$`)
if (real) {
  for (const command of [`gh issue view ${openIssue} --repo ${repo} --json number,url,title,body,state`, `gh issue view https://github.com/${repo}/issues/${closedIssue}`, `gh api repos/${repo}/issues/${openIssue} --jq {number, is_pull_request: has(pull_request)}`, "git remote -v"]) assert.match(command, allowedIssueShell)
  for (const command of [`gh issue close ${openIssue}`, `gh issue view ${openIssue}9`, `gh api repos/${repo}/issues/${openIssue} -X PATCH`, `gh api repos/${repo}/issues/${openIssue} --jq .title -f state=closed`, `gh api repos/${repo}/issues/${openIssue} --jq .title -XPATCH -fstate=closed`, `gh api repos/${repo}/issues/${openIssue} --jq .title -iXPATCH`, `gh api repos/${repo}/issues/${openIssue} -XPATCH`, `gh api repos/other/repo/issues/${openIssue}`, `gh issue view ${openIssue}; gh issue close ${openIssue}`, `gh issue view https://github.com/other/repo/issues/${openIssue}`, `gh issue view ${openIssue} --repo other/repo`]) assert.doesNotMatch(command, allowedIssueShell)
}
if (cases) {
  for (const command of ["gh issue view 42 --repo fixture/consumer --json number,url,title,body,state", "gh api repos/fixture/consumer/issues/42"]) assert.match(command, allowedIssueShell)
  for (const command of ["gh issue comment 42", "gh api -X PATCH repos/fixture/consumer/issues/42", "gh api repos/fixture/consumer/issues/42 --method PATCH", "gh api repos/fixture/consumer/issues/42 --jq .t -XPATCH -fstate=closed", "gh api repos/fixture/consumer/issues/42 --jq .t -iXPATCH", "gh api repos/fixture/consumer/issues/42 --jq .x; gh issue close 42", "gh auth login", "gh issue view 42 && gh issue close 42"]) assert.doesNotMatch(command, allowedIssueShell)
}
const ghConfig = process.env.GH_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(process.env.HOME, ".config"), "gh")
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
if (real) env.GH_CONFIG_DIR = resolve(ghConfig)
const basePath = env.PATH
// The harness reads expected values itself, so the fixture issues are never hard-coded.
const expected = {}
if (real) for (const [number, state] of [[openIssue, "OPEN"], [closedIssue, "CLOSED"]]) {
  const issue = JSON.parse(execFileSync("gh", ["issue", "view", number, "--repo", repo, "--json", "number,url,title,body,state"], { env, encoding: "utf8", timeout: 60_000 }))
  assert.equal(issue.state, state, `#${number} must be ${state}`)
  const levels = issue.body.split(/\r?\n/).filter(line => /^\s*Model:/i.test(line))
  if (state === "OPEN") assert.ok(levels.length === 1 && /^\s*Model: (?:A|B|C)\s*$/.test(levels[0]), `#${number} needs exactly one Model: A|B|C line`)
  expected[state] = { ...issue, level: levels[0]?.trim().split(" ")[1] }
}
const isIssueRead = args => (args[0] === "issue" && args[1] === "view")
  || (args[0] === "api" && /^repos\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(args[1] || "") && args.slice(2).every((arg, i, rest) => arg === "--jq" ? i + 1 < rest.length : rest[i - 1] === "--jq"))
assert.ok(isIssueRead(["api", "repos/fixture/consumer/issues/42", "--jq", ".title"]) && isIssueRead(["issue", "view", "42"]))
for (const args of [["api", "repos/fixture/consumer/issues/42", "-X", "PATCH"], ["api", "repos/fixture/consumer/issues/42", "--jq", ".t", "-f", "state=closed"], ["issue", "close", "42"], ["auth", "login"]]) assert.ok(!isIssueRead(args))
// Real mode checks gh's actual argv (after shell expansion), not command text.
const isRealRead = (args, repo, numbers) => {
  const [command, sub, ...rest] = args
  if (command === "api") return numbers.some(n => sub === `repos/${repo}/issues/${n}`)
    && (rest.length === 0 || (rest.length === 2 && rest[0] === "--jq" && !rest[1].startsWith("-")))
  if (command !== "issue" || sub !== "view") return false
  const refs = numbers.flatMap(n => [n, `https://github.com/${repo}/issues/${n}`])
  let positional = 0
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--repo" && rest[i + 1] === repo) i++
    else if (rest[i] === "--json" && /^[\w,]+$/.test(rest[i + 1] || "")) i++
    else if (refs.includes(rest[i]) && !positional++) continue
    else return false
  }
  return positional === 1
}
for (const args of [["issue", "view", "26", "--repo", "o/r", "--json", "number,url,title,body,state"], ["issue", "view", "https://github.com/o/r/issues/16"], ["api", "repos/o/r/issues/26", "--jq", "{number, is_pull_request: has(pull_request)}"], ["api", "repos/o/r/issues/16"]]) assert.ok(isRealRead(args, "o/r", ["26", "16"]))
for (const args of [["api", "repos/o/r/issues/26", "--jq", ".title", "-XPATCH", "-fstate=closed"], ["api", "repos/o/r/issues/26", "--jq", "-XPATCH"], ["api", "repos/o/r/issues/26", "-XPATCH"], ["api", "repos/x/y/issues/26"], ["issue", "view", "26", "--repo", "x/y"], ["issue", "view", "27"], ["issue", "view", "26", "16"], ["issue", "view", "26", "--web"], ["issue", "close", "26"], ["issue", "view"]]) assert.ok(!isRealRead(args, "o/r", ["26", "16"]))
const realGh = real ? execFileSync("bash", ["-c", "command -v gh"], { encoding: "utf8" }).trim() : undefined
const plain = value => value.toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ")
const fixtureIssue = (body, extra = {}) => ({ number: 42, url: "https://github.com/fixture/consumer/issues/42", title: "Correct exported value", state: "OPEN", body: `${body}\nChange source.js value from 0 to 1 and add source.test.js asserting it is 1.`, ...extra })
const synthetic = {
  "case-missing-level": { body: "" , expect: [/level/i, /\?|ask|which|provide|confirm|choose/i] },
  "case-invalid-level": { body: "Model: D", expect: [/invalid|unclear|not (?:a )?valid|unrecogni[sz]ed|clarif/i] },
  "case-conflicting-level": { body: "Model: A\nModel: C", expect: [/conflict|two|multiple|both|clarif/i] },
  "case-human-unresolved": { body: "Model: Human (then B)\nDecision needed: the finance lead must choose the rounding rule.", expect: [/decision|decide|human/i, /finance lead|rounding/i] },
  "case-auth-failure": { fail: "To get started with GitHub CLI, please run:  gh auth login", expect: [/auth|log ?in|sign.?in|access|credential/i] },
  "case-pr-object": { body: "Model: A", extra: { url: "https://github.com/fixture/consumer/pull/42" }, expect: [/pull.request|not an issue|\bPR\b/i] },
  "case-no-remote": { remotes: [], expect: [/remote|repositor/i] },
  "case-ambiguous-fork": { remotes: [["origin", "https://github.com/someone/consumer.git"], ["upstream", "https://github.com/fixture/consumer.git"]], expect: [/fork|upstream|ambiguous|which repositor/i] },
  "case-cross-repository": { ref: "https://github.com/other/project/issues/42", body: "Model: A", expect: [/other\/project/i, /confirm|differ|belong|this checkout|mismatch/i] },
  "case-malformed": { ref: "4x2", expect: [/invalid|malformed|positive integer|not a (?:valid )?(?:number|reference)|format/i] },
}
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

const scenarios = real ? ["issue-number", "issue-url", "issue-closed", "issue-pr"] : cases ? Object.keys(synthetic)
  : ["missing", "invalid", "absent", "level", "model", "second-review", "models"]
for (const scenario of scenarios) {
  const project = join(sandbox, scenario)
  mkdirSync(project)
  env.OPENCODE_CONFIG = join(project, "opencode.json")
  run("git", ["init", "-b", "main"], project)
  const trace = join(project, "trace.jsonl")
  const result = join(project, "result.json")
  const fixture = join(project, "fixture")
  mkdirSync(fixture)
  writeFileSync(join(fixture, "package.json"), '{"name":"command-fixture","type":"module","exports":"./index.js"}')
  const spec = synthetic[scenario]
  const issueRef = cases ? spec.ref || "#42" : scenario === "issue-url" ? `https://github.com/${repo}/issues/${openIssue}`
    : scenario === "issue-pr" ? `https://github.com/${repo}/pull/${openIssue}` : scenario === "issue-closed" ? `#${closedIssue}` : `#${openIssue}`
  // The closed case gets no stop instruction, so only the closed-issue rule can stop it.
  const task = cases || scenario === "issue-closed" ? `issue ${issueRef} Keep the change limited to source.js and its test. If the workflow requires you to stop or ask me anything, stop and explain why.`
    : issues ? `issue ${issueRef} Acceptance test: stop after fetching the issue and checking its model level. Report its canonical URL, title and level. Do not read project source, implement, branch, review, commit or write to GitHub.`
    : scenario === "invalid" ? "BAD" : scenario === "second-review"
    ? "F01 Resume checkpoint at step 6: I approved the plan and branch earlier. The first independent review had Must fix findings, fixes and checks completed, and the second independent review still reports Must fix: source.js returns the wrong value."
    : "F01"
  writeFileSync(join(fixture, "index.js"), `
import { appendFileSync, writeFileSync } from "node:fs"
export default { id: "command-fixture", async setup(ctx) {
  await ctx.tool.hook("execute.before", event => {
    appendFileSync(${JSON.stringify(trace)}, JSON.stringify({tool:event.tool,input:event.input}) + "\\n")
    if (${issues} && event.tool === "shell" && !${allowedIssueShell}.test(event.input.command.trim().replace(/['"]/g, "")))
      throw new Error("Acceptance guard permits only issue reads and remote inspection")
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
      ...["read", "glob", "grep", ...(issues ? ["shell"] : [])].map(action => ({ action, resource: "*", effect: "allow" }))],
  }))
  if (scenario !== "missing") writeFileSync(join(project, ".foreman.md"), `# Settings\nMain branch: main\nTracker: ${issues ? "None" : "tasks.md"}\nPlan: None\nChecks: node --test\nProtected data: none\nLevel A also covers: none\n`)
  if (real) run("git", ["remote", "add", "origin", `https://github.com/${repo}.git`], project)
  const ghTrace = join(project, "gh-calls.jsonl")
  env.PATH = basePath
  if (cases) {
    for (const [name, url] of spec.remotes ?? [["origin", "https://github.com/fixture/consumer.git"]]) run("git", ["remote", "add", name, url], project)
    // Synthetic issue transport: logs every call; anything but an issue read fails.
    const bin = join(project, "bin")
    mkdirSync(bin)
    env.PATH = `${bin}:${basePath}`
    writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(ghTrace)}, JSON.stringify(args) + "\\n")
if (!(${isIssueRead.toString()})(args)) process.exit(1)
${spec.fail ? `console.error(${JSON.stringify(spec.fail)}); process.exit(4)` : `console.log(${JSON.stringify(JSON.stringify(fixtureIssue(spec.body ?? "", spec.extra)))})`}
`, { mode: 0o755 })
  }
  if (real) {
    // Argument-level guard in front of the owner's real gh: logs every call, runs only exact issue reads.
    const bin = join(project, "bin")
    mkdirSync(bin)
    env.PATH = `${bin}:${basePath}`
    writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const { spawnSync } = require("node:child_process")
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(ghTrace)}, JSON.stringify(args) + "\\n")
if (!(${isRealRead.toString()})(args, ${JSON.stringify(repo)}, ${JSON.stringify([openIssue, closedIssue])})) { console.error("Acceptance guard permits only reads of the selected issues"); process.exit(1) }
process.exit(spawnSync(${JSON.stringify(realGh)}, args, { stdio: "inherit" }).status ?? 1)
`, { mode: 0o755 })
  }
  writeFileSync(join(project, "tasks.md"), `# Open findings\n## ${scenario === "absent" ? "F02" : "F01"}: Correct source\n**Model**: ${scenario === "level" ? "unknown" : "A"}\nStatus: Open\nFix source.js to return 1, with its test.\n`)
  writeFileSync(join(project, "source.js"), "export const value = 0\n")
  const output = run("opencode", ["api", "--standalone", "post", "/api/session", "--data", "{}"], project)
  const session = JSON.parse(output).data
  run("opencode", ["api", "--standalone", "post", `/api/session/${session.id}/command`, "--data", JSON.stringify({ name: "exercise", text: "" })], project)
  const messages = JSON.parse(readFileSync(result, "utf8"))
  const attempted = messages.filter(message => message.type === "assistant").flatMap(message => message.content || []).filter(part => part.type === "tool")
  assert.ok(attempted.every(part => ["read", "glob", "grep", ...(issues ? ["shell"] : [])].includes(part.name)), `${scenario}: forbidden attempted tool`)
  const text = messages.filter(message => message.type === "assistant").flatMap(message => message.content || []).filter(part => part.type === "text").map(part => part.text).join("\n")
  writeFileSync(join(project, "answer.txt"), text)
  const tools = readFileSync(trace, { encoding: "utf8", flag: "a+" }).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
  assert.ok(!tools.some(event => [...(issues ? [] : ["shell"]), "patch", "edit", "subagent"].includes(event.tool)), `${scenario}: forbidden action`)
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
  if (scenario === "models") {
    const section = readFileSync(join(root, "shared/model-levels.md"), "utf8").split("## Models per level\n")[1]
    assert.equal(text.trim(), section.match(/^\|[^\n]*(?:\n\|[^\n]*)*/m)[0])
  }
  if (cases) {
    for (const pattern of spec.expect) assert.match(text, pattern, `${scenario}: expected stop reason`)
    const calls = readFileSync(ghTrace, { encoding: "utf8", flag: "a+" }).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
    assert.ok(calls.every(isIssueRead), `${scenario}: GitHub write or sign-in attempted`)
  }
  if (real) {
    const calls = readFileSync(ghTrace, { encoding: "utf8", flag: "a+" }).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
    assert.ok(calls.every(args => isRealRead(args, repo, [openIssue, closedIssue])), `${scenario}: non-read gh arguments attempted`)
    if (scenario === "issue-pr") {
      assert.match(text, /pull.request|PR URL|not.*issue/i)
      assert.ok(!tools.some(event => event.tool === "shell" && /gh issue view/.test(event.input.command)))
    } else {
      const parts = messages.filter(m => m.type === "assistant").flatMap(m => m.content || [])
      assert.ok(parts.some(p => p.type === "tool" && p.name === "shell"
        && /gh issue view/.test(p.state?.input?.command || "")
        && p.state?.status === "completed" && p.state?.metadata?.exit === 0), "Real GitHub issue fetch must succeed")
      const issue = scenario === "issue-closed" ? expected.CLOSED : expected.OPEN
      assert.ok(text.includes(issue.url), `${scenario}: canonical URL`)
      assert.ok(plain(text).includes(plain(issue.title)), `${scenario}: title`)
      if (scenario === "issue-closed") {
        assert.match(text, /closed/i)
        assert.match(text, /clarif|confirm|reopen|proceed|should I|do you want|\?/i)
      }
      else assert.match(text, new RegExp(`(?:level|model)[^\\n]{0,40}\\b${issue.level}\\b`, "i"))
    }
  }
  if (issues) {
    // Blocked attempts never reach gh, so check every attempted shell command too.
    assert.ok(!tools.some(event => event.tool === "shell" && !allowedIssueShell.test(event.input.command.trim().replace(/['"]/g, ""))), `${scenario}: blocked shell command attempted`)
    assert.equal(run("git", ["branch", "--show-current"], project).trim(), "main")
  }
  assert.equal(readFileSync(join(project, "source.js"), "utf8"), "export const value = 0\n")
  console.log(`PASS ${scenario}: ${project}`)
}
console.log(`Live command evidence: ${sandbox}`)
