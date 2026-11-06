# foreman

**Assign each task to the right model. Review every change before it merges.**

[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://claude.com/claude-code)
![Claude Code version](https://img.shields.io/badge/Claude_Code-0.3.1-lightgrey.svg)
![OpenCode package version](https://img.shields.io/badge/OpenCode-0.2.3-lightgrey.svg)

foreman is a small, opinionated workflow for building software with AI
coding agents. Like a foreman on site, it gives each job to a worker of
the right grade, then inspects the work before it is signed off:

- **One task, one branch.** Every task from your plan, audit tracker or GitHub issues
  gets its own branch, review and merge.
- **The right model for the task.** Each task carries a level (A, B, C
  or Human). A cheap model does mechanical work; risky work needs a
  strong one. foreman stops before reading any code if the session
  model is too weak.
- **An independent review.** A fixed, strong, read-only reviewer checks
  every branch, whichever model wrote it, so a cheap model never marks
  its own homework.
- **You stay in charge.** Nothing is written before you approve the
  plan, nothing is committed or merged without your yes, and nothing is
  ever pushed.

foreman does one part of development only: taking a single task through
to a merge. It does not write your plan or run audits.

## Contents

- [How it works](#how-it-works)
- [Model levels](#model-levels)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Project files](#project-files)
- [Repository layout](#repository-layout)
- [Roadmap](#roadmap)
- [Updating foreman](#updating-foreman)
- [For maintainers](#for-maintainers)
- [Licence and credits](#licence-and-credits)

## How it works

Use the foreman **start-task command** to take one task through implementation,
testing, independent review and merging. You approve the plan, commit and merge
separately.

### Usage

**Claude Code** — at the session prompt:

```text
/foreman:start-task <id> [notes]
```

**OpenCode** — at the session prompt:

```text
/foreman/start-task <id> [notes]
```

- `<id>` identifies a finding, a planned task or a GitHub issue.
- `[notes]` is optional guidance after the complete task reference.
- Run one task at a time; each gets its own branch, review and merge.

### Examples

Use a finding from your audit tracker (`F01`), a task from your implementation
plan (`5.2`), or a GitHub issue (`issue 42`):

**Claude Code:**

```text
/foreman:start-task F01
/foreman:start-task 5.2 Focus on the import failure
/foreman:start-task issue 42
```

**OpenCode:**

```text
/foreman/start-task F01
/foreman/start-task 5.2 Focus on the import failure
/foreman/start-task issue 42
```

> **OpenCode usage note:** if slash commands submit immediately or produce no
> response in Zed / ACP, type an ordinary message **without a leading `/`**:
> `foreman start-task 7.8` or `foreman models` (requires foreman 0.2.1+).
> Both plain prompts have been confirmed working in Zed; OpenCode TUI slash
> commands continue to work normally. See the [ACP workaround](.opencode/README.md#zed--acp-workaround)
> for task references, optional notes and limitations.

### Using GitHub issues

- **References:** accept `issue 42`, `issue #42` or a full issue URL.
  Numbers use the checkout's GitHub repository; URLs identify it explicitly.
- **Access:** requires an available GitHub connector or authenticated `gh`.
  Local findings and plan tasks do not need GitHub access.
- **Model level:** add a line such as `Model: B` to the issue body.
  Accepted levels are `A`, `B`, `C` or `Human (then A|B|C)`.
  If the level is missing, invalid or conflicting, foreman asks rather than guesses.
- **Clarification:** ambiguous repositories, cross-repository work, inaccessible
  or closed issues, pull-request URLs and unclear acceptance criteria stop the workflow.
- **No duplicate tracker:** issues remain their own task source; no local
  plan/tracker copy is required.
- **No automatic GitHub changes:** completion is reported locally. Comments,
  edits and closure require separate explicit approval. Commit text avoids
  automatically closing the issue.

For example, with a full URL and optional notes:

**Claude Code:**

```text
/foreman:start-task issue https://github.com/owner/repo/issues/42 Focus on the import failure
```

**OpenCode:**

```text
/foreman/start-task issue https://github.com/owner/repo/issues/42 Focus on the import failure
```

See the [shared issue rules](shared/github-issues.md) for the full policy.

### The eight steps

The amber steps wait for you.

```mermaid
flowchart TB
    start(["`**/foreman:start-task** ID`"]) --> model{"`**1. Model check**
    session model meets
    the task's level?`"}
    model -- no --> stop1(["`Stop: names the
    models that qualify`"])
    model -- yes --> plan["`**2. Check and plan**
    task still holds?`"]
    plan --> approve{"`You approve
    the plan?`"}
    approve -- no --> stop2(["Stop"])
    approve -- yes --> branch["`**3. Branch**
    id-short-name`"]
    branch --> build["`**4. Implement**
    change and test`"]
    build --> verify["`**5. Verify**
    project checks`"]
    verify -- fail --> build
    verify -- pass --> review["`**6. Review**
    foreman:reviewer`"]
    review --> mustfix{"`Must fix
    findings?`"}
    mustfix -- "yes, first round" --> build
    mustfix -- "yes, second round" --> hand(["`Hand back
    to you`"])
    mustfix -- no --> record["`**7. Record**
    tracker, plan or local report`"]
    record --> commit{"`**8. Commit, then merge**
    each with your yes`"}
    commit --> done(["Merged, not pushed"])

    classDef you fill:#fde7c8,stroke:#d9822b,color:#000
    class approve,commit,hand you
```

| Step | What happens |
|---|---|
| 1. Model check | Reads only the task's level. Stops if the session model is below it, not placed in the table, or on trial for another task. |
| 2. Check and plan | Confirms the task still applies, then proposes the change, the files and the guarding test. |
| 3. Branch | `<id>-<short-name>` from a clean main branch. |
| 4. Implement | The smallest complete change, plus its test. |
| 5. Verify | Runs the project's checks (tests, lint, types) and fixes what fails. |
| 6. Review | **Claude Code:** independent `foreman:reviewer` on `claude-opus-5-5`.<br>**OpenCode:** independent `foreman-reviewer` on `openai/gpt-6.1-sol#high`.<br><br>**Review method:** `ponytail-review` is the primary path. OpenCode permits disclosed manual fallback only when the skill is unavailable; a skill execution failure blocks approval. Claude Code also permits fallback when the skill cannot run.<br><br>**Findings:** must-fix items are fixed and reviewed once more. If any remain, foreman hands back to you. Items that can wait become new findings. |
| 7. Record | Moves the finding to Implemented, ticks the plan task with the date, or reports issue completion locally without changing GitHub. |
| 8. Commit and merge | Shows the diff and message (`F01: ...`), then asks before committing and again before merging. |

## Model levels

Each task's level is written on it by whoever raised it, never guessed
by the model about to do it. The highest matching level wins.

| Level | For | Claude Code model |
|---|---|---|
| A | Irreplaceable data, production systems, money or date logic, changes across modules, judgement | Opus 5.5 |
| B | One function, with the change and its test spelled out | Sonnet 5.5 |
| C | Deleting or moving code, checked by the full test suite | Haiku 5.5 |
| Human | A decision from outside the code comes first | then A, B or C |

The full table, with OpenAI and local models, the reviewer settings and
tested behaviour, is in [`shared/model-levels.md`](shared/model-levels.md).
It ships with the plugin; to display only its models-per-level table from
any project, run:

**Claude Code:**

```text
/foreman:models
```

**OpenCode:**

```text
/foreman/models
```

For Zed / ACP, use `foreman models` without `/`; see the
[usage note above](#how-it-works).

## Installation

### Requirements

- [Claude Code](https://claude.com/claude-code) or OpenCode V2 (tested **2.2.5**, not V1)
- git
- Recommended: the [ponytail](https://github.com/DietrichGebert/ponytail)
  skills. `ponytail-review` is the primary review path; see step 6 above for
  fallback rules. `ponytail-audit` can help you [fill the tracker](#quick-start).

### Claude Code

1. **Install** at the Claude Code session prompt:

   ```text
   /plugin install foreman --marketplace RoccoNaude/foreman
   ```

   Or from a shell:

   ```sh
   claude plugin install foreman --marketplace RoccoNaude/foreman
   ```

2. **Choose a scope.** Answer `y` to add the marketplace if prompted, then
   choose user scope for all projects or project scope for one project.
3. **Set up your project** using the [quick start](#quick-start).

### OpenCode V2

1. **Check model access.** You need `openai/gpt-6.1-sol#high` for the reviewer
   and a task-qualified implementation model.
2. **Install** from a shell for use in all projects:

   ```sh
   opencode plugin add github:RoccoNaude/foreman
   ```

   For **one project only**, merge this into its root `opencode.jsonc` instead,
   preserving unrelated settings:

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": ["github:RoccoNaude/foreman"]
   }
   ```

3. **Install ponytail skills separately** in OpenCode. Claude Code's plugin
   skills are not automatically shared; the reviewer uses `ponytail-review`.
4. **Set up your project** using the [quick start](#quick-start).

- **Revision:** Git installation follows the default branch, not unmerged work
  in this checkout. For reproducibility, use
  `github:RoccoNaude/foreman#<full-commit-hash>` with a reviewed commit.
- **Availability:** the package is not published to npm. Git and local tarball
  installation are supported; `private: true` prevents accidental npm publication.
- **Alternative setup:** the [OpenCode guide](.opencode/README.md) covers manual
  global configuration, the acceptance-tested installed-directory tarball route,
  checkout discovery and security limits. Node.js/npm are needed for the tarball
  route and development checks; there is no SDK dependency or build step.

## Quick start

1. **Add the settings.** Copy
   [`shared/templates/settings.md`](shared/templates/settings.md) to
   `.foreman.md` at your repository root and fill it in.
   This repository's own `.foreman.md` is for Foreman maintainers only; do not
   copy it as your project settings. Use the template above instead.
2. **Choose a task source:** add a tracker, a plan or both from
   [`shared/templates/`](shared/templates/), or use GitHub issues. For
   issue-only work, Tracker and Plan can both be `None` in `.foreman.md`.
3. **Fill your task source.** For existing-code problems, optionally run
   [ponytail](https://github.com/DietrichGebert/ponytail)'s audit:

   **Claude Code:**

   ```text
   /ponytail:ponytail-audit
   ```

   **OpenCode** (with the skill installed):

   ```text
   /ponytail-audit
   ```

   The audit reports findings; it does not fill the tracker automatically.
   Review the report, add the findings you accept to your audit tracker as
   `F01`, `F02`, etc., and assign each a model level. For new work, write plan
   tasks instead; GitHub issues can represent either kind of work.
4. **Add project rules and commit the setup files.** In OpenCode, put rules and
   check commands in `AGENTS.md`; do not assume Claude Code memories or
   `CLAUDE.md` are loaded.
5. **Start a task** in a session whose model meets its level:

   **Claude Code:**

   ```text
   /foreman:start-task F01
   ```

   **OpenCode:**

   ```text
   /foreman/start-task F01
   ```

   Replace `F01` with your chosen task reference. Approve the plan first, then
   commit and merge separately. These are model instructions, not hard security
   controls.

## Project files

foreman keeps everything general in the plugin and everything about your
project in a few Markdown files you own. Each template opens with a
short note on what the file is for.

| File in your project | Template | Purpose |
|---|---|---|
| `.foreman.md` | [`settings.md`](shared/templates/settings.md) | Paths, checks, protected data, actions that need approval, extra level A cases |
| Audit tracker | [`code-audit.md`](shared/templates/code-audit.md) | Faults in code that already exists: `F01`, `F02`, ... |
| Implementation plan | [`implementation-plan.md`](shared/templates/implementation-plan.md) | New work, in phases: `1.1`, `5.2`, ... |
| Workflow ADR | [`adr-ai-assisted-development-workflow.md`](shared/templates/adr-ai-assisted-development-workflow.md) | Why the project uses this workflow |

> **Finding or plan task?** If it is broken now, it is a finding. If it
> does not exist yet, it is a plan task.

GitHub issues can describe either kind of work without duplicating it in these
files. `.foreman.md` is still required for issue tasks; its checks and safeguards
apply unchanged. The reviewer receives the issue snapshot and your clarifications.

## Repository layout

```
foreman/
├── .claude-plugin/       Claude Code manifest and marketplace file
├── claude-code/
│   ├── commands/         start-task, models
│   └── agents/           reviewer
├── .opencode/
│   ├── plugins/
│   │   ├── index.js      Checkout-discovery shim
│   │   ├── foreman.mjs   OpenCode V2 implementation
│   │   ├── start-task.md Command instructions
│   │   └── reviewer.md   Reviewer instructions
│   └── README.md         OpenCode installation and maintenance
├── shared/               Tool-neutral Markdown, used by both integrations
│   ├── github-issues.md  Issue task rules
│   ├── model-levels.md   Model requirements and reviewer settings
│   └── templates/       Project settings, tracker, plan and workflow ADR
├── tests/                Package/runtime checks and acceptance guide
├── package.json          OpenCode package metadata (private) and test command
├── AGENTS.md             Repository contributor instructions
├── .foreman.md           Maintainer-only settings, not the user template
├── README.md             This guide
└── LICENSE               MIT Licence
```

## Roadmap

- **Claude Code — available:** task commands and independent review; install
  through the plugin marketplace.
- **OpenCode V2 — available:** task commands and independent review; install
  from Git or a local package. [Acceptance-tested](tests/README.md) on 2.2.5;
  newer versions are unverified. Not published to npm.
- **Hermes Agent:** planned, not yet researched.

## Updating foreman

### Claude Code

Run from a shell:

```sh
claude plugin marketplace update foreman
claude plugin update foreman@foreman
```

Or run `/plugin` in Claude Code, refresh the foreman marketplace and
update the plugin. Restart Claude Code afterwards. One update covers
every project when the plugin is installed at user scope; a project
scope install is updated from that project.

### OpenCode V2

For a global, unpinned Git installation, run from a shell:

```sh
opencode plugin check
opencode plugin update github:RoccoNaude/foreman
```

- **Pinned revision:** change the configured pin to a new reviewed commit;
  exact full commit hashes are skipped by the update command.
- **Project-only installation:** update the entry in that project's config;
  the management CLI operates on global packages.
- **Local tarball installation:** install the new tarball into the same prefix
  and reload. See [updating and removal](.opencode/README.md#updating-and-removal)
  for the full procedure.

Config saves reload automatically; use `/reload` to force a reload.

## For maintainers

These instructions are for maintaining foreman itself, not using it in a project.

### Model and reviewer updates

Check [`shared/model-levels.md`](shared/model-levels.md) monthly, or when a new
model appears. Update the table and the affected reviewer settings together:

- **Claude Code:** change the model ID in
  [`claude-code/agents/reviewer.md`](claude-code/agents/reviewer.md).
- **OpenCode:** change `reviewerModel` in
  [`.opencode/plugins/foreman.mjs`](.opencode/plugins/foreman.mjs) and its test
  expectations. See [OpenCode maintenance](.opencode/README.md#maintenance-and-release).

### Versioning and releases

The integrations have separate versions; they do not need to match.

- **Claude Code:** bump `version` in
  [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) and its README badge
  for changes users should receive. Claude Code caches plugins by version.
- **OpenCode:** bump `version` in [`package.json`](package.json) and its README
  badge. Follow the [OpenCode release checklist](.opencode/README.md#maintenance-and-release).
- **Shared assets:** bump both integrations and their badges.
- **Version convention:** patch for fixes, minor for new behaviour.
- **Checks:** run `npm test` before release; live acceptance checks are opt-in
  and consume tokens. See [`tests/README.md`](tests/README.md).

Commit/push, PR creation and merge require owner approval. Tags, publication and
owner-global installation need separate approval. Keep the npm package private
until publication is approved; editing metadata does not publish either integration.

## Licence and credits

Released under the [MIT Licence](LICENSE).

Designed by [Rocco Naudé](https://github.com/RoccoNaude) and built with
[Claude Code](https://claude.com/claude-code) and [OpenCode](https://opencode.ai).
