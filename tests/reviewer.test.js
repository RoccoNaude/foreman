import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"
import foreman from "../.opencode/plugins/foreman.mjs"

async function reviewer() {
  const agent = { model: { providerID: "cheap", id: "implementer" }, permissions: [] }
  await foreman.setup({ command: { transform: async () => {} }, session: { hook: async () => {} }, agent: { transform: async callback => callback({
    update(id, update) {
      assert.equal(id, "foreman-reviewer")
      update(agent)
    },
  }) } })
  return agent
}

test("reviewer replaces inherited model and privileges, and reload is repeatable", async () => {
  const agent = await reviewer()
  assert.deepEqual(agent.model, { providerID: "openai", id: "gpt-6.1-sol", variant: "high" })
  assert.equal(agent.mode, "subagent")
  assert.deepEqual(agent, await reviewer())
  assert.deepEqual(agent.permissions, [
    { action: "*", resource: "*", effect: "deny" },
    ...["read", "glob", "grep"].map(action => ({ action, resource: "*", effect: "allow" })),
    { action: "read", resource: "*.env", effect: "ask" },
    { action: "read", resource: "*.env.*", effect: "ask" },
    { action: "read", resource: "*.env.example", effect: "allow" },
    { action: "skill", resource: "ponytail-review", effect: "allow" },
    { action: "external_directory", resource: "*", effect: "ask" },
    { action: "shell", resource: "*", effect: "ask" },
  ])
})

test("dispatch guard blocks fallback models and variants, not other agents", async () => {
  let guard
  await foreman.setup({
    command: { transform: async () => {} },
    skill: { list: async () => ({ data: [] }) },
    agent: { transform: async () => {} },
    session: { hook: async (kind, callback) => { if (kind === "context") guard = callback } },
  })
  const model = { providerID: "openai", id: "gpt-6.1-sol", variant: "high" }
  const event = { agent: "foreman-reviewer", model, system: [] }
  await guard(event)
  assert.match(event.system[1].text, /unavailable.*manual fallback/)
  await guard({ agent: "build", model: {}, system: [] })
  for (const override of [{ id: "gpt-6-luna" }, { providerID: "proxy" }, { variant: undefined }]) {
    await assert.rejects(() => guard({ agent: "foreman-reviewer", model: { ...model, ...override }, system: [] }),
      /requires openai\/gpt-6.1-sol#high.*Review blocked/)
  }
})

test("shipped review policy keeps skill-first, fallback and incomplete-review boundaries", async () => {
  const { system } = await reviewer()
  assert.equal(system, readFileSync(new URL("../.opencode/plugins/reviewer.md", import.meta.url), "utf8")
    .replaceAll("$SHARED", fileURLToPath(new URL("../shared", import.meta.url))))
  assert.ok(system.includes(fileURLToPath(new URL("../shared/github-issues.md", import.meta.url))))
  assert.ok(!system.includes("$SHARED"))
  for (const requirement of [
    "Read `.foreman.md`", "Read the task entry", "task ID, branch, main branch, expected load",
    "including staged, uncommitted and untracked", "BEFORE independently inspecting",
    "do not duplicate", "Only if the skill is unavailable", "explicitly disclose",
    "read every changed and untracked file in full", "their callers", "covering\n   tests",
    "failed or denied skill execution is NOT unavailability", "Merge: no, fix failed skill execution first",
    "An empty\n   change is a finding", "checks can write", "All shell commands require approval",
    "Never run", "Protected", "Must fix", "Should fix", "Nice to have", "`file:line`",
    "If review is incomplete", "`Merge: yes`", "`Merge: no, fix <items> first`",
  ]) assert.ok(system.toLowerCase().includes(requirement.toLowerCase()), requirement)
})
