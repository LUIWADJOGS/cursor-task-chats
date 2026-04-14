import * as vscode from 'vscode';
import { getCurrentBranch, getHeadCommit } from './git/getCurrentBranch';
import { GitContentProvider, GIT_CONTENT_SCHEME } from './git/gitContentProvider';
import { openPromptInCursor } from './chat/createPromptDeeplink';
import { openTaskRepository, flushAllTaskRepositories } from './db/taskRepository';
import { TaskChatsProvider, TaskTreeItem, registerTaskTreeCommands } from './views/taskChatsProvider';
import { registerGitBranchWatcher } from './watchers/gitBranchWatcher';
import { t, taskStatusLabel } from './i18n';
import {
  getActiveComposerId,
  getComposerData,
  getOpenComposerIds,
  getRootComposers,
  getSelectedComposerId,
  getSelectedRootComposer,
  waitForNewComposer,
} from './cursor/composerStorage';
import { openComposerWithCursorCommand } from './cursor/openComposer';
import { buildPromptTextForTask } from './tasks/taskPromptContext';
import type { TaskEntity } from './types/taskManager';

async function pickTaskFromBranch(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  branch: string,
  placeHolderKey: 'messages.createSubtask.pickParent' | 'messages.attachCurrent.pickTask'
): Promise<TaskEntity | undefined> {
  const repo = await openTaskRepository(context, folder);
  const tasks = repo.getTasksForBranch(branch);
  if (tasks.length === 0) {
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    tasks.map((task) => {
      const parent = task.parentTaskId ? repo.getTaskById(task.parentTaskId) : null;
      const label = parent ? `${parent.title} › ${task.title}` : task.title;
      return {
        label,
        description: taskStatusLabel(task.status),
        task,
      };
    }),
    { placeHolder: t(placeHolderKey), matchOnDescription: true }
  );
  return picked?.task;
}

