# Agent Notes

## Project Workflow

- Keep `CHANGELOG.md` updated for user-visible changes before packaging a new `.vsix`.
- When the user asks to "подними версию" or "собери", bump the patch version in both `package.json` and `package-lock.json`, then run `npx @vscode/vsce package`.
- Do not create git commits unless the user explicitly asks.
- Do not revert unrelated local changes. This workspace is often edited iteratively by the user.

## Extension Notes

- YouGile setup stores hidden integration values directly in `.vscode/settings.json`; some keys are intentionally not contributed to Settings UI.
- Time tracking uses `https://yougile.com/data/extension/exec` with the `timetracking` extension and a manually provided `user_key`.
- Keep debug-only panels behind `cursorTaskChats.yougile.showDebugPanels`.

## Validation

- Run `npm run compile` after TypeScript or manifest changes.
- For packaging, `vsce` runs compile via `vscode:prepublish`, but compile can be run earlier for faster feedback.
