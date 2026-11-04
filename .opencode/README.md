# Foreman for OpenCode V2 — foundation

This is the package foundation, tested with OpenCode **2.2.5**. It does not yet
provide workflow commands. It registers the `foreman-reviewer` subagent.
OpenCode V1 is not supported.
The package is private to prevent accidental publication during development.

## Build and test

From the repository root, with Node.js and npm installed:

```sh
npm test
npm pack
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
`opencode.jsonc`. No workflow commands are registered at this stage.

## Loading the development artifact

Install the tarball into a directory you choose using `npm install /path/to/opencode-foreman-0.0.0.tgz`.
Then configure the installed **directory**, not the tarball, in either your global
`~/.config/opencode/opencode.jsonc` or project `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/node_modules/opencode-foreman"]
}
```

Global configuration applies across projects; project configuration applies only
where discovered. Remove the entry to unload. The plugin writes no configuration
files. No package has been published; `opencode plugin add` supports published
package names, but not tarballs. These examples do not install anything for you.

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

References: [plugin loading](https://opencode.ai/v2/docs/plugins/),
[server API](https://opencode.ai/v2/docs/build/plugins/server).

## Reviewer

Invoke `foreman-reviewer` as an independent subagent with the task ID and branch.
It requires `.foreman.md` and the task's tracker/plan entry. The pinned model is
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
