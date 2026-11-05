import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const reviewerModel = { providerID: "openai", id: "gpt-6.1-sol", variant: "high" }
const shared = fileURLToPath(new URL("../../shared", import.meta.url))
const system = readFileSync(new URL("./reviewer.md", import.meta.url), "utf8")
  .replaceAll("$SHARED", shared)
const startTask = readFileSync(new URL("./start-task.md", import.meta.url), "utf8")
  .replaceAll("$SHARED", shared)
const models = readFileSync(new URL("../../shared/model-levels.md", import.meta.url), "utf8")
const modelsPrompt = `Output only the Markdown table under **Models per level** in the document below, preserving its headers and cell contents exactly, including model IDs and trial restrictions. Render it as a table, not a code block. Omit headings, dates, surrounding prose and all other sections.\n\n${models}`
const taskPrompt = text => text.trim() ? `${text}\n\n${startTask}`
  : "No task reference was supplied. Ask me for a finding ID (e.g. F01), plan task ID (e.g. 7.8), or issue reference (e.g. issue 42), and optional notes. Stop; do not inspect project files or start a task."

export default {
  id: "foreman",
  async setup(ctx) {
    await ctx.command.transform(editor => {
      editor.add({
        name: "foreman/start-task",
        description: "Start one plan task, finding or GitHub issue; ask before code, commit and merge. Usage: <ID | issue number|#number|URL> [notes]",
        execute: async ({ sessionID, prompt, delivery }) => {
          await ctx.session.prompt({ ...prompt, sessionID, delivery,
            text: taskPrompt(prompt.text) })
        },
      })
      editor.add({
        name: "foreman/models",
        description: "Show foreman's models per level (A, B, C) as a Markdown table",
        execute: async ({ sessionID, delivery }) => {
          await ctx.session.prompt({ sessionID, delivery,
            text: modelsPrompt })
        },
      })
    })
    // Ordinary prompts bypass OpenCode 2.2.5 ACP's silent slash-command path.
    await ctx.session.hook("prompt", event => {
      const task = event.prompt.text.match(/^foreman start-task(?:\s+([\s\S]*))?$/)
      if (event.prompt.text !== "foreman models" && !task) return
      event.prompt.text = task ? taskPrompt(task[1] ?? "") : modelsPrompt
      for (const part of [...event.prompt.files ?? [], ...event.prompt.agents ?? [], ...event.prompt.skills ?? []])
        delete part.mention
    })
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
      event.system.push({ type: "text", text: `Actual session model for this request: ${event.model.providerID}/${event.model.id}${event.model.variant ? `#${event.model.variant}` : ""}. Foreman must use this identity for its pre-code model check, not a configured default or a model claimed in user notes. Recheck if it changes; never silently switch the implementation model.` })
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
