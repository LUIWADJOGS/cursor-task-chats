import * as vscode from 'vscode';
import type { CursorComposerSummary } from '../types/cursorComposer';
import type { TaskChatEntity, TaskEntity, TaskProgressSummary } from '../types/taskManager';
import { openTaskRepository } from '../db/taskRepository';
import { getCurrentBranch } from '../git/getCurrentBranch';
import { getCommitDiffSince, getBranchBaseCommit } from '../git/commitDiff';
import { showCommitDiffPanel } from './commitDiffPanel';
import { getComposerData, getRootComposers } from '../cursor/composerStorage';
import { openComposerWithCursorCommand } from '../cursor/openComposer';
import { computeTaskProgressSummary } from '../tasks/taskProgress';
import { buildPromptTextForTask } from '../tasks/taskPromptContext';
import { openTaskDetailPanel } from './taskDetailPanel';
import { t, taskStatusShortLabel } from '../i18n';

export type TaskTreeNode = BranchRootTreeItem | TaskTreeItem | TaskChatTreeItem;

export class BranchRootTreeItem extends vscode.TreeItem {
  readonly nodeKind = 'branch' as const;
  constructor(public readonly branchName: string) {
    super(t('task.tree.branchLabel', { branch: branchName }), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'branchRoot';
    this.iconPath = new vscode.ThemeIcon('git-branch');
    this.description = t('task.tree.branchDescription');
  }
}

export class TaskTreeItem extends vscode.TreeItem {
  readonly nodeKind = 'task' as const;
  constructor(
    public readonly task: TaskEntity,
    public readonly progress: TaskProgressSummary,
    public readonly commitCount: number,
    collapsible: vscode.TreeItemCollapsibleState,
    checklistDone: number,
    checklistTotal: number
  ) {
    super(task.title, collapsible);
    this.contextValue = commitCount > 0 ? 'task-with-diff' : 'task';
    const badge = commitCount > 0 ? ` ${t('chat.commitsBadge', { count: String(commitCount) })}` : '';
    const cl =
      checklistTotal > 0 ? ` [${checklistDone}/${checklistTotal}]` : '';
    this.description = `${taskStatusShortLabel(task.status)}${cl}${badge}`;
    this.iconPath = new vscode.ThemeIcon(task.status === 'done' ? 'pass' : 'checklist');
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${task.title}**\n\n`);
    tooltip.appendText(`${t('task.tooltip.branch')}: ${task.branchName}\n`);
    tooltip.appendText(
      `${t('task.tooltip.progress')}: ${progress.doneSubtasks}/${progress.totalSubtasks} ${t('task.tooltip.subtasks')}, ${progress.commitCount} ${t('task.tooltip.commits')}, ${progress.activeChatCount} ${t('task.tooltip.chats')}\n`
    );
    if (checklistTotal > 0) {
      tooltip.appendText(`Checklist: ${checklistDone}/${checklistTotal}\n`);
    }
    if (task.description?.trim()) {
      tooltip.appendText(`\n${task.description.trim().slice(0, 500)}${task.description.length > 500 ? '…' : ''}\n`);
    }
    if (commitCount > 0 && progress.changedFiles.length > 0) {
      tooltip.appendText(`\n${t('chat.commitsTooltipHeader', { count: String(commitCount) })}\n`);
      const MAX_FILES = 15;
      for (const file of progress.changedFiles.slice(0, MAX_FILES)) {
        tooltip.appendText(`• ${file}\n`);
      }
      if (progress.changedFiles.length > MAX_FILES) {
        tooltip.appendText(
          t('chat.commitsTooltipMoreFiles', {
            count: String(progress.changedFiles.length - MAX_FILES),
          })
        );
      }
    }
    this.tooltip = tooltip;
  }
}

export class TaskChatTreeItem extends vscode.TreeItem {
  readonly nodeKind = 'chat' as const;
  constructor(
    public readonly task: TaskEntity,
    public readonly chat: TaskChatEntity,
    public readonly composer: CursorComposerSummary,
    taskCommitCount: number
  ) {
    const name =
      chat.customName ?? composer.name ?? chat.cachedName ?? `#${chat.composerId.slice(0, 8)}`;
    super(name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = taskCommitCount > 0 ? 'taskChat-with-diff' : 'taskChat';
    const badge = taskCommitCount > 0 ? ` ${t('chat.commitsBadge', { count: String(taskCommitCount) })}` : '';
    this.description = t('task.tree.chatDescription') + badge;
    this.iconPath = new vscode.ThemeIcon('comment');
    this.command = {
      command: 'cursorTaskChats.openChat',
      title: t('chat.openTitle'),
      arguments: [this],
    };
    if (composer.subtitle) {
      const tip = new vscode.MarkdownString();
      tip.appendText(composer.subtitle);
      this.tooltip = tip;
    }
  }
}

export class TaskChatsProvider implements vscode.TreeDataProvider<TaskTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getWorkspaceFolder: () => vscode.WorkspaceFolder | undefined
  ) {}

  getCurrentWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return this.getWorkspaceFolder();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TaskTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TaskTreeNode): Promise<TaskTreeNode[]> {
    const folder = this.getWorkspaceFolder();
    if (!folder) {
      return [];
    }
    const repo = await openTaskRepository(this.context, folder);
    const branch = await getCurrentBranch(folder);
    const workspacePath = folder.uri.fsPath;

    if (!element) {
      return [new BranchRootTreeItem(branch)];
    }

    if (element instanceof BranchRootTreeItem) {
      const roots = repo.getRootTasksForBranch(branch);
      const allTasks = repo.getAllTasks();
      const allChats = repo.getAllChats();
      const items = await Promise.all(
        roots.map(async (task) => {
          const progress = await computeTaskProgressSummary(workspacePath, task, allTasks, allChats);
          const subtasks = repo.getSubtasks(task.id);
          const chats = repo.getChatsForTask(task.id);
          const collapsible =
            subtasks.length + chats.length > 0
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.None;
          const cl = repo.getChecklistStats(task.id);
          return new TaskTreeItem(task, progress, progress.commitCount, collapsible, cl.done, cl.total);
        })
      );
      return items.sort((a, b) => {
        const tb = new Date(b.task.updatedAt).getTime();
        const ta = new Date(a.task.updatedAt).getTime();
        return tb - ta;
      });
    }

    if (element instanceof TaskTreeItem) {
      const task = element.task;
      const allTasks = repo.getAllTasks();
      const allChats = repo.getAllChats();
      const composerData = await getComposerData(this.context);
      const composerById = new Map(
        getRootComposers(composerData).map((c) => [c.composerId, c])
      );

      const subtasks = repo.getSubtasks(task.id);
      const subItems = await Promise.all(
        subtasks.map(async (st) => {
          const progress = await computeTaskProgressSummary(workspacePath, st, allTasks, allChats);
          const stChats = repo.getChatsForTask(st.id);
          const stNested = repo.getSubtasks(st.id);
          const collapsible =
            stNested.length + stChats.length > 0
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.None;
          const cl = repo.getChecklistStats(st.id);
          return new TaskTreeItem(st, progress, progress.commitCount, collapsible, cl.done, cl.total);
        })
      );

      const chats = repo.getChatsForTask(task.id);
      const chatItems: TaskChatTreeItem[] = [];
      for (const chat of chats) {
        const liveComposer = composerById.get(chat.composerId);
        const resolvedName =
          chat.customName ?? liveComposer?.name ?? chat.cachedName ?? `#${chat.composerId.slice(0, 8)}`;
        const composer: CursorComposerSummary = liveComposer
          ? { ...liveComposer, name: resolvedName }
          : {
              composerId: chat.composerId,
              name: resolvedName,
              createdAt: new Date(chat.createdAt).getTime(),
            };

        if (liveComposer?.name && liveComposer.name !== chat.cachedName) {
          repo.updateTaskChatLink(chat.id, { cachedName: liveComposer.name });
        }

        const taskProgress = await computeTaskProgressSummary(workspacePath, task, allTasks, allChats);
        chatItems.push(
          new TaskChatTreeItem(
            task,
            { ...chat, cachedName: composer.name ?? chat.cachedName },
            composer,
            taskProgress.commitCount
          )
        );
      }

      chatItems.sort((a, b) => {
        const rb = b.composer.lastUpdatedAt ?? b.composer.createdAt;
        const ra = a.composer.lastUpdatedAt ?? a.composer.createdAt;
        return rb - ra;
      });

      subItems.sort((a, b) => {
        const tb = new Date(b.task.updatedAt).getTime();
        const ta = new Date(a.task.updatedAt).getTime();
        return tb - ta;
      });

      return [...subItems, ...chatItems];
    }

    return [];
  }
}

export type TaskChatOpenTarget = {
  task: TaskEntity;
  chat: TaskChatEntity;
  composer: CursorComposerSummary;
};

