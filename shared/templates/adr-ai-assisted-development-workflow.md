# ADR <NNNN>: AI-assisted development workflow

What this file is: the record of why this project uses the foreman
workflow (one task per branch, a model chosen by the task's level, an
independent review before merge) and what it costs. Replace each
`<...>`; delete options that were not considered.

- Status: <proposed | accepted (date)>
- Date: <date>

## Context

<Who builds the project and with which AI tools. What a wrong change can
do here (e.g. lose data without any error). Where work comes from: an
audit tracker, an implementation plan, GitHub issues, or a combination. Which models are
available, and whether code may go to a remote such as GitHub yet.>

The questions: how to track findings and tasks, how to review each
change, which model may do which task, and how to keep this working
across tools.

## Options

**Tracking audit findings**

- **A. A new dated file per audit.** Each repeats every open finding; a
  request like "fix F03" becomes ambiguous.
- **B. One living tracker with stable IDs.** Each audit adds a dated log
  row and new IDs, and re-checks the open ones. **Chosen.**

**Issues and pull requests**

- **A. Issues and pull requests on a remote (e.g. GitHub).**
- **B. Local git: the task ID is the issue, one branch per task, review
  the branch against the main branch before merging.** Nothing leaves
  the machine, and the history can be pushed later. **<Chosen | not
  chosen>.**

**Which model does the work**

- **A. The strongest model for everything.** Safe, but uses up the
  subscription on mechanical tasks.
- **B. The cheapest model, reviewing its own work.** A review in the same
  session runs on the same model, so it misses what that model misses.
- **C. A model level per task, plus an independent reviewer on a fixed
  strong model.** Cheap models for simple tasks; every change still gets
  a strong review before merge. **Chosen.**

**Where a task's level comes from**

- **A. The command estimates it after reading the task.** By then the
  session model is already chosen; a weak model is the worst judge of
  whether a task is too hard for it.
- **B. Written on the task by whoever raised it** (the audit or review
   for findings; the owner for plan tasks and issues), read before anything else.
  **Chosen.**

**Reviewer model**

- **A. A model alias (`opus`).** No upkeep, but the reviewer can change
  without warning, so reviews of the same code may differ.
- **B. A pinned model ID, changed in the same commit as the model
  table.** **Chosen.** Effort `medium`; `high` for level A tasks.

## Decision

Use foreman (<version>):

1. **Audit and review** with ponytail (`/ponytail:ponytail-audit`,
   `ponytail-review`) where installed; the reviewer applies the same
   checks by hand where not.
2. **The tracker,** `<path or None>`, for faults in existing code. **The
   plan,** `<path or None>`, for new work. If it is broken now, it is a
   finding; if it does not exist yet, it is a plan task.
   **GitHub issues** may supply either kind directly with
   `/foreman:start-task issue <number|#number|URL>` (OpenCode:
   `/foreman/start-task`). No local task copy is required. Use a body
   `Model:` line or ask the owner for a level. Completion is reported
   locally; comments, edits and closure require separate explicit approval.
3. **Git:** branches `<id>-<short-name>`, commit messages start with the
   ID, commits and merges only when the owner approves, <never pushed |
   pushed to ...>.
4. **`/foreman:start-task <id> [notes]`:** model check first, then
   check and plan (approved before code), branch, implement, run the
   checks, review, record, commit and merge.
5. **Model levels and the reviewer:** foreman's `shared/model-levels.md`.
6. **Project settings:** `.foreman.md`: checks, protected data, actions
   that need approval, extra level A cases.

## Consequences

- **Cost:** level A prices are paid where the risk is, and for reviews.
- **Safety:** every change gets a strong, read-only review before it is
  merged, whichever model wrote it. Must fix items that survive two
  rounds go to the owner. The reviewer's no-write rule rests on its
  instructions: it has Bash.
- **Upkeep:** the model table needs a monthly check.
- **Discipline:** the main branch must be clean before a task starts.
  Each task is one branch, one review and one merge.
- **Lock-in:** small. The tracker, plan, settings and model table are
  plain Markdown; only the command and reviewer are tool-specific.

## Open items

1. <e.g. Trial a local model on one level C task before using it
   elsewhere.>
