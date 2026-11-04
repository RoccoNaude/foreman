# Installed-plugin acceptance

Run from the repository root with Node and OpenCode V2 installed:

```sh
npm test
node tests/live-review.js
node tests/live-commands.js
node tests/live-workflow.js
node tests/live-workflow.js --blocking
```

The live commands consume model tokens and require existing OpenAI
authentication. The reviewer check also requires a cached `ponytail-review`
installation. They export/import only OpenAI credentials through memory into
isolated state, then remove the isolated credential database on exit.
All fixtures, npm artifacts, caches and evidence live in repository `.tmp/`.
No owner configuration is changed; nothing is published or pushed.

## Coverage

| Check | Method |
|---|---|
| Actual npm tarball, byte-identical shared assets, global commands/reviewer in two projects, local configuration, no copied definitions | Automated `package.test.js` |
| Installed source identity, checkout discovery separately, repeated unload/reload without duplicates | Automated `package.test.js` |
| Strong reviewer under cheaper parent, missing-model failure before dispatch, real permission evaluator | Automated installed-server `runtime-probe.js` |
| Skill first, disclosed absent-skill fallback, failed-skill stop, empty review; tracked and untracked defective source unchanged | Live model `live-review.js` |
| Missing settings, invalid/absent task, invalid task level, underqualified model stop before source inspection | Live model `live-commands.js` |
| Exact shared model display and second-blocking-review handback | Live model `live-commands.js`; handback is a resumed checkpoint, not two actual reviews |
| Full plan → implementation → independent review → commit → merge, separate explicit fixture-user approvals, branch cleanup, checks, no push attempts | Live model `live-workflow.js` |
| First real blocking review → fix and recheck → second real blocking review → handback without third review/commit/merge/push | Live model `live-workflow.js --blocking` |

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
