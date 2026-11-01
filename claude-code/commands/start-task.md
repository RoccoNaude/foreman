---
description: Start one plan task or audit finding on its own branch, fix, review, then merge (asks before code, commit and merge)
argument-hint: <plan task e.g. 5.2 | finding e.g. F01> [notes]
---

Work on this task: $ARGUMENTS

The first word is the task ID; anything after it is my notes for this
task.

0. **Read the settings.** Read `.foreman.md` at the repository root:
   the project's files, checks, protected data and rules. If it is
   missing, stop and tell me to copy
   `${CLAUDE_PLUGIN_ROOT}/shared/templates/settings.md` there and fill
   it in. The model table is
   `${CLAUDE_PLUGIN_ROOT}/shared/model-levels.md`.
   - An ID like `F01` is a finding in the settings' **Tracker**; an ID
     like `5.2` is a task in the settings' **Plan**. Any other shape, or
     a file the settings mark `None`: stop and say so.
1. **Read the task and check the model.** Read only the task's entry,
   then do the model check before reading any code:
   - Read the task's level: the finding's **Model** line, or the plan
     task's `(model: X)` tag. A plan task with none: stop and ask me for
     a level (do not estimate); remember it and write the tag onto the
     task on the branch, after step 3.
   - `Human (then X)` with status `Needs decision`: stop and tell me who
     must decide and what to ask them. With any other status, the level
     is X.
   - A task that matches a case in the settings' **Level A also
     covers** is level A, whatever its entry says; tell me.
   - Compare the level with the model running this session. If the
     session model is below the level, not placed in the table, or
     marked "trial only" for a different task, stop and name the models
     that qualify.
   - If the table's "Last checked" date is over 31 days old, say so in
     one line and carry on.
2. **Check and plan.** Read the code the task names (search by function
   name; line numbers drift) and check the task still holds. For a
   finding that no longer holds, stop and propose marking it
   `No longer applies`. Then, in a few lines: what you will change,
   which files, the test that will guard it, and anything unclear. If
   the settings' **Impact to state** applies, state it. Ask me to
   approve before writing code.
3. **Branch.** `git status` must be clean on the settings' main branch.
   Create the branch `<id>-<short-kebab-name>` (e.g.
   `f01-stock-walk-start`, `plan-5.2-stock-top-up`). Write a plan
   task's new model tag now.
4. **Implement** the smallest complete change plus its test. Do nothing
   listed under the settings' **Ask first** unless the task needs it;
   if it does, explain each action and ask first. Never touch the
   settings' **Protected data** in a way it forbids.
5. **Verify.** Run every command in the settings' **Checks**. Show the
   result; fix what fails.
6. **Review.** Start the `foreman:reviewer` agent with the branch name
   and the task ID, and say the changes are uncommitted. Always set the
   Agent call's `effort`: `medium`, or `high` for a level A task (the
   session's effort does not reach the agent; see the model table). If
   the review has Must fix findings: fix them on the branch, verify
   again, and run the reviewer once more; if that second review still
   has one, stop and hand it to me. Findings that can wait: add them to
   the tracker as the next free ID, with a **Model** line and source
   "review of <id>"; with no tracker, list them for me. Never add them
   to the plan.
7. **Record.**
   - Finding: move it to the **Implemented** table (date, what changed,
     the guarding test) and delete its open entry.
   - Plan task: tick its checkbox with the date, matching the plan's
     style. Do not reword other tasks.
   - If the settings name a **Notes file**, say what change to project
     status it should reflect; do not edit it.
8. **Commit and merge.** Show the diff summary and proposed commit
   message (`F01: <what changed>` or `Plan 5.2: <what changed>`). Ask
   before committing, then ask before merging into the main branch and
   deleting the task branch. Never push.
