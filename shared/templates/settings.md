# Foreman settings

What this file is: this project's settings for foreman. The
`start-task` command and the reviewer read it before every task.
Everything general (the steps, the model levels, the review) lives in
the foreman plugin; everything about this project lives here.

Copy it from foreman's `shared/templates/settings.md` to `.foreman.md`
at the repository root and commit it. Replace each `<...>`; write `None`
where a section does not apply.

## Files

- **Tracker:** `docs/planning/code-audit.md` (findings `F01`, ...;
  template `shared/templates/code-audit.md`), or `None`
- **Plan:** `docs/planning/implementation-plan.md` (tasks `5.2`, ...;
  template `shared/templates/implementation-plan.md`), or `None`
- **Workflow ADR:** `docs/adr/<NNNN>-ai-assisted-development-workflow.md`,
  or `None`
- **Notes file:** `<path>` (project status; foreman says what to change
  there but never edits it), or `None`
- **Scratch folder:** `.tmp/`
- **Main branch:** `main`

## Checks

Commands that must all pass before review, run in this order:

- `<test command>`
- `<lint command>`
- `<type check command>`

## Expected load

<e.g. One person, one laptop, one job at a time.>

## Ask first

Actions that need my approval each time, with the reason:

- <e.g. Any call to the production API: only out of hours, lock held
  (ADR NNNN).>

## Never run

Commands and scripts the reviewer must never run:

- <e.g. Anything under `scripts/extract/`.>

## Protected data

- <e.g. `data/raw/`: the only copy of some history. Never delete or
  overwrite; no data written outside the project folder.>

## Level A also covers

Project cases that make a task level A (added to the general list in
foreman's `shared/model-levels.md`):

- <e.g. Writes to `data/raw/`, calls to the production API.>

## Impact to state

What the plan step must say when a task touches it:

- <e.g. If the task touches money, dates or aging, state its effect on
  the daily cash-flow forecast.>
