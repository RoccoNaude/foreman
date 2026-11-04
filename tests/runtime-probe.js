import assert from "node:assert/strict"

// Runs inside the isolated V2 server; no provider request is sent.
export async function probe(ctx) {
  const parent = await ctx.session.create({
    model: { providerID: "openai", id: "gpt-6-luna" },
  })
  const child = await ctx.session.create({ parentID: parent.id, agent: "foreman-reviewer" })
  let seen
  const capture = await ctx.session.hook("context", event => {
    if (event.sessionID !== child.id) return
    seen = { agent: event.agent, model: event.model }
    throw new Error("Foreman test: stop before provider dispatch")
  })
  try {
    await ctx.session.prompt({ sessionID: child.id, text: "Review task 9 on issue-9-reviewer" })
    await ctx.session.wait({ sessionID: child.id })
    assert.deepEqual(seen, {
      agent: "foreman-reviewer",
      model: { providerID: "openai", id: "gpt-6.1-sol", variant: "high" },
    })
  } finally {
    await capture.dispose()
  }

  // Observe the real permission evaluator; turn asks into denials so tests
  // never wait for a human or accidentally execute a check.
  let effect
  const permissions = await ctx.permission.hook("evaluate", event => {
    if (event.sessionID !== child.id) return
    effect = event.effect
    if (event.effect === "ask") event.effect = "deny"
  })
  try {
    for (const [action, resource, expected] of [
      ["edit", "source.js", "deny"],
      ["subagent", "general", "deny"],
      ["execute", "*", "deny"],
      ["shell", "npm test", "ask"],
      ["shell", "git status --short", "ask"],
      ["shell", "touch should-not-exist", "ask"],
      ["read", "source.js", "allow"],
      ["read", ".env", "ask"],
      ["skill", "ponytail-review", "allow"],
      ["skill", "other", "deny"],
    ]) {
      effect = undefined
      const check = ctx.permission.assert({
        sessionID: child.id, agent: "foreman-reviewer", action, resources: [resource],
      })
      if (expected === "allow") await check
      else await assert.rejects(check)
      // Hard denials reject before the evaluate hook is reached in 2.2.5.
      assert.equal(effect, expected === "deny" ? undefined : expected, `${action}: ${resource}`)
    }
  } finally {
    await permissions.dispose()
  }

  // Removing the fixed model must not dispatch to the cheap parent's model.
  const removal = await ctx.model.transform(editor => editor.remove("openai", "gpt-6.1-sol"))
  let dispatched = false
  const transport = await ctx.session.hook("model.request", () => {
    dispatched = true
    throw new Error("Foreman test: unexpected provider dispatch")
  })
  try {
    const unavailable = await ctx.session.create({ parentID: parent.id, agent: "foreman-reviewer" })
    await ctx.session.prompt({ sessionID: unavailable.id, text: "Review task 9" })
    await ctx.session.wait({ sessionID: unavailable.id })
    assert.equal((await ctx.session.get({ sessionID: unavailable.id })).outcome, "failed",
      JSON.stringify(await ctx.session.context({ sessionID: unavailable.id })))
    assert.equal(dispatched, false, "Unavailable reviewer must fail before provider dispatch")
    assert.match(JSON.stringify(await ctx.session.context({ sessionID: unavailable.id })),
      /Foreman reviewer requires openai\/gpt-6\.1-sol#high|Model unavailable/)
  } finally {
    await transport.dispose()
    await removal.dispose()
  }
}
