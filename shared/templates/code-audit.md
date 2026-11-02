# Code audit: findings and fixes

What this file is: the tracker of faults in code that already exists,
raised by audits (`/ponytail:ponytail-audit` or any other) and by
reviews. Each finding has a stable ID (`F01`, ...). New work that does
not exist yet belongs in the plan, not here. The rule: if it is broken
now, it is a finding; if it does not exist yet, it is a plan task.

## How to use this file

- **One file, stable IDs.** IDs are never reused or renumbered. A later
  audit adds new findings with the next free ID to the matching list
  under **Open findings**, each with a **Source** line, and a row in the
  Audit log. There is one Must fix, Should fix and Nice to have list for
  all audits and reviews; never a separate block per audit.
- **To implement a finding**, run `/foreman:start-task F01`. It reads
  the finding, checks the model level, re-checks the code (line numbers
  drift; search by function name), makes the smallest fix with its test,
  runs the checks, gets a review, and moves the finding to
  **Implemented**.
- **Status values:** `Open`, `Needs decision` (someone outside the code
  must decide first; named in the finding), `Implemented`,
  `No longer applies`, `Won't fix` (with the reason).
- When **Implemented** grows long, move it to an archive file and keep a
  pointer here.

## Choosing a model

Each open finding has a **Model** line: the lowest level (A, B, C or
Human) that can implement it safely. The levels, the models in each and
the reviewer are in foreman's `shared/model-levels.md`. A new finding
gets its Model line when it is added.

## When to audit

- **After each finished plan task:** `/foreman:start-task` reviews the
  branch. Anything that can wait goes here as the next free ID, with
  "review of <id>" as its source.
- **When a plan phase closes:** a full audit. Between phases, about once
  a month while the code changes fast.
- **After a large change** to code that writes protected data: a full
  audit before it runs on real data.
- **Clear Must fix first:** do not run a new full audit while Must fix
  findings are open; it would mostly repeat them.
- **Each full audit** adds a row to the Audit log, re-checks every open
  finding (still holds, implemented, or no longer applies) and adds new
  findings to the matching list under **Open findings**, each with a
  **Source** line.

## Implemented

Fixes made from this tracker, newest first.

| ID | Date | What changed | Guarded by |
|---|---|---|---|

## Audit log

| Date | Scope | Load assumed | Result |
|---|---|---|---|
| <date> | <whole repo, N lines, N tests passing> | <expected load> | <N findings (F01 to Fnn)> |

## Open findings

Fix order: <which first, and why>.

### Must fix

#### F01. <What goes wrong, in plain words>

- **Status:** Open
- **Model:** A
- **Source:** audit of <date>
- **Where:** `<file>` `<function>` (L<n>-<n>).
- **What this is:** <what the code does>.
- **Problem:** <a concrete case: this input leads to this wrong result>.
- **Fix:** <the smallest fix>.
- **Test:** <the test that will guard it>.

### Should fix

### Nice to have

## Not checked in the audit of <date>

- <what the audit did not read, and why>
