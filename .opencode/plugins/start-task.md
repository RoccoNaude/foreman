For `issue <number|#number|URL> [notes]`, read and follow
`$SHARED/github-issues.md`; the complete reference precedes my notes.
Otherwise the first word is the task ID; anything after it is my notes.
Follow this workflow in order. Task notes do not waive its checks or approvals.

0. **Read the settings.** Read `.foreman.md` at the repository root:
   the project's files, checks, protected data and rules. If it is
   missing, stop and tell me to copy
   `$SHARED/templates/settings.md` there and fill it in.
   The model table is `$SHARED/model-levels.md`.
   - An ID like `F01` is a finding in the settings' **Tracker**; an ID
      like `5.2` is a task in the settings' **Plan**. `issue` uses the
      shared GitHub rules instead; Tracker and Plan may both be `None`.
      Any other shape: stop and say so. For local tasks, a file the
      settings mark `None` also stops. An absent entry
     also stops; never invent a task.
1. **Read the task and check the model.** Read only the task's entry,
   then do the model check before reading any code:
    - Issue: read its level using the shared GitHub rules, then apply the
      same project overrides and actual-session model check below.
    - Read a local task's level: the finding's **Model** line, or the plan
     task's `(model: X)` tag. A plan task with none: stop and ask me for
     a level (do not estimate); remember it and write the tag onto the
     task on the branch, after step 3. A missing or invalid finding
     level also stops for clarification.
   - `Human (then X)` with status `Needs decision`: stop and tell me who
     must decide and what to ask them. With any other status, the level
     is X.
   - A task that matches a case in the settings' **Level A also
     covers** is level A, whatever its entry says; tell me.
   - Read the shared model table and compare the level with the actual
     provider/model/variant supplied in the request's system context.
     If that identity is unavailable, stop; never infer it from the
     configured default. Recheck before reading code if the model changes.
     If the session model is below the level, not placed in the table,
     or marked "trial only" for a different task, stop and name the
     models that qualify. Unknown aliases and Fast/Ultrafast variants
     are not qualified. Do not pin or switch the implementation model;
     ask me to select a qualifying model and resume.
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
    `f01-stock-walk-start`, `plan-5.2-stock-top-up`, or for issues
    `issue-42-import-failure`). Write a plan
   task's new model tag now.
4. **Implement** the smallest complete change plus its test. Do nothing
   listed under the settings' **Ask first** unless the task needs it;
   if it does, explain each action and ask first. Never touch the
   settings' **Protected data** in a way it forbids.
5. **Verify.** Run every command in the settings' **Checks**. Show the
   result; fix what fails.
6. **Review.** Invoke the independent `foreman-reviewer` subagent with
    the branch name and task ID, and say the changes are uncommitted
    (including untracked files). For issues, also supply the snapshot and
    clarifications required by the shared GitHub rules. Use OpenCode's subagent tool with
   `agent: "foreman-reviewer"`; its registration pins
   `openai/gpt-6.1-sol#high` for every task level. Do not pass Claude
   Code's `effort` argument or override/inherit the implementation model.
   The reviewer loads and follows `ponytail-review` first; only registry
   absence permits its disclosed manual fallback. A failed or incomplete
   review blocks progress, not permission to approve it yourself.
   If the review has Must fix findings: fix them on the branch, verify
   again, and run the reviewer once more; if that second review still
   has one, stop and hand it to me. Do not start a third review or
   commit/merge. Findings that can wait: add them to the tracker as the
   next free ID, in the matching list under **Open findings** (never a
   new block per review), with a **Model** line and source "review of
   <id>"; with no tracker, list them for me. Never add them to the plan.
7. **Record.**
    - Issue: report locally as specified in the shared GitHub rules.
   - Finding: move it to the **Implemented** table (date, what changed,
     the guarding test) and delete its open entry.
   - Plan task: tick its checkbox with the date, matching the plan's
     style. Do not reword other tasks.
   - If the settings name a **Notes file**, say what change to project
     status it should reflect; do not edit it.
8. **Commit and merge.** Show the diff summary and proposed commit
    message (`F01: <what changed>`, `Plan 5.2: <what changed>` or
    `Issue #42: <what changed>`; no automatic-closing text). Ask
   before committing, then ask separately before merging into the main
   branch and deleting the task branch. Never push.
