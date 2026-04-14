# Marketplace Assets

This file defines the recommended icon, screenshots, and GIF flow for the
Visual Studio Marketplace listing.

## Icon

- Source file used by the extension: `media/icon.png`
- Style: dark Cursor-like background; checklist / task metaphor works well next to branch workflow
- Goal: readable at small sizes in Marketplace search results

## Recommended Screenshots

Save screenshots in a public folder such as `media/screenshots/`.

### 1. `task-chats-sidebar.png`

Show:

- Cursor window with the **Task Chats** activity bar entry visible
- **Task Chats** panel expanded: branch row → tasks → subtasks / chats
- readable task titles and commit badges where applicable

Purpose:

- immediately shows task-centric organization on the current branch

### 2. `attach-current-chat.png`

Show:

- an already opened Cursor chat
- the **Task Chats** panel title actions or command palette
- **Attach Current Chat To Task** and picking a target task

Purpose:

- explains how existing chats get linked to a task

### 3. `open-existing-chat.png`

Show:

- a chat entry selected under a task
- the corresponding existing chat opened in Cursor

Purpose:

- proves the extension opens an existing chat instead of creating a new one

## Recommended GIF

File name:

- `media/screenshots/task-chats-demo.gif`

Target length:

- 10-15 seconds

Recommended script:

1. Start on branch `feature/task-chats-demo`.
2. Open the **Task Chats** panel.
3. Run **Create Task** (title + optional description).
4. Show the new task and linked chat under the branch.
5. Add a **subtask** or second **Open Task Chat**.
6. Switch to another branch such as `main` and show the tree scope change.
7. Switch back and reopen a chat from the tree.

Recording tips:

- use a clean workspace and readable branch/task names
- keep the Cursor sidebar visible
- avoid notifications covering the panel
- zoom in slightly so text is readable on Marketplace
- keep the motion slow enough to understand without pausing
