# Repository development

- Keep Claude Code working. OpenCode V2 is tested on 2.2.5; do not use V1 plugin APIs.
- `shared/` is the source of truth for both integrations. Do not stage or maintain
  copies; OpenCode reads assets relative to its installed module, not the project.
- OpenCode runtime: `.opencode/plugins/foreman.mjs`, `start-task.md`, `reviewer.md`.
  `index.js` is the checkout-discovery shim. No dependencies or build step.
- Run `npm test`; see `tests/README.md` for opt-in, token-consuming live acceptance.
  Keep fixtures, artifacts, caches and runtime state inside repository `.tmp/`.
- Reviewer upgrades change `reviewerModel`, `shared/model-levels.md` and test
  expectations together. Skill-first review is primary; failure is not absence.
- Versions are separate: root `package.json` (OpenCode),
  `.claude-plugin/plugin.json` (Claude Code). Shared changes bump both; update
  README badges. Keep the npm package private until publication is approved.
- For epic #5 work: confirm scope/model/plan, branch from clean `master`, run
  checks and obtain independent review. Ask owner approval before commit/push,
  PR creation and merge. Publication, release tags and owner-global installation
  need separate approval. The product's no-push rule is not a ban on approved
  repository development pushes.
