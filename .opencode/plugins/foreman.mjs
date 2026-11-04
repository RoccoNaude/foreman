import { readFileSync } from "node:fs"

const system = readFileSync(new URL("./reviewer.md", import.meta.url), "utf8")
const reviewerModel = { providerID: "openai", id: "gpt-6.1-sol", variant: "high" }

export default {
  id: "foreman",
  async setup(ctx) {
    await ctx.agent.transform(editor => editor.update("foreman-reviewer", agent => {
      agent.name = "Foreman reviewer"
      agent.description = "Independent skill-first review of a task branch; supply task ID and branch."
      agent.mode = "subagent"
      agent.model = { ...reviewerModel }
      agent.system = system
      agent.permissions = [
        { action: "*", resource: "*", effect: "deny" },
        ...["read", "glob", "grep"].map(action => ({ action, resource: "*", effect: "allow" })),
        { action: "read", resource: "*.env", effect: "ask" },
        { action: "read", resource: "*.env.*", effect: "ask" },
        { action: "read", resource: "*.env.example", effect: "allow" },
        { action: "skill", resource: "ponytail-review", effect: "allow" },
        { action: "external_directory", resource: "*", effect: "ask" },
        // Even checks can write; never auto-approve shell prefixes.
        { action: "shell", resource: "*", effect: "ask" },
      ]
    }))
    await ctx.session.hook("context", async event => {
      if (event.agent !== "foreman-reviewer") return
      if (event.model.providerID !== reviewerModel.providerID || event.model.id !== reviewerModel.id
        || event.model.variant !== reviewerModel.variant) {
        throw new Error(`Foreman reviewer requires ${reviewerModel.providerID}/${reviewerModel.id}#${reviewerModel.variant}; pinned model/variant unavailable or overridden. Review blocked.`)
      }
      const available = (await ctx.skill.list()).data.some(skill => skill.id === "ponytail-review")
      event.system.push({ type: "text", text: available
        ? "ponytail-review is available in the skill registry. Load and follow it first. A load/execution failure blocks approval; do not substitute fallback."
        : "ponytail-review is unavailable in the skill registry. Disclose its absence and perform the complete manual fallback in your review procedure; do not attempt to load an absent skill." })
    })
  },
}