export function registerTaskTreeCommands(
  context: vscode.ExtensionContext,
  provider: TaskChatsProvider
): void {
  const getFolder = (): vscode.WorkspaceFolder | undefined => provider.getCurrentWorkspaceFolder();

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.openTaskDetails', async (item?: TaskTreeItem) => {
      const folder = getFolder();
      if (!folder || !item) {
        return;
      }
      const repo = await openTaskRepository(context, folder);
      await openTaskDetailPanel(context, folder, repo, () => provider.refresh(), item.task);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.openChat', async (item: TaskChatTreeItem) => {
      const opened = await openComposerWithCursorCommand(context, item.composer.composerId);
      if (opened) {
        return;
      }
      void vscode.window.showWarningMessage(
        t('messages.openExisting.failed', {
          name: item.composer.name ?? item.composer.composerId,
        })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.copyPrompt', async (item: TaskChatTreeItem) => {
      if (!item.chat.promptText) {
        void vscode.window.showInformationMessage(t('messages.copyPrompt.missing'));
        return;
      }
      await vscode.env.clipboard.writeText(item.chat.promptText);
      void vscode.window.showInformationMessage(t('messages.copyPrompt.success'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.archiveChat', async (item: TaskChatTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        return;
      }
      const repo = await openTaskRepository(context, folder);
      repo.archiveTaskChatLink(item.chat.id);
      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.detach.taskChat', {
          name: item.composer.name ?? t('chat.untitled'),
        })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.showCommitDiff', async (item: TaskChatTreeItem | TaskTreeItem) => {
      const folder = getFolder();
      const task = item.task;
      if (!folder || !task.baselineCommitHash) {
        void vscode.window.showInformationMessage(t('messages.commitDiff.noStartCommit'));
        return;
      }
      const { changedFiles } = await getCommitDiffSince(folder.uri.fsPath, task.baselineCommitHash);
      if (changedFiles.length === 0) {
        void vscode.window.showInformationMessage(t('messages.commitDiff.noChanges'));
        return;
      }
      const name =
        item instanceof TaskChatTreeItem
          ? item.composer.name ?? t('chat.untitled')
          : item.task.title;
      const shown = await showCommitDiffPanel(
        folder.uri.fsPath,
        task.baselineCommitHash,
        name,
        t('messages.taskDiff.header', { task: task.title })
      );
      if (!shown) {
        void vscode.window.showInformationMessage(t('messages.commitDiff.noChanges'));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.showBranchDiff', async (item: TaskChatTreeItem | TaskTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const baseCommit = await getBranchBaseCommit(folder.uri.fsPath);
      if (!baseCommit) {
        void vscode.window.showInformationMessage(t('messages.branchDiff.noBase'));
        return;
      }
      const task = item.task;
      const name = item instanceof TaskChatTreeItem ? item.composer.name ?? t('chat.untitled') : item.task.title;
      const shown = await showCommitDiffPanel(
        folder.uri.fsPath,
        baseCommit,
        name,
        t('messages.branchDiff.header', { branch: task.branchName })
      );
      if (!shown) {
        void vscode.window.showInformationMessage(t('messages.commitDiff.noChanges'));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.renameChat', async (item: TaskChatTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const currentName = item.chat.customName ?? item.composer.name ?? '';
      const newName = await vscode.window.showInputBox({
        prompt: t('messages.renameChat.inputPrompt'),
        placeHolder: t('messages.renameChat.inputPlaceholder'),
        value: currentName,
        valueSelection: [0, currentName.length],
      });
      if (newName === undefined) {
        return;
      }
      const trimmed = newName.trim() || undefined;
      repo.updateTaskChatLink(item.chat.id, { customName: trimmed });
      provider.refresh();
      if (trimmed) {
        void vscode.window.showInformationMessage(t('messages.renameChat.success', { name: trimmed }));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.renameTask', async (item: TaskTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const currentName = item.task.title;
      const newName = await vscode.window.showInputBox({
        prompt: t('messages.renameTask.inputPrompt'),
        placeHolder: t('messages.renameTask.inputPlaceholder'),
        value: currentName,
        valueSelection: [0, currentName.length],
        validateInput: (value) => (value?.trim() ? null : t('messages.renameTask.inputValidation')),
      });
      if (newName === undefined || !newName.trim()) {
        return;
      }
      repo.updateTask(item.task.id, { title: newName.trim() });
      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.renameTask.success', { name: newName.trim() })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.changeTaskStatus', async (item: TaskTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const picked = await vscode.window.showQuickPick(
        [
          { label: t('task.status.todo'), value: 'todo' as const },
          { label: t('task.status.in_progress'), value: 'in_progress' as const },
          { label: t('task.status.blocked'), value: 'blocked' as const },
          { label: t('task.status.done'), value: 'done' as const },
        ],
        { placeHolder: t('messages.changeStatus.placeholder') }
      );
      if (!picked) {
        return;
      }
      repo.updateTask(item.task.id, { status: picked.value });
      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.changeStatus.success', { status: picked.label })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.changeTaskBranch', async (item: TaskTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const nextBranch = await vscode.window.showInputBox({
        prompt: t('messages.changeTaskBranch.inputPrompt'),
        placeHolder: t('messages.changeTaskBranch.inputPlaceholder'),
        value: item.task.branchName,
        valueSelection: [0, item.task.branchName.length],
        validateInput: (value) => (value.trim() ? null : t('messages.changeTaskBranch.inputValidation')),
      });
      if (nextBranch === undefined) {
        return;
      }
      const normalized = nextBranch.trim();
      if (!normalized || normalized === item.task.branchName) {
        return;
      }
      repo.updateTask(item.task.id, { branchName: normalized });
      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.changeTaskBranch.success', { name: item.task.title, branch: normalized })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.archiveTask', async (item: TaskTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        return;
      }
      const repo = await openTaskRepository(context, folder);
      repo.archiveTask(item.task.id);
      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.detach.task', { name: item.task.title })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.copyTaskPrompt', async (item: TaskTreeItem) => {
      const folder = getFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const text = await buildPromptTextForTask(context, folder, item.task);
      await vscode.env.clipboard.writeText(text);
      void vscode.window.showInformationMessage(t('messages.copyTaskPrompt.success'));
    })
  );
}