export function activate(context: vscode.ExtensionContext): void {
  const getWorkspaceFolder = (): vscode.WorkspaceFolder | undefined =>
    vscode.workspace.workspaceFolders?.[0];

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(GIT_CONTENT_SCHEME, new GitContentProvider())
  );

  const provider = new TaskChatsProvider(context, getWorkspaceFolder);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('taskChats.taskChatsView', provider)
  );
  registerTaskTreeCommands(context, provider);
  registerGitBranchWatcher(context, () => provider.refresh());

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.createTask', async () => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const branch = await getCurrentBranch(folder);
      const title = await vscode.window.showInputBox({
        prompt: t('messages.createTask.titlePrompt'),
        placeHolder: t('messages.createTask.titlePlaceholder'),
        validateInput: (value) => (value?.trim() ? null : t('messages.createTask.titleValidation')),
      });
      if (title === undefined || !title.trim()) {
        return;
      }
      const description = await vscode.window.showInputBox({
        prompt: t('messages.createTask.descPrompt'),
      });
      const descTrim = description?.trim() || undefined;

      const baseline = (await getHeadCommit(folder.uri.fsPath)) ?? undefined;
      const task = repo.createTask({
        workspaceFolder: folder.uri.fsPath,
        branchName: branch,
        title: title.trim(),
        description: descTrim,
        baselineCommitHash: baseline,
      });

      const previousComposerId = await getSelectedComposerId(context);
      const startedAt = Date.now();
      const promptText = await buildPromptTextForTask(context, folder, task);
      const didOpen = await openPromptInCursor(promptText);
      if (!didOpen) {
        void vscode.window.showWarningMessage(t('messages.createTask.openFailed'));
        return;
      }

      const composer = await waitForNewComposer(context, previousComposerId, startedAt);
      if (!composer) {
        void vscode.window.showWarningMessage(t('messages.createTask.attachFailed'));
        return;
      }

      repo.createTaskChatLink({
        taskId: task.id,
        composerId: composer.composerId,
        promptText,
        cachedName: composer.name,
      });
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.createSubtask', async (item?: TaskTreeItem) => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const branch = await getCurrentBranch(folder);
      let parent = item?.task;
      if (!parent) {
        parent = await pickTaskFromBranch(context, folder, branch, 'messages.createSubtask.pickParent');
      }
      if (!parent) {
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: t('messages.createSubtask.titlePrompt'),
        validateInput: (value) => (value?.trim() ? null : t('messages.createTask.titleValidation')),
      });
      if (title === undefined || !title.trim()) {
        return;
      }

      const baseline = (await getHeadCommit(folder.uri.fsPath)) ?? undefined;
      const sub = repo.createTask({
        workspaceFolder: folder.uri.fsPath,
        branchName: branch,
        parentTaskId: parent.id,
        title: title.trim(),
        baselineCommitHash: baseline,
      });

      const previousComposerId = await getSelectedComposerId(context);
      const startedAt = Date.now();
      const promptText = await buildPromptTextForTask(context, folder, sub);
      const didOpen = await openPromptInCursor(promptText);
      if (!didOpen) {
        void vscode.window.showWarningMessage(t('messages.openTaskChat.openFailed'));
        return;
      }

      const composer = await waitForNewComposer(context, previousComposerId, startedAt);
      if (!composer) {
        void vscode.window.showWarningMessage(t('messages.openTaskChat.attachFailed'));
        return;
      }

      repo.createTaskChatLink({
        taskId: sub.id,
        composerId: composer.composerId,
        promptText,
        cachedName: composer.name,
      });
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.openTaskChat', async (item?: TaskTreeItem) => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const branch = await getCurrentBranch(folder);
      let task = item?.task;
      if (!task) {
        task = await pickTaskFromBranch(context, folder, branch, 'messages.attachCurrent.pickTask');
      }
      if (!task) {
        return;
      }

      const previousComposerId = await getSelectedComposerId(context);
      const startedAt = Date.now();
      const promptText = await buildPromptTextForTask(context, folder, task);
      const didOpen = await openPromptInCursor(promptText);
      if (!didOpen) {
        void vscode.window.showWarningMessage(t('messages.openTaskChat.openFailed'));
        return;
      }

      const composer = await waitForNewComposer(context, previousComposerId, startedAt);
      if (!composer) {
        void vscode.window.showWarningMessage(t('messages.openTaskChat.attachFailed'));
        return;
      }

      repo.createTaskChatLink({
        taskId: task.id,
        composerId: composer.composerId,
        promptText,
        cachedName: composer.name,
      });
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.attachCurrentChatToTask', async () => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const branch = await getCurrentBranch(folder);
      const task = await pickTaskFromBranch(context, folder, branch, 'messages.attachCurrent.pickTask');
      if (!task) {
        return;
      }

      const [selectedComposerId, activeComposerId, openComposerIds, composerData] = await Promise.all([
        getSelectedComposerId(context),
        getActiveComposerId(context),
        getOpenComposerIds(context),
        getComposerData(context),
      ]);
      const allComposerById = new Map(
        (composerData?.allComposers ?? []).map((c) => [c.composerId, c])
      );
      const composerById = new Map(
        getRootComposers(composerData).map((c) => [c.composerId, c])
      );

      const candidateIds = Array.from(
        new Set(
          openComposerIds
            .map((id) => allComposerById.get(id)?.subagentInfo?.parentComposerId ?? id)
            .concat([selectedComposerId, activeComposerId].filter((id): id is string => Boolean(id)))
        )
      );

      let composer = await getSelectedRootComposer(context);
      if (openComposerIds.length > 1 || candidateIds.length > 1) {
        const pick = await vscode.window.showQuickPick(
          candidateIds.map((id) => {
            const c = composerById.get(id);
            const isOpen = openComposerIds.some(
              (openId) => (allComposerById.get(openId)?.subagentInfo?.parentComposerId ?? openId) === id
            );
            const source = [
              isOpen ? 'open' : null,
              id === selectedComposerId ? 'selected' : null,
              id === activeComposerId ? 'active' : null,
            ]
              .filter((part): part is string => Boolean(part))
              .join('+');
            return {
              label: c?.name ?? `#${id.slice(0, 8)}`,
              description: source,
              detail: c?.subtitle,
              composerId: id,
            };
          }),
          {
            placeHolder: t('messages.attachCurrent.pickPrompt'),
            matchOnDescription: true,
            matchOnDetail: true,
          }
        );

        if (!pick) {
          return;
        }

        composer =
          composerById.get(pick.composerId) ??
          { composerId: pick.composerId, name: pick.label, createdAt: Date.now() };
      }

      if (!composer) {
        void vscode.window.showWarningMessage(t('messages.attachCurrent.openChatFirst'));
        return;
      }

      const promptText = await buildPromptTextForTask(context, folder, task);
      repo.upsertTaskChatByComposer({
        taskId: task.id,
        composerId: composer.composerId,
        promptText,
        cachedName: composer.name,
      });

      provider.refresh();
      setTimeout(() => provider.refresh(), 2500);
      void vscode.window.showInformationMessage(
        t('messages.attachCurrent.success', {
          name: composer.name ?? t('chat.untitled'),
          task: task.title,
        })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.showTasksForCurrentBranch', async () => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const repo = await openTaskRepository(context, folder);
      const branch = await getCurrentBranch(folder);
      const tasks = repo.getTasksForBranch(branch);
      const composerData = await getComposerData(context);
      const composerById = new Map(
        getRootComposers(composerData).map((c) => [c.composerId, c])
      );

      type PickItem = vscode.QuickPickItem & { composerId?: string; task?: TaskEntity };
      const items: PickItem[] = [];
      for (const task of tasks) {
        for (const chat of repo.getChatsForTask(task.id)) {
          const composer = composerById.get(chat.composerId);
          const name =
            chat.customName ?? composer?.name ?? chat.cachedName ?? `#${chat.composerId.slice(0, 8)}`;
          items.push({
            label: name,
            description: task.title,
            detail: composer?.subtitle,
            composerId: chat.composerId,
            task,
          });
        }
      }

      if (items.length === 0) {
        void vscode.window.showInformationMessage(t('messages.showTasks.empty', { branch }));
        return;
      }

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: t('messages.showTasks.placeholder', { branch }),
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (picked?.composerId) {
        const opened = await openComposerWithCursorCommand(context, picked.composerId);
        if (!opened) {
          void vscode.window.showWarningMessage(
            t('messages.openExisting.failed', { name: picked.label })
          );
        }
      }
    })
  );
}

export function deactivate(): void {
  flushAllTaskRepositories();
}
