# Model levels

What this file is: foreman's table of which AI model may implement which
task, and which model reviews it. The same for every project. A project
adds its own level A cases in its settings file (`.foreman.md`, section
**Level A also covers**). Used by the tracker, the plan and
`/foreman:start-task`.

## How a task gets its level

- **Findings** (tracker): a **Model** line, set by the audit or review
  that raised the finding.
- **Plan tasks** (plan): a tag right after the task's ID, e.g.
  `- [ ] **5.2** (model: B) Stock movements ...`. Added when the task is
  first started: if a task has none, `/foreman:start-task` asks you (it
  never estimates) and adds the tag. New plan tasks can get the tag when
  they are written.
- **Pick the model before starting the session:** one from the task's
  level or a higher one. `/foreman:start-task` stops if the session
  model is below the level, not placed in the table, or on trial for
  another task.

## Levels

- **A (strongest):** writes to data that cannot be fetched again, calls
  to production or outside systems, money, date or aging logic, changes
  across several modules, or anything needing judgement; plus the
  project's own cases in its settings.
- **B (strong):** one function, with the change and its test already
  spelled out in the task.
- **C (mechanical):** deleting or moving code, checked by the full test
  suite.
- **Human:** a decision from someone outside the code comes first; the
  level after the decision is given in brackets, e.g. `Human (then B)`.
  Once the decision is made, set the Model line to that level.
- **If a task matches more than one level, the highest wins.** E.g. a
  one-line fix that changes what is written to protected data is
  level A.
- **"Trial only"** models may start only the task named for their trial.

## Models per level

Last checked: 1 November 2026

| Level | Anthropic (Claude Code) | OpenAI | Local (llama.cpp) |
|---|---|---|---|
| A | Opus 5.5 (`claude-opus-5-5`) | GPT-6 Astra, GPT-6.1 Sol | none |
| B | Sonnet 5.5 (`claude-sonnet-5-5`) | GPT-6.1 Terra, GPT-6 Sol | none |
| C | Haiku 5.5 (`claude-haiku-5-5`) | GPT-6 Luna | Qwen3.8-27B:THINKING (Q3), trial only |

- **Not placed** (strength relative to the levels not known; place once
  checked): Fable 5.1, Fable 5; GPT-5.6 Cyber; all "Fast" and
  "Ultrafast" variants; Qwen3.8-27B:INSTRUCT, Qwen3.6-27B, Gemma-4-12B,
  Gemma-4-26B-A4B.
- **Not used** (superseded by the models above): Opus 5, 4.8, 4.7, 4.6;
  Sonnet 5, 4.6; Haiku 4.5; the older GPT-5.6 Sol, Terra and Luna.
- **Sources:** Anthropic models from the Claude Code model picker. OpenAI
  placement from third-party comparisons (TrueFoundry, Lindy, LiteLLM,
  Respan; 1 November 2026), which disagree on names and scores; not
  checked against OpenAI's own documentation. Local models:
  vendor-reported scores only, and Q3 quantisation lowers quality.

## Reviewer

Every change is reviewed before merge by a fixed level A model, whatever
model implemented it (cheap implementer, strong reviewer):

| Tool | Reviewer | Model | Effort |
|---|---|---|---|
| Claude Code | `foreman:reviewer` (`claude-code/agents/reviewer.md`) | `claude-opus-5-5` | `medium`; `high` for level A tasks. Both set on the Agent call by `/foreman:start-task` (see Known behaviour). |
| OpenCode | `foreman-reviewer` (`.opencode/plugins/reviewer.md`) | `openai/gpt-6.1-sol` | pinned `high` variant; never inherit the implementer's model |
| Hermes Agent | planned, not built | a level A model from this table | to set |

## Known behaviour (Claude Code)

Tested 1 November 2026, reviewer on `claude-opus-5-5` (session effort,
effort on the Agent call, effort the agent saw):

| Session | Call | Seen |
|---|---|---|
| low | none | 10 (three runs) |
| low | `high` | 15 |
| not recorded | `medium` | 10 |
| high | none | 10 |
| high | `medium` | 10 |

So the session's effort does not reach the agent, and only `high` on the
call has changed it. Whether 10 is the agent file's `medium` or a fixed
default is unknown. Either way `/foreman:start-task` sets `medium`, or
`high` for level A, on every call. The reviewer ran `ponytail-review`
through the Skill tool.

## Cautions

- **Local models in Claude Code** go through a proxy; the reviewer's
  model ID may then be routed to the local model too. Check once before
  relying on it. Local models edit on a branch with the reviewer only.
- **Other tools** (OpenCode, Hermes Agent) do not load Claude Code
  memories or plugin skills. Copy the project rules into the tool's own
  instruction file first (OpenCode: `AGENTS.md`).

## Keeping it current

- Check this table monthly, or when a new model appears in a picker, and
  update "Last checked". `/foreman:start-task` reminds you when it is
  over 31 days old.
- Change the reviewer's model ID in the same commit as the table, so the
  history shows which reviewer approved which fixes.
- When a model is retired, its pinned ID fails with an error instead of
  silently changing: update the table and the reviewer then.
