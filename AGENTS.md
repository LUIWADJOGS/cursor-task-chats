# Agent Notes

## Project Workflow

- Keep `CHANGELOG.md` updated for user-visible changes before packaging a new `.vsix`.
- When the user asks to "подними версию" or "собери", bump the patch version in both `package.json` and `package-lock.json`, then run `npx @vscode/vsce package`.
- Do not create git commits unless the user explicitly asks.
- Do not revert unrelated local changes. This workspace is often edited iteratively by the user.
- Store all planning and documentation files in `docs/`. Keep implementation plans in `docs/plans/` and general documentation in `docs/`.
- **Language:** all prose under `docs/` (including plans) must be **Russian**; code identifiers, command ids, and file paths may stay as in the repo. **`CHANGELOG.md` is English** (Keep a Changelog). **Publication-facing** text stays **English** where applicable: `MARKETPLACE_ASSETS.md`, default UI strings in `package.nls.json`, and the changelog. Root `README.md` may be Russian or English per project choice. Other `package.nls.*.json` files follow their locale.

## Extension Notes

- YouGile setup stores hidden integration values directly in `.vscode/settings.json`; some keys are intentionally not contributed to Settings UI.
- Time tracking uses `https://yougile.com/data/extension/exec` with the `timetracking` extension and a manually provided `user_key`.
- Keep debug-only panels behind `cursorTaskChats.yougile.showDebugPanels`.

## Validation

- Run `npm run compile` after TypeScript or manifest changes.
- For packaging, `vsce` runs compile via `vscode:prepublish`, but compile can be run earlier for faster feedback.
