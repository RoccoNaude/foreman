# foreman

A small workflow for building software with AI coding agents: one task
per branch, a model chosen by the task's level, and an independent
review on a fixed strong model before merge. It does one part of
development only: taking one task from the plan or the audit tracker
through to a merge.

Available for Claude Code. Versions for OpenCode and Hermes Agent are
planned, not built.

## How it works

`/foreman:start-task <id> [notes]` runs eight steps:

1. **Model check:** reads only the task's level and stops if the session
   model is too weak, before any code is read.
2. **Check and plan:** confirms the task still applies; a short plan you
   approve before any code.
3. **Branch:** `<id>-<short-name>` from a clean main branch.
4. **Implement** the smallest complete change and its test.
5. **Verify** with the project's checks.
6. **Review** by `foreman:reviewer`, read-only, on `claude-opus-5-5`.
   Must fix items are fixed and reviewed once more; if any remain, it
   stops and hands back to you.
7. **Record** in the tracker or the plan.
8. **Commit, then merge,** each only when you approve. Never pushes.

## Install (Claude Code)

At the prompt of a terminal session:

```
/plugin install foreman --marketplace RoccoNaude/foreman
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install foreman --marketplace RoccoNaude/foreman
```

**Recommended:** the [ponytail](https://github.com/DietrichGebert/ponytail)
plugin. The reviewer uses its `ponytail-review` skill when it can and
applies the same checks itself when it cannot, and
`/ponytail:ponytail-audit` is a good way to fill the tracker. foreman
works without it.

## Set up a project

1. Copy `shared/templates/settings.md` to `.foreman.md` at the
   repository root and fill it in: tracker and plan paths, checks,
   protected data, actions that need approval.
2. Copy the templates you use:
   - `shared/templates/code-audit.md`: the tracker, for faults in code
     that already exists (`F01`, ...).
   - `shared/templates/implementation-plan.md`: the plan, for new work
     (`5.2`, ...).
   - `shared/templates/adr-ai-assisted-development-workflow.md`: an ADR
     recording why the project uses this workflow.
3. Commit them, then `/foreman:start-task F01` or
   `/foreman:start-task 1.1`.

## Layout

| Path | What |
|---|---|
| `shared/` | Tool-neutral Markdown: the model table and the templates |
| `claude-code/` | The Claude Code command and reviewer agent |
| `.claude-plugin/` | Claude Code plugin manifest and marketplace file |

## Upkeep

Check `shared/model-levels.md` monthly, and change the reviewer's model
ID (`claude-code/agents/reviewer.md`) in the same commit as the table.

## Licence and credits

MIT, see `LICENSE`. Designed by Rocco Naudé and built with
[Claude Code](https://claude.com/claude-code); commits written with it
carry a `Co-Authored-By: Claude` trailer.
