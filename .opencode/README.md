# Foreman for OpenCode V2

Commands and independent review are implemented and acceptance-tested with
OpenCode **2.2.5**. V1 is unsupported; newer versions are unverified.
The package is private and not published to npm.

## Commands and prerequisites

- `/foreman/start-task <id> [notes]`: model check, plan approval, branch,
  implementation/checks, independent review, recording, separate commit and merge
  approvals. One fix/review retry; a second blocking review hands back to you.
- `/foreman/models`: displays only the packaged models-per-level table unchanged.
- `foreman-reviewer`: independent subagent pinned to `openai/gpt-6.1-sol#high`.

You need git, OpenCode V2, access to the pinned OpenAI reviewer and a qualified
implementation model. Install `ponytail-review` separately for the primary review
path. Create `.foreman.md` and, for local tasks, a tracker/plan from the original
[`shared/templates/`](../shared/templates/) assets. Put project rules in
`AGENTS.md`; Claude Code memories and plugin skills do not transfer automatically.
See the [quick start](../README.md#quick-start).

GitHub issues are a third source: `/foreman/start-task issue 42`,
`issue #42 [notes]` or `issue https://github.com/owner/repo/issues/42 [notes]`.
An available GitHub connector or authenticated `gh` is needed only for issues.
Missing/ambiguous repository identity, access failures, closed issues, PR URLs
and unclear acceptance criteria stop for clarification. A missing `Model:` line
prompts for a level, never an estimate. Tracker and Plan may both be `None` for
issue-only work. Review uses the supplied issue snapshot; completion is local,
not a GitHub comment/edit/closure. Remote writes need separate approval.
See [shared issue rules](../shared/github-issues.md) for the full policy.

## Zed / ACP workaround

On OpenCode 2.2.5, slash commands submitted through ACP can finish without
forwarding generated output, even when the full command and ID are typed.
Its ACP command advertisements also omit input hints, so Zed may submit a
selected command before you can enter arguments. The TUI slash commands work
normally; these are separate client paths.

With foreman 0.2.1 or later, type an **ordinary message**, without a leading `/`:

```text
foreman models
foreman start-task 7.8
foreman start-task F01 Focus on the import failure
foreman start-task issue #42 Optional notes
```

These prompts expand to the same installed instructions as the slash commands;
model checks and plan/commit/merge approvals are unchanged. `foreman start-task`
without a reference asks for one before inspecting project files. Attachments
are retained; their original text-position metadata is removed after expansion.
These exact plain-prompt prefixes are reserved when the plugin is enabled.

This is a foreman-only compatibility path, not a fix to OpenCode or Zed. It does
not change Zed's slash picker. Automated ACP checks use a local mock model and
prove instruction expansion and output delivery, not real-model judgement or
Zed UI behavior. The owner independently confirmed that both plain prompts work
in Zed, both slash commands still work in the OpenCode TUI, and Zed slash
commands still fail. This is command-level confirmation, not a claim of full
end-to-end task-workflow acceptance. After updating foreman, open a new Zed agent
thread so its ACP process loads the updated plugin.

## Global Git and project-local installation

OpenCode supports npm-compatible Git specifications without an npm release:

```sh
opencode plugin add github:RoccoNaude/foreman
opencode plugin list
```

The CLI installs globally. For project-only configuration, merge this into the
project's `opencode.jsonc` instead:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:RoccoNaude/foreman"]
}
```

For manual global configuration put the same entry in
`~/.config/opencode/opencode.jsonc` (under `$XDG_CONFIG_HOME` if set). Preserve
unrelated configuration. Git uses the selected remote revision; it cannot install
unmerged checkout changes. Pin `github:RoccoNaude/foreman#<full-commit-hash>` for
reproducibility. Git loading is supported by OpenCode's V2 plugin loader; the
acceptance-tested artifact route below uses an installed tarball directory.

## Build and test

From the repository root, with Node.js and npm installed:

```sh
npm test
npm pack --pack-destination .tmp
```

Integration tests also require `opencode` 2.2.5 on PATH. They install the actual
tarball into isolated directories under `.tmp/`, not into your OpenCode setup.
There are no npm dependencies or build steps; the plugin exports the V2
`{ id, setup }` contract directly rather than importing the SDK.

## Checkout discovery

OpenCode automatically loads `.opencode/plugins/index.js` when opening this
repository. That entrypoint re-exports `foreman.mjs`; npm resolves that same
implementation directly. Both use the plugin ID `foreman`.
In OpenCode 2.2.5, a discovered checkout takes precedence over a configured
package with that ID; tests suppress ancestor discovery when checking the
installed artifact so a checkout cannot mask a broken package.
To disable it in a checkout, configure `"plugins": ["-foreman"]` in
`opencode.jsonc`. Commands and reviewer registrations are disposed on unload.

## Loading the tested artifact

Install the tarball into a directory you choose:

```sh
npm install --prefix /absolute/path/to/foreman-install --ignore-scripts --no-audit --no-fund /path/to/opencode-foreman-0.2.1.tgz
```

Then configure the installed **directory**, not the tarball, in either your global
`~/.config/opencode/opencode.jsonc` or project `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/foreman-install/node_modules/opencode-foreman"]
}
```

Global configuration applies across projects; project configuration applies only
where discovered. Remove the entry to unload. The plugin writes no configuration
files. `opencode plugin add` accepts npm names and Git specs, not tarballs or
local paths; configure an installed directory directly. These examples do not
install anything for you.

