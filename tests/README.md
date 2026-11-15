# Installed-plugin acceptance

Run from the repository root with Node and OpenCode V2 installed:

```sh
npm test
node tests/live-review.js
node tests/live-commands.js
node tests/live-workflow.js
node tests/live-workflow.js --blocking
node tests/live-commands.js --issues --open-issue 26 --closed-issue 16
node tests/live-commands.js --issue-cases
node tests/live-workflow.js --issue
node tests/live-claude.js
```

The live commands consume model tokens and require existing OpenAI
authentication. The reviewer check also requires a cached `ponytail-review`
installation. They export/import only OpenAI credentials through memory into
isolated state, then remove the isolated credential database on exit.
All fixtures, npm artifacts, caches and evidence live in repository `.tmp/`.
No owner configuration is changed; nothing is published or pushed.

The OpenCode issue checks use GPT-6.1 Sol `medium` for implementation and the
existing Sol `high` reviewer. `live-commands.js --issues` reads two real issues
in the checkout's own GitHub repository (taken from its `origin` remote, so a
fork tests itself) through authenticated `gh`: an open one by number and URL
(title and level), and a closed one (must stop for clarification). It also checks
PR-URL rejection and stops before source inspection. The harness reads each
issue's state, title and `Model:` line itself first, so nothing is hard-coded;
it fails early unless the open issue is open with exactly one `Model: A|B|C`
line and the closed issue is closed. The standing fixture is
[#26](https://github.com/RoccoNaude/foreman/issues/26) (keep open, `Model: B`);
#16 serves as the closed case. It uses the existing GitHub CLI configuration
read-only (`GH_CONFIG_DIR`, or the normal config path). Its shell guard permits
only reads of the two selected issues in that repository (`gh issue view`, or a
`gh api` GET with optional `--jq`; any method, field or input flag is rejected)
and remote inspection; no GitHub write is authorized. Every attempted shell
command is checked against the guard, including attempts it blocked. Because
command text cannot predict shell expansion, a `gh` wrapper on `PATH` also checks
the actual arguments (after expansion) and runs the real `gh` only for exact reads
of the two selected issues; every call is logged and asserted. The guard and
all transcripts are test artifacts, not product security controls.

`live-commands.js --issue-cases` uses a synthetic `gh` and no GitHub access. Each
case must stop before source inspection, stay on `main`, give a matching reason
and make no non-read `gh` call: missing, invalid and conflicting `Model:` lines;
unresolved Human decision; authentication failure; a pull request returned as an
issue; no remote; ambiguous fork remotes; cross-repository URL; malformed input.
Every case passes task notes.

`live-claude.js` installs the tracked working tree as a Claude Code plugin
(`claude plugin marketplace add` / `install`) into isolated `CLAUDE_CONFIG_DIR`
and `HOME` under `.tmp/`, removes inherited `CLAUDE*`/`ANTHROPIC*` variables, and
passes only the owner's short-lived OAuth access token in memory
(`CLAUDE_CODE_OAUTH_TOKEN`); the refresh token and owner configuration are not
copied or changed. It drives `/foreman:start-task` with `claude -p --model
claude-opus-5-5 --effort medium` and `--resume` per turn, against a synthetic
issue with **no** `Model:` line: start-task must ask for the level, the test
user answers A, then approves plan, commit and merge in separate turns. It
asserts no edits before plan approval, no commit or merge without its approval,
one `foreman:reviewer` call on Opus 5.5 (effort `high`, or a disclosed unset
effort; see #27) whose prompt includes the issue URL, title, body, level and
clarification, a `Merge: yes` verdict,
issue reads only, no push or GitHub write attempts (PreToolUse guard) and no
automatic-closing text. Usage counts against the owner's Claude subscription.

`live-workflow.js --issue` instead uses a **synthetic issue transport** (`gh`
fixture) for a tiny implementation in a disposable repository. The model,
checks and independent reviewer are real. It exercises issue-only settings,
branch naming, supplied reviewer snapshot, local completion and separate
fixture-owner approvals through commit/merge. Those approvals apply only to
the disposable fixture, not to this repository. It asserts issue reads only
and no automatic-closing commit text. It does not prove real GitHub access;
the separate real-read check does.

## Coverage

| Check | Method |
|---|---|
| ACP ordinary-prompt workaround: instruction expansion, task notes/issue references, empty input and streamed output before end_turn | Automated `acp.test.js`, real OpenCode 2.2.5 ACP with local mock provider; no tokens or Zed UI |
| Actual npm tarball, byte-identical shared assets, global commands/reviewer in two projects, local configuration, no copied definitions | Automated `package.test.js` |
| Installed source identity, checkout discovery separately, repeated unload/reload without duplicates | Automated `package.test.js` |
| Strong reviewer under cheaper parent, missing-model failure before dispatch, real permission evaluator | Automated installed-server `runtime-probe.js` |
| Skill first, disclosed absent-skill fallback, failed-skill stop, empty review; tracked and untracked defective source unchanged | Live model `live-review.js` |
| Missing settings, invalid/absent task, invalid task level, underqualified model stop before source inspection | Live model `live-commands.js` |
| Exact shared model display and second-blocking-review handback | Live model `live-commands.js`; handback is a resumed checkpoint, not two actual reviews |
| Full plan → implementation → independent review → commit → merge, separate explicit fixture-user approvals, branch cleanup, checks, no push attempts | Live model `live-workflow.js` |
| First real blocking review → fix and recheck → second real blocking review → handback without third review/commit/merge/push | Live model `live-workflow.js --blocking` |
| Real GitHub issue reads: open issue by number and URL, closed issue stops, PR URL rejected; expected values read from GitHub first | Live model `live-commands.js --issues` |
| Issue stop gates: missing/invalid/conflicting level, unresolved Human decision, auth failure, PR object, no remote, ambiguous fork, cross-repository URL, malformed input | Live model `live-commands.js --issue-cases`, synthetic gh |
| Claude Code installed plugin: issue with owner level clarification, plan/commit/merge approvals, reviewer model, effort and snapshot, no GitHub writes or push | Live model `live-claude.js`, synthetic gh |

The full workflow saves each approval turn, session context, Git checkpoint and
tool/model trace to `live-workflow-*/evidence.json`. It asserts no changes before
plan approval, no commit before commit approval and no main-branch change before
merge approval. Its no-push hook is a test guard, not a product security feature.
The blocking case injects a real source defect immediately before each reviewer
session's first dispatch. Both independent reviewers inspect actual broken code;
their responses are not mocked. Evidence includes reviewer contexts and source
snapshots proving the implementer fixed and retested between the reviews.

Permission denials are runtime checks, not an OS sandbox. In particular, shell
permission asks are distinct from conversational workflow approvals. Prompt
instructions (approval gates, never push, review retry limits) are behavioral
contracts, not hard security enforcement. Model-generated behavior can vary;
failed live assertions must be investigated, not silently retried to green.
The full-workflow fixture automatically allows runtime permission asks (like
`--auto`); use it only with its disposable, trusted source. It does not test
interactive permission dialogs. Hard reviewer denials are tested separately.

## Step 4 run record

- OpenCode 2.2.5: `npm test` passed all nine tests, including installed-server
  global commands in both consumers and repeated local reloads.
- `live-commands-Msgus7`: all seven live command scenarios passed.
- `live-review-BhG41k`: available, unavailable and failed-skill scenarios
  passed; empty review correctly blocked merge but exposed a too-narrow wording
  assertion. That assertion now accepts the observed equivalent wording.
- `live-review-Rqu8F3`: the same three checks passed; empty review again
  correctly blocked merge and described “no differences”, exposing another
  overly literal assertion. The assertion now matches the semantic alternatives.
- Initial full-workflow runs stopped on missing runtime permission response,
  then incomplete independent review. Fixture permissions and explicit review
  authorization/expected-load settings were corrected; no merge was accepted.
- `live-workflow-JmPc9g`: full approved workflow passed, including independent
  review approval, separate commit/merge gates, final checks and branch cleanup.
- `live-review-JHUopM`: all four reviewer scenarios passed after correcting the
  wording assertion (available skill, unavailable fallback, failed skill, empty).
- `live-workflow-Z2aloK`: two actual blocking reviews, fix/retest and handback
  passed. Independent review requested stronger proof of successful retesting,
  defect-specific reviewer findings and Git-option handling; those assertions
  are now included and independently approved.
- `live-workflow-4vCfl3`: stricter two-review workflow passed, including successful
  configured retest of fixed source, two defect-specific blocking reviews,
  handback and no third review, commit, merge or push attempts.
  The older
  `live-commands.js` second-review case remains a resumed checkpoint only.

Baseline: OpenCode **2.2.5**. Newer versions are not verified. See the task's
recorded run results for executed checks; the coverage table describes what
the scripts assert, not a claim that every run passes.

## Issue #19 ACP reproduction

The owner confirmed both slash commands work in the OpenCode TUI but produce
no visible response in Zed ACP, including a fully typed task command. An isolated
2.2.5 ACP probe reproduced missing output for foreman and a minimal plugin
command, while an ordinary prompt streamed a mock answer. Adding `session.wait`
to the command callbacks did not restore ACP output and was discarded.

The workaround uses ordinary `foreman models` / `foreman start-task ...` prompts,
expanded by a prompt-admission hook. `acp.test.js` checks their actual outgoing
model input and received ACP output; unit tests check identical slash/plain
instructions, attachment retention, metadata removal and unrelated prompts.
It does not claim that ACP slash commands, the Zed picker, real-model task
behaviour, or Claude Code live acceptance have been fixed or newly verified.

Owner-reported manual verification: both TUI slash commands still work; both
ordinary-message alternatives work in Zed; Zed slash commands still fail.
This confirms the workaround at command level, not full task-workflow acceptance.

Verification on 2.2.5: `npm test` passed all 13 tests, including installed-artifact
checks and ACP mock-provider transport. Independent skill-first review approved
the uncommitted change and also passed all 13 tests. `git diff --check` passed.
The first baseline suite run in a worktree nested under the original checkout
failed checkout-discovery path expectations; moving the worktree outside that
ancestor fixed isolation without a product/test-code change for that failure.

## Issue #16 acceptance status

- Deterministic suite: all 11 tests passed.
- OpenCode 2.2.5 with GPT-6.1 Sol medium: real issue reads by number and URL,
  title/model-level checks and PR-URL rejection passed in
  `.tmp/live-commands-BI8uGO/`. The first attempt rejected quoted read arguments
  in the test guard; that harness defect was corrected before the passing run.
- Synthetic issue workflow `.tmp/live-workflow-YUnfib/` reached independent
  review and separately approved fixture commit/merge, then failed its final
  no-write assertion: a read-only `gh api` GET was not recognized by the
  harness. Its trace contained no write attempt. The guard now permits that
  exact GET and rejects PATCH/data arguments. Do not count this run as a pass.
- The corrected synthetic issue workflow passed in
  `.tmp/live-workflow-gq5TE6/`: implementation, configured checks, independent
  Sol-high review, separate fixture commit/merge approvals and final read-only
  GitHub transport assertions. This run preceded the additional keyword-form
  assertion strengthening; those self-checks were independently reviewed.
- Remaining live acceptance, including all Claude Code live checks and
  broader failure cases, is tracked in
  [issue #17](https://github.com/RoccoNaude/foreman/issues/17), separately from
  the implementation merge. No complete cross-integration live acceptance is
  claimed here. Local `.tmp/` evidence is not part of the published package.

## Issue #17 acceptance runs (15 November 2026)

Branch `issue-17-live-acceptance` from `master` at `66539aa` (includes the
`81921cf` and `b0d590d` prompt changes). OpenCode 2.2.5,
`openai/gpt-6.1-sol#medium`, Sol `high` reviewer, OpenAI OAuth (ChatGPT plan).
Claude Code 2.1.283, `claude-opus-5-5`, `--effort medium`, Team subscription.

- `node tests/live-commands.js --issues --open-issue 26 --closed-issue 16`:
  first run `.tmp/live-commands-8zJbuz/` passed, but its closed case stopped only
  because the shared task text told every scenario to stop. Harness corrected
  (closed case gets no stop instruction and must ask for clarification). Rerun
  `.tmp/live-commands-Z4fzN8/` passed all four cases; the closed case stopped
  under the closed-issue rule and asked whether to proceed.
- `node tests/live-commands.js --issue-cases`: `.tmp/live-commands-Kv4rcq/`
  passed all ten cases on the first run; answers checked by hand for the
  correct stop reason.
- `node tests/live-workflow.js --issue`: `.tmp/live-workflow-13Yw6S/` passed on
  the current prompts.
- `node tests/live-claude.js`: first run `.tmp/live-claude-qlkLRp/` failed on
  a harness defect (the CommonJS `gh` fixture inherited the repository's
  `"type": "module"`); foreman stopped correctly without inventing issue
  contents. Second run `.tmp/live-claude-DooumQ/` passed clarification, plan,
  implementation and review gates, then failed the effort assertion: headless
  Claude Code exposes no Agent `effort` parameter, and start-task disclosed
  this in the reviewer prompt. Product gap tracked in
  [#27](https://github.com/RoccoNaude/foreman/issues/27); the harness now
  accepts `high` or an explicit disclosure and warns. Third run
  `.tmp/live-claude-mbBhRF/` passed through separate commit and merge
  approvals with that warning.

Review follow-up: the independent review (Merge: yes, no Must fix) listed five
Can wait gaps, fixed afterwards without new live runs: Bash reads of source
before the level is agreed, blocked shell attempts not asserted, guard allowing
other repositories, an automatic-closing check that failed on any "fix", and no
assertion of the model-check statement. Replaying the recorded evidence offline
showed the passing `--issues` run had two `gh api … --jq` reads (checking the
issue is not a pull request) silently blocked by the old guard; such read-only
GETs are now allowed. A second and third review found that text-guard patches
for `gh api` could be bypassed with attached or combined short flags and shell
brace expansion (e.g. `{-XPATCH,-fstate=closed}`); after handback the owner
chose the argument-level `gh` wrapper above. All recorded passing runs satisfy
the tightened checks on replay. After the final review, `--issues` was rerun
live on the final harness: `.tmp/live-commands-TOjYvt/` passed all four cases.
The wrapper logged every real `gh` call, passed a `gh api … --jq` read through
to the real `gh` and blocked nothing; no GitHub write occurred. `--issue-cases`,
`live-workflow.js --issue` and `live-claude.js` were not rerun after the
follow-up fixes.

Limits: the Claude Code run uses a synthetic `gh`; real GitHub reads are covered
by the OpenCode `--issues` run only. Claude Code stop-gate cases beyond the
missing-level clarification are not exercised live. The level A review effort
on Claude Code is not `high` until #27 is resolved.
