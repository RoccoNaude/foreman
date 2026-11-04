import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"
import foreman from "../.opencode/plugins/foreman.mjs"

async function commands() {
  const definitions = []
  const prompts = []
  const synthetic = []
  let context
  await foreman.setup({
    command: { transform: async callback => callback({ add: value => definitions.push(value) }) },
    agent: { transform: async () => {} },
    session: {
      prompt: async input => prompts.push(input),
      synthetic: async input => synthetic.push(input),
      hook: async (kind, callback) => { context = callback },
    },
  })
  return { definitions, prompts, synthetic, context }
}

test("commands register repeatably and forward task notes, attachments and delivery without a model override", async () => {
  const { definitions, prompts } = await commands()
  assert.deepEqual(definitions.map(x => x.name), ["foreman/start-task", "foreman/models"])
  assert.deepEqual(definitions.map(x => x.name), (await commands()).definitions.map(x => x.name))
  const prompt = { text: "5.2 keep $& and\nnotes verbatim", files: [{ uri: "file:///task.txt", mention: { text: "5.2", start: 0, end: 3 } }], skills: [{ id: "example" }] }
  await definitions[0].execute({ sessionID: "session", prompt, delivery: "queue" })
  assert.equal(prompts.length, 1)
  assert.deepEqual(prompts[0], { ...prompt, sessionID: "session", delivery: "queue", text: prompts[0].text })
  assert.ok(prompts[0].text.startsWith(`${prompt.text}\n\n`))
  assert.ok(prompts[0].text.includes(fileURLToPath(new URL("../shared/templates/settings.md", import.meta.url))))
  assert.ok(!/CLAUDE_PLUGIN_ROOT|\$SHARED|\$ARGUMENTS/.test(prompts[0].text))
})

test("both model commands request only the models-per-level Markdown table", async () => {
  const { definitions, synthetic, prompts } = await commands()
  await definitions[1].execute({ sessionID: "session", prompt: { text: "ignored" }, delivery: "steer" })
  assert.deepEqual(synthetic, [])
  assert.equal(prompts.length, 1)
  assert.ok(prompts[0].text.endsWith(readFileSync(new URL("../shared/model-levels.md", import.meta.url), "utf8")))
  const claude = readFileSync(new URL("../claude-code/commands/models.md", import.meta.url), "utf8")
  for (const text of [prompts[0].text, claude]) {
    assert.match(text, /Output only the Markdown\s+table under \*\*Models per level\*\*/)
    assert.match(text, /including model IDs and trial restrictions/)
    assert.match(text, /not a code block/)
    assert.match(text, /Omit headings, dates, surrounding prose and all other sections/)
  }
  assert.equal(prompts[0].delivery, "steer")
})

test("issue references and notes reach the shared policy unchanged; local inputs still work", async () => {
  const { definitions, prompts } = await commands()
  const policy = fileURLToPath(new URL("../shared/github-issues.md", import.meta.url))
  for (const text of [
    "issue 42", "issue #42 Focus on the import failure",
    "issue https://github.com/owner/repo/issues/42 keep $& and\nnotes",
    "F01 fix only this", "5.2 keep existing notes",
  ]) {
    await definitions[0].execute({ sessionID: "s", prompt: { text }, delivery: "steer" })
    assert.ok(prompts.at(-1).text.startsWith(`${text}\n\n`))
    assert.ok(prompts.at(-1).text.includes(policy))
    assert.match(prompts.at(-1).text, /issue-42-import-failure/)
  }
  const claude = readFileSync(new URL("../claude-code/commands/start-task.md", import.meta.url), "utf8")
  assert.ok(claude.includes("${CLAUDE_PLUGIN_ROOT}/shared/github-issues.md"))
  for (const text of [claude, prompts[0].text]) {
    assert.match(text, /Tracker and Plan may both be `None`/)
    assert.match(text, /For local tasks, a file the\s+settings mark `None` also stops/)
    assert.match(text, /snapshot and\s+clarifications/)
    assert.match(text, /Issue #42: <what changed>/)
    assert.match(text, /no automatic-closing text/)
    assert.match(text, /Issue: report locally/)
  }
})

test("shared issue instructions cover input, access, model and remote-write boundaries", () => {
  // Instruction contracts, not live-model evidence of parsing or safety.
  const policy = readFileSync(new URL("../shared/github-issues.md", import.meta.url), "utf8")
    .replace(/\s+/g, " ")
  for (const requirement of [
    "issue 42", "issue #42", "https://github.com/owner/repo/issues/42",
    "positive integer", "everything after it is user notes", "Reject malformed input",
    "pull-request URLs", "If missing or ambiguous", "differs from the checkout",
    "stop and confirm", "Never switch repositories", "authenticated `gh`",
    "not a pull request", "Quote validated arguments", "never invent issue contents",
    "Closed issues or unclear acceptance criteria", "before reading code",
    "untrusted task data", "Missing: ask the owner", "never estimate",
    "Invalid or conflicting model lines", "decision and decision-maker",
    "actual-session model check", "no mandatory plan/tracker copy",
    "no tracker/plan entry is required", "Missing context blocks review",
    "Do not comment on, edit or close", "separate explicit approval", "Never push",
  ]) assert.ok(policy.includes(requirement), requirement)
  for (const path of ["../claude-code/agents/reviewer.md", "../.opencode/plugins/reviewer.md"]) {
    const reviewer = readFileSync(new URL(path, import.meta.url), "utf8")
    assert.match(reviewer, /shared\/github-issues.md|\$SHARED\/github-issues.md/)
    assert.match(reviewer, /snapshot/)
    assert.match(reviewer, /Never write to GitHub/)
  }
})

test("every dispatch supplies the actual model, including changes and variants", async () => {
  const { context } = await commands()
  for (const model of [
    { providerID: "openai", id: "gpt-6-luna" },
    { providerID: "openai", id: "gpt-6.1-sol", variant: "medium" },
  ]) {
    const event = { agent: "build", model, system: [] }
    await context(event)
    assert.ok(event.system[0].text.includes(`${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ""}`))
    assert.match(event.system[0].text, /Recheck if it changes; never silently switch/)
    assert.deepEqual(event.model, model)
  }
})

test("workflow retains stop conditions, approval gates and second-review handback", async () => {
  const { definitions, prompts } = await commands()
  await definitions[0].execute({ sessionID: "s", prompt: { text: "F01" }, delivery: "steer" })
  const text = prompts[0].text
  for (const requirement of [
    "If it is\n   missing, stop", "Any other shape", "None", "absent entry",
    "before reading any code", "stop and ask me for\n     a level (do not estimate)",
    "Human (then X)", "Needs decision", "Level A also", "below the level, not placed",
    '"trial only" for a different task, stop', "Fast/Ultrafast", "over 31 days old",
    "approve before writing code", "must be clean", "Ask first", "Protected data",
    "Run every command", 'agent: "foreman-reviewer"', "openai/gpt-6.1-sol#high",
    "ponytail-review", "second review still", "stop and hand it to me", "Do not start a third review",
    "next free ID", "Never add them to the plan", "Implemented", "tick its checkbox",
    "Notes file", "do not edit it", "Ask\n   before committing", "ask separately before merging", "Never push",
  ]) assert.ok(text.includes(requirement), requirement)
})