## Updating and removal

For a global unpinned Git installation:

```sh
opencode plugin check
opencode plugin update github:RoccoNaude/foreman
opencode plugin remove github:RoccoNaude/foreman
```

Use the exact configured target (including its revision, if present). Exact full
commit hashes are skipped by update: change the configured pin to adopt a new
reviewed revision. For project-only installs change/remove the entry in that
project's config; the management CLI operates on global packages.

For a local artifact, pack the new version, install that tarball into the chosen
prefix again and reload. Remove its config entry before uninstalling the package
with `npm uninstall --prefix /absolute/path/to/foreman-install opencode-foreman`.
Config saves reload automatically; `/reload` forces reload. Unwatched local
dependency changes may need `opencode service restart`. Do not delete shared
OpenCode caches or unrelated configuration to uninstall. Your `.foreman.md`,
tracker/plan and `AGENTS.md` stay yours and are never removed by the plugin.

## Agent contribution mechanism

The V2 server API uses `ctx.agent.transform(editor => editor.update(id, callback))`.
In 2.2.5, `update` creates a default agent when the ID does not exist; there is no
`AgentEditor.add`. The server documentation does not spell out this creation
behavior, so the installed-runtime test guards it with a minimal fixture.
Registrations are scoped to plugin lifetime and disappear on unload; no agent
Markdown is copied to user configuration. Tests also remove and restore the
plugin configuration in one running server, checking agent cleanup and active
plugin status after each reload. The fixture is not shipped.

Shared assets are packed directly from `shared/`, with no maintained or generated
copy. Code reading them must use `new URL("../../shared/...", import.meta.url)` from
`.opencode/plugins/foreman.mjs`, never a path relative to the consuming project.
The tarball includes the plugin entrypoint, discovery shim, command/reviewer
Markdown, this guide, original shared assets, root README, package metadata and
licence. Tests, historical `opencode/` notes and Claude Code integration files
are excluded. There is no runtime SDK dependency, build step or lockfile.

References: [plugin loading](https://opencode.ai/v2/docs/plugins/),
[server API](https://opencode.ai/v2/docs/build/plugins/server).

## Reviewer

Invoke `foreman-reviewer` as an independent subagent with the task ID and branch.
It requires `.foreman.md` and the task's tracker/plan entry or complete issue
snapshot and owner clarifications. The pinned model is
`openai/gpt-6.1-sol#high` (level A); configure access to that model before use.
To upgrade it, change `reviewerModel` in `.opencode/plugins/foreman.mjs`, then
update the shared model table and test expectations. Registration and the
fallback guard both use that one runtime pin.
An unavailable pinned model must fail, not fall back to the parent's model.
Install `ponytail-review` separately: the reviewer loads it first; only an
unavailable skill permits a disclosed manual fallback. Skill failures block approval.

Edits, delegation, MCP and other tools are denied by default. Reads/search and
`ponytail-review` are allowed; shell (including tests), sensitive environment
files and external directories require permission. Approve shell requests once,
not with broad saved approvals: shell runs with your user privileges, and test
commands can write. Project/session policies and later plugins can change these
permissions; this agent policy is not an OS sandbox.

### Live reviewer checks (opt-in)

`node tests/live-review.js` consumes tokens using your existing OpenAI sign-in.
It installs a tarball and reviews isolated fixture repositories under `.tmp/`,
covering skill-first order, unavailable-skill fallback, failed-skill refusal,
empty changes and an untracked defect. Install `ponytail-review` first.
The harness exports only OpenAI credentials through memory into an isolated V2
database and deletes that database on normal exit. It leaves fixture transcripts
for inspection, not credentials. No global configuration is changed. Do not
force-kill the harness: doing so can prevent credential cleanup.
These model-driven checks are separate from the deterministic `npm test` suite.

## Maintenance and release

1. Review [acceptance coverage and step 4 evidence](../tests/README.md) in the
   checkout. Run `npm test` on 2.2.5; rerun the documented live checks when runtime,
   prompts, permissions or reviewer selection change. Live checks consume tokens.
   Do not claim newer versions are tested without rerunning acceptance.
2. Update `shared/model-levels.md`, runtime pin and tests together for reviewer
   changes. Keep shared formats compatible with Claude Code. Project-specific
   instructions belong in the consuming project's `AGENTS.md`, not shared assets.
3. Bump root `package.json` and the OpenCode README badge (patch fixes, minor new
   behavior while pre-1.0). Shared changes also bump the Claude Code manifest and
   badge under its release convention. No requirement that the two versions match.
4. Run `npm pack --dry-run --json`, inspect the file list, then
   `npm pack --pack-destination .tmp`. Tests install the actual artifact and verify
   shared bytes and global/local loading, without owner-global configuration.
5. Obtain independent review and owner approval for commit/push, PR and merge.
   Keep `private: true` as the publication guard. Git and tarball installation
   work while private. No release tag exists or is required for these examples.
6. **Only after separate publication/tag approval:** choose the release revision
   and tag, verify npm name/access and package contents, remove `private` if npm
   publication is intended, and use `npm publish --dry-run` before an approved
   `npm publish`. Do not advertise an npm installation until publication succeeds.

Known limits: conversational approval/no-push/retry rules are model instructions,
not hard security enforcement. Tests cover observed behavior, not a guarantee
for every model response. Shell permissions are separate from workflow approvals;
the reviewer is not sandboxed. Checkout discovery can mask an installed package.
The prepared metadata does not constitute publication, a release tag or approval.
