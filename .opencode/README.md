# Foreman for OpenCode V2 — foundation

This is the package foundation, tested with OpenCode **2.2.5**. It does not yet
provide workflow commands or a reviewer. OpenCode V1 is not supported.
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
`opencode.jsonc`. No commands or reviewer are registered at this stage.

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
