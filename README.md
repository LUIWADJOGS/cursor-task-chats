# Cursor Task Chats

Organize **tasks** on your current git branch, link **multiple Cursor Composer chats** to each task, and open **task-aware prompts** that include branch context, subtask status, and git progress since a **baseline commit**.

## Why use it

Cursor keeps one long list of chats. Branches alone are not enough when one branch carries several features or refactors. This extension adds a **task layer**: each task has a baseline commit, optional subtasks, and one or more chats so you can reopen the right session and see **how much code moved** since the task started.

## Features

- **Create task** on the current branch with title, optional description, and baseline `HEAD`
- **Subtasks** (nested tasks under a parent)
- **Multiple chats per task** (new prompt session or attach the active chat)
- **Tree**: current branch → root tasks → subtasks and chats
- **Progress**: commit count and changed files since the task baseline (shown in tooltips and used in prompts)
- **Diff panels**: changes since task baseline; optional “all branch changes vs base” (`main` / `master` / `develop`)
- **Copy** stored chat prompt or a freshly built **task prompt**
- **SQLite** database under the workspace (default `.cursor/task-chats/tasks.sqlite`): tasks, chats, **checklist**, **file attachments** (paths only)
- **Task details** webview: edit title, description, status; manage checklist; attach workspace files; open attached paths
- One-time **import** from legacy `globalState` JSON (older 1.0.x builds) into SQLite when the DB file is first created
- English and Russian UI (same as VS Code / Cursor UI language)

## Data and privacy

- The DB file lives **on disk** inside your workspace (path configurable via **Settings → Cursor Task Chats → database relative path**). Add it to `.gitignore` or commit it, depending on whether you want to share tasks with the team.
- **Attachments** are stored as **relative paths**; files are not copied.

## How to use

1. Open a **git** workspace (single-root folder).
2. Open **Task Chats** in the Activity Bar.
3. Use **Create Task** (toolbar): enter title and optional description → a new Cursor chat opens with a generated prompt → the chat is linked to the task.
4. Add **subtasks** from the toolbar or task context menu; open **Open Task Chat** for another session on the same task.
5. Use **Attach Current Chat To Task** to bind the focused Composer tab to a picked task.
6. Switch git branches: the tree lists tasks for the **current** branch only.

## Commands

| Command | Description |
|--------|-------------|
| Create Task | New task + new Cursor chat with task prompt |
| Create Subtask | New child task (pick parent if not from tree) + new chat |
| Open Task Chat (new prompt) | New Composer chat for the selected task |
| Attach Current Chat To Task | Link focused/open chat to a task |
| Show Task Chats For Current Branch | Quick Pick of all task chats on this branch |
| Open Task Details | Webview: description, checklist, attachments |
| Rename Task / Change Task Status / Change Task Branch / Archive Task | Task management |
| Open in Cursor Chat / Copy prompts / Show diffs / Rename chat / Remove chat | Per-chat actions |

## Requirements

- **Cursor** (primary target). Reopening chats uses `composer.openComposer` when available.
- **Git** repo; current branch from workspace root.
- **Python 3** on `PATH` is used to read Cursor’s workspace `state.vscdb` (same approach as related extensions) for Composer metadata.

## Install from source

```bash
npm install
npm run compile
```

Then **Run Extension** from this folder in VS Code/Cursor, or package a `.vsix` with `vsce package` if you use the VSCE CLI.

## Tests

```bash
npm test
```

Runs a small **Node test** suite (e.g. prompt truncation for Cursor deeplink limits).

## License

MIT. See [LICENSE](LICENSE).
