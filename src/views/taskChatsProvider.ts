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
import { openYouGileTaskDetailPanel } from './yougileTaskDetailPanel';
import { openYouGileTimeReportPanel } from './yougileTimeReportPanel';
import { t, taskStatusShortLabel } from '../i18n';
import {
  getTaskSource,
  getYouGileBoards,
  getYouGileColumnGroupId,
  getYouGileColumns,
  getYouGileExtensionConfig,
  getYouGileIntegrationOptions,
  getYouGileProjects,
  getYouGileTaskById,
  getYouGileTaskSourceData,
  getYouGileTimeStatsBatch,
  getYouGileAuthCompanies,
  resolveYouGileApiKey,
  saveYouGileAuthSetup,
  getYouGileStringStickers,
  getYouGileUsers,
  getYouGileUsersByApiKey,
  setYouGileBoardFilter,
  setYouGileAssigneeFilter,
  setYouGileProjectFilter,
  type YouGileBoard,
  type YouGileColumn,
  type YouGileLiveTimer,
  type YouGileTaskTimeStats,
  type YouGileTimeStatsDebug,
  type YouGileTask,
  type YouGileStringSticker,
  type YouGileUser,
} from '../integrations/yougileClient';

export type TaskTreeNode =
  | BranchRootTreeItem
  | TaskTreeItem
  | TaskChatTreeItem
  | YouGileRootTreeItem
  | YouGileBoardTreeItem
  | YouGileColumnTreeItem
  | YouGileTaskTreeItem;

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

export class YouGileRootTreeItem extends vscode.TreeItem {
  readonly nodeKind = 'yougile-root' as const;
  constructor(filterLabel?: string) {
    super(t('yougile.rootLabel'), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'yougileRoot';
    this.iconPath = new vscode.ThemeIcon('cloud');
    this.description = filterLabel
      ? t('yougile.rootDescription.filtered', { filters: filterLabel })
      : t('yougile.rootDescription');
  }
}

export class YouGileColumnTreeItem extends vscode.TreeItem {
  readonly nodeKind = 'yougile-column' as const;
  constructor(public readonly column: YouGileColumn, taskCount: number) {
    super(column.title, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'yougileColumn';
    this.iconPath = new vscode.ThemeIcon('list-unordered');
    this.description = t('yougile.column.taskCount', { count: String(taskCount) });
  }
}

export class YouGileBoardTreeItem extends vscode.TreeItem {
  readonly nodeKind = 'yougile-board' as const;
  constructor(public readonly board: YouGileBoard, columnCount: number) {
    super(board.title, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'yougileBoard';
    this.iconPath = new vscode.ThemeIcon('project');
    this.description = t('yougile.board.columnCount', { count: String(columnCount) });
  }
}

function getYouGileStatusLabel(task: YouGileTask): string {
  if (task.archived) {
    return t('yougile.taskDescription.archived');
  }
  if (task.completed) {
    return t('yougile.taskDescription.done');
  }
  return t('yougile.taskDescription.open');
}

export class YouGileTaskTreeItem extends vscode.TreeItem {
  readonly nodeKind = 'yougile-task' as const;
  constructor(
    public readonly task: YouGileTask,
    childCount: number,
    totalSpentSeconds?: number
  ) {
    super(
      task.title,
      childCount > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'yougileTask';
    const timePart = typeof totalSpentSeconds === 'number' ? ` · ${formatSpentTime(totalSpentSeconds)}` : '';
    this.description = `${getYouGileStatusLabel(task)}${timePart}`;
    this.iconPath = new vscode.ThemeIcon(task.completed ? 'pass' : 'checklist');
    this.command = {
      command: 'cursorTaskChats.openYouGileTaskDetails',
      title: t('commands.openYougileTaskDetails.title'),
      arguments: [this],
    };
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${task.title}**\n\n`);
    tooltip.appendText(t('yougile.taskTooltip.taskId', { id: task.id }));
    if (task.description?.trim()) {
      tooltip.appendText(`\n\n${task.description.trim().slice(0, 500)}${task.description.length > 500 ? '…' : ''}`);
    }
    this.tooltip = tooltip;
  }
}

function formatSpentTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0m';
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function readCompanyIdFromTask(task: YouGileTask): string | undefined {
  const raw = task.raw as Record<string, unknown>;
  const direct =
    (typeof raw.companyId === 'string' && raw.companyId.trim()) ||
    (typeof raw.idCompany === 'string' && raw.idCompany.trim());
  if (direct) {
    return direct;
  }
  const company = raw.company;
  if (company && typeof company === 'object' && !Array.isArray(company)) {
    const id = (company as Record<string, unknown>).id;
    if (typeof id === 'string' && id.trim()) {
      return id;
    }
  }
  return undefined;
}

function parseIsoDateInput(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function readPlanHoursFromTask(task: YouGileTask): number | undefined {
  const tracking = (task.raw as Record<string, unknown>).timeTracking;
  if (!tracking || typeof tracking !== 'object' || Array.isArray(tracking)) {
    return undefined;
  }
  const plan = (tracking as Record<string, unknown>).plan;
  if (typeof plan === 'number' && Number.isFinite(plan)) {
    return plan;
  }
  return undefined;
}

type YouGileTreeData = {
  boards: YouGileBoard[];
  columnsByBoardId: Map<string, YouGileColumn[]>;
  taskCountByColumnId: Map<string, number>;
  rootTaskIdsByColumnId: Map<string, string[]>;
  taskById: Map<string, YouGileTask>;
  childrenByParentId: Map<string, YouGileTask[]>;
  boardIdByTaskId: Map<string, string>;
  timeStatsByTaskId: Map<string, YouGileTaskTimeStats>;
  liveTimerByTaskId: Map<string, YouGileLiveTimer>;
};

export class TaskChatsProvider implements vscode.TreeDataProvider<TaskTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private yougileTreeData?: YouGileTreeData;
  private yougileErrorShown = false;
  private readonly yougileAssigneeLabelCache = new Map<string, string>();
  private readonly yougileProjectLabelCache = new Map<string, string>();
  private readonly yougileBoardLabelCache = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getWorkspaceFolder: () => vscode.WorkspaceFolder | undefined
  ) {}

  getCurrentWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return this.getWorkspaceFolder();
  }

  refresh(): void {
    this.yougileTreeData = undefined;
    this.yougileErrorShown = false;
    this.yougileAssigneeLabelCache.clear();
    this.yougileProjectLabelCache.clear();
    this.yougileBoardLabelCache.clear();
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

    if (getTaskSource() === 'yougile') {
      return this.getYouGileChildren(element);
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

  private async getYouGileChildren(element?: TaskTreeNode): Promise<TaskTreeNode[]> {
    const data = await this.getYouGileTreeData();
    if (!element) {
      const options = getYouGileIntegrationOptions();
      const filterLabel = await this.resolveYouGileFilterLabel(
        options.assigneeId,
        options.projectId,
        options.boardId
      );
      return [new YouGileRootTreeItem(filterLabel)];
    }

    if (element instanceof YouGileRootTreeItem) {
      return data.boards.map((board) => {
        const columns = data.columnsByBoardId.get(board.id) ?? [];
        return new YouGileBoardTreeItem(board, columns.length);
      });
    }

    if (element instanceof YouGileBoardTreeItem) {
      const columns = data.columnsByBoardId.get(element.board.id) ?? [];
      return columns.map((column) => new YouGileColumnTreeItem(column, data.taskCountByColumnId.get(column.id) ?? 0));
    }

    if (element instanceof YouGileColumnTreeItem) {
      const rootIds = data.rootTaskIdsByColumnId.get(element.column.id) ?? [];
      return rootIds
        .map((taskId) => data.taskById.get(taskId))
        .filter((task): task is YouGileTask => Boolean(task))
        .map((task) => {
          const childCount = data.childrenByParentId.get(task.id)?.length ?? 0;
          const total = data.timeStatsByTaskId.get(task.id)?.totalSpentTime;
          return new YouGileTaskTreeItem(task, childCount, total);
        });
    }

    if (element instanceof YouGileTaskTreeItem) {
      const children = data.childrenByParentId.get(element.task.id) ?? [];
      return children.map((task) => {
        const childCount = data.childrenByParentId.get(task.id)?.length ?? 0;
        const total = data.timeStatsByTaskId.get(task.id)?.totalSpentTime;
        return new YouGileTaskTreeItem(task, childCount, total);
      });
    }

    return [];
  }

  private async resolveYouGileAssigneeLabel(assigneeId?: string): Promise<string | undefined> {
    if (!assigneeId) {
      return undefined;
    }
    const cached = this.yougileAssigneeLabelCache.get(assigneeId);
    if (cached) {
      return cached;
    }
    try {
      const users = await getYouGileUsers();
      const matched = users.find((user) => user.id === assigneeId);
      const label = matched?.realName ?? matched?.name ?? matched?.email ?? assigneeId;
      this.yougileAssigneeLabelCache.set(assigneeId, label);
      return label;
    } catch {
      return assigneeId;
    }
  }

  private async resolveYouGileProjectLabel(projectId?: string): Promise<string | undefined> {
    if (!projectId) {
      return undefined;
    }
    const cached = this.yougileProjectLabelCache.get(projectId);
    if (cached) {
      return cached;
    }
    try {
      const projects = await getYouGileProjects();
      const matched = projects.find((project) => project.id === projectId);
      const label = matched?.title ?? projectId;
      this.yougileProjectLabelCache.set(projectId, label);
      return label;
    } catch {
      return projectId;
    }
  }

  private async resolveYouGileBoardLabel(boardId?: string): Promise<string | undefined> {
    if (!boardId) {
      return undefined;
    }
    const cached = this.yougileBoardLabelCache.get(boardId);
    if (cached) {
      return cached;
    }
    try {
      const boards = await getYouGileBoards();
      const matched = boards.find((board) => board.id === boardId);
      const label = matched?.title ?? boardId;
      this.yougileBoardLabelCache.set(boardId, label);
      return label;
    } catch {
      return boardId;
    }
  }

  private async resolveYouGileFilterLabel(
    assigneeId?: string,
    projectId?: string,
    boardId?: string
  ): Promise<string | undefined> {
    const [assigneeLabel, projectLabel, boardLabel] = await Promise.all([
      this.resolveYouGileAssigneeLabel(assigneeId),
      this.resolveYouGileProjectLabel(projectId),
      this.resolveYouGileBoardLabel(boardId),
    ]);
    const parts: string[] = [];
    if (assigneeLabel) {
      parts.push(t('yougile.filter.summary.assignee', { value: assigneeLabel }));
    }
    if (projectLabel) {
      parts.push(t('yougile.filter.summary.project', { value: projectLabel }));
    }
    if (boardLabel) {
      parts.push(t('yougile.filter.summary.board', { value: boardLabel }));
    }
    return parts.length > 0 ? parts.join('; ') : undefined;
  }

  private async getYouGileTreeData(): Promise<YouGileTreeData> {
    if (this.yougileTreeData) {
      return this.yougileTreeData;
    }

    try {
      const source = await getYouGileTaskSourceData();
      const options = getYouGileIntegrationOptions();
      const tasks = source.tasks;
      const boards = source.boards;
      const columnsByBoardId = new Map<string, YouGileColumn[]>();
      const boardIdByColumnId = new Map<string, string>();
      const byId = new Map(tasks.map((task) => [task.id, task]));
      const childrenByParentId = new Map<string, YouGileTask[]>();
      const rootTaskIdsByColumnId = new Map<string, string[]>();
      const taskCountByColumnId = new Map<string, number>();
      const boardIdByTaskId = new Map<string, string>();
      const timeStatsByTaskId = new Map<string, YouGileTaskTimeStats>();
      const liveTimerByTaskId = new Map<string, YouGileLiveTimer>();

      for (const column of source.columns) {
        if (!column.boardId) {
          continue;
        }
        boardIdByColumnId.set(column.id, column.boardId);
        const bucket = columnsByBoardId.get(column.boardId) ?? [];
        bucket.push(column);
        columnsByBoardId.set(column.boardId, bucket);
      }

      for (const task of tasks) {
        const boardId = task.columnId ? boardIdByColumnId.get(task.columnId) : undefined;
        if (boardId) {
          boardIdByTaskId.set(task.id, boardId);
        }
      }

      for (const task of tasks) {
        const columnGroupId = getYouGileColumnGroupId(task);
        taskCountByColumnId.set(columnGroupId, (taskCountByColumnId.get(columnGroupId) ?? 0) + 1);

        const parentId = task.parentTaskId;
        const parentTask = parentId ? byId.get(parentId) : undefined;
        const parentGroupId = parentTask ? getYouGileColumnGroupId(parentTask) : undefined;
        if (!parentId || !parentTask || parentGroupId !== columnGroupId) {
          const bucket = rootTaskIdsByColumnId.get(columnGroupId) ?? [];
          bucket.push(task.id);
          rootTaskIdsByColumnId.set(columnGroupId, bucket);
          continue;
        }
        const bucket = childrenByParentId.get(parentId) ?? [];
        bucket.push(task);
        childrenByParentId.set(parentId, bucket);
      }

      for (const [columnId, rootIds] of rootTaskIdsByColumnId.entries()) {
        rootIds.sort((a, b) => {
          const taskA = byId.get(a);
          const taskB = byId.get(b);
          if (!taskA || !taskB) {
            return 0;
          }
          return taskA.orderIndex - taskB.orderIndex;
        });
        rootTaskIdsByColumnId.set(columnId, rootIds);
      }

      for (const entries of childrenByParentId.values()) {
        entries.sort((a, b) => a.orderIndex - b.orderIndex);
      }

      for (const [boardId, columns] of columnsByBoardId.entries()) {
        const filtered = columns.filter(
          (column) => options.showEmptyColumns || (taskCountByColumnId.get(column.id) ?? 0) > 0
        );
        columnsByBoardId.set(boardId, filtered);
      }

      const visibleBoards = boards.filter((board) => {
        const columns = columnsByBoardId.get(board.id) ?? [];
        return options.showEmptyColumns || columns.length > 0;
      });

      const taskIdsByBoardId = new Map<string, string[]>();
      const companyIdByBoardId = new Map<string, string>();
      for (const [taskId, boardId] of boardIdByTaskId.entries()) {
        const bucket = taskIdsByBoardId.get(boardId) ?? [];
        bucket.push(taskId);
        taskIdsByBoardId.set(boardId, bucket);
        if (!companyIdByBoardId.has(boardId)) {
          const task = byId.get(taskId);
          if (task) {
            const companyId = readCompanyIdFromTask(task);
            if (companyId) {
              companyIdByBoardId.set(boardId, companyId);
            }
          }
        }
      }
      for (const [boardId, taskIds] of taskIdsByBoardId.entries()) {
        try {
          const timeData = await getYouGileTimeStatsBatch(boardId, taskIds, {
            userId: options.assigneeId,
            companyId: companyIdByBoardId.get(boardId),
          });
          for (const [taskId, stats] of Object.entries(timeData.taskStats)) {
            timeStatsByTaskId.set(taskId, stats);
          }
          for (const timer of timeData.liveTimers) {
            liveTimerByTaskId.set(timer.taskId, timer);
          }
        } catch {
          // Do not block tree rendering if extension endpoint is unavailable.
        }
      }

      this.yougileTreeData = {
        boards: visibleBoards,
        columnsByBoardId,
        taskCountByColumnId,
        rootTaskIdsByColumnId,
        taskById: byId,
        childrenByParentId,
        boardIdByTaskId,
        timeStatsByTaskId,
        liveTimerByTaskId,
      };
      return this.yougileTreeData;
    } catch (error) {
      if (!this.yougileErrorShown) {
        this.yougileErrorShown = true;
        void vscode.window.showWarningMessage(
          error instanceof Error ? error.message : String(error)
        );
      }
      return {
        boards: [],
        columnsByBoardId: new Map<string, YouGileColumn[]>(),
        taskCountByColumnId: new Map<string, number>(),
        rootTaskIdsByColumnId: new Map<string, string[]>(),
        taskById: new Map<string, YouGileTask>(),
        childrenByParentId: new Map<string, YouGileTask[]>(),
        boardIdByTaskId: new Map<string, string>(),
        timeStatsByTaskId: new Map<string, YouGileTaskTimeStats>(),
        liveTimerByTaskId: new Map<string, YouGileLiveTimer>(),
      };
    }
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
    vscode.commands.registerCommand('cursorTaskChats.refreshYouGile', () => {
      provider.refresh();
      void vscode.window.showInformationMessage(t('messages.refreshYougile.success'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.setupYouGileAuth', async () => {
      try {
        const login = await vscode.window.showInputBox({
          prompt: t('messages.yougile.setup.loginPrompt'),
          ignoreFocusOut: true,
          validateInput: (value) => (value?.trim() ? null : t('messages.yougile.setup.loginValidation')),
        });
        if (!login?.trim()) {
          return;
        }
        const password = await vscode.window.showInputBox({
          prompt: t('messages.yougile.setup.passwordPrompt'),
          password: true,
          ignoreFocusOut: true,
          validateInput: (value) => (value?.trim() ? null : t('messages.yougile.setup.passwordValidation')),
        });
        if (!password?.trim()) {
          return;
        }

        const companies = await getYouGileAuthCompanies(login.trim(), password.trim());
        if (companies.length === 0) {
          void vscode.window.showWarningMessage(t('messages.yougile.setup.noCompanies'));
          return;
        }
        const picked = await vscode.window.showQuickPick(
          companies.map((company) => ({
            label: company.name,
            description: company.id,
            detail: company.isAdmin ? t('messages.yougile.setup.companyAdmin') : undefined,
            company,
          })),
          {
            placeHolder: t('messages.yougile.setup.pickCompany'),
            matchOnDescription: true,
            matchOnDetail: true,
          }
        );
        if (!picked?.company) {
          return;
        }

        const keyData = await resolveYouGileApiKey(login.trim(), password.trim(), picked.company.id);
        const userKey = await vscode.window.showInputBox({
          prompt: t('messages.yougile.setup.userKeyPrompt'),
          ignoreFocusOut: true,
          validateInput: (value) => (value?.trim() ? null : t('messages.yougile.setup.userKeyValidation')),
        });
        if (!userKey?.trim()) {
          return;
        }
        let selectedUserId = keyData.userId;
        if (!selectedUserId) {
          const apiUsers = await getYouGileUsersByApiKey(keyData.key);
          if (apiUsers.length > 0) {
            const userPick = await vscode.window.showQuickPick(
              apiUsers.map((user) => ({
                label: user.realName ?? user.name ?? user.email ?? user.id,
                description: user.email ?? user.status,
                userId: user.id,
              })),
              {
                placeHolder: t('messages.yougile.setup.pickUser'),
                matchOnDescription: true,
              }
            );
            selectedUserId = userPick?.userId;
          }
        }
        if (!selectedUserId) {
          selectedUserId = await vscode.window.showInputBox({
            prompt: t('messages.yougile.setup.userIdPrompt'),
            ignoreFocusOut: true,
            validateInput: (value) => (value?.trim() ? null : t('messages.yougile.setup.userIdValidation')),
          });
        }
        if (!selectedUserId?.trim()) {
          return;
        }
        await saveYouGileAuthSetup({
          apiKey: keyData.key,
          userKey: userKey.trim(),
          companyId: picked.company.id,
          userId: selectedUserId.trim(),
        });
        provider.refresh();
        void vscode.window.showInformationMessage(
          t('messages.yougile.setup.success', { company: picked.company.name })
        );
      } catch (error) {
        void vscode.window.showErrorMessage(
          t('messages.yougile.setup.failed', {
            message: error instanceof Error ? error.message : String(error),
          })
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.openYouGileTimeReport', async () => {
      if (getTaskSource() !== 'yougile') {
        void vscode.window.showInformationMessage(t('messages.yougile.filter.onlyInYougile'));
        return;
      }

      type ModePick = vscode.QuickPickItem & { mode: 'week' | 'custom' };
      const mode = await vscode.window.showQuickPick<ModePick>(
        [
          { label: t('messages.yougile.report.modeWeek'), mode: 'week' },
          { label: t('messages.yougile.report.modeCustom'), mode: 'custom' },
        ],
        { placeHolder: t('messages.yougile.report.pickMode') }
      );
      if (!mode) {
        return;
      }

      let startDate: Date;
      let endDate: Date;
      if (mode.mode === 'week') {
        const anchorInput = await vscode.window.showInputBox({
          prompt: t('messages.yougile.report.weekDatePrompt'),
          placeHolder: 'YYYY-MM-DD',
          ignoreFocusOut: true,
        });
        if (anchorInput === undefined) {
          return;
        }
        const anchor = anchorInput.trim() ? parseIsoDateInput(anchorInput) : new Date();
        if (!anchor) {
          void vscode.window.showErrorMessage(t('messages.yougile.report.invalidDate'));
          return;
        }
        startDate = startOfWeekMonday(anchor);
        endDate = addDays(startDate, 6);
      } else {
        const startInput = await vscode.window.showInputBox({
          prompt: t('messages.yougile.report.startDatePrompt'),
          placeHolder: 'YYYY-MM-DD',
          ignoreFocusOut: true,
        });
        if (!startInput) {
          return;
        }
        const endInput = await vscode.window.showInputBox({
          prompt: t('messages.yougile.report.endDatePrompt'),
          placeHolder: 'YYYY-MM-DD',
          ignoreFocusOut: true,
        });
        if (!endInput) {
          return;
        }
        const parsedStart = parseIsoDateInput(startInput);
        const parsedEnd = parseIsoDateInput(endInput);
        if (!parsedStart || !parsedEnd) {
          void vscode.window.showErrorMessage(t('messages.yougile.report.invalidDate'));
          return;
        }
        if (parsedEnd.getTime() < parsedStart.getTime()) {
          void vscode.window.showErrorMessage(t('messages.yougile.report.invalidRange'));
          return;
        }
        startDate = parsedStart;
        endDate = parsedEnd;
      }

      const dateList: Date[] = [];
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      while (cursor.getTime() <= endDate.getTime()) {
        dateList.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
        cursor.setDate(cursor.getDate() + 1);
      }
      const dateKeys = dateList.map((d) => toDateKey(d));
      const dateLabels = dateList.map((d) => formatDateLabel(d));

      const extensionConfig = getYouGileExtensionConfig();
      const options = getYouGileIntegrationOptions();
      const defaultReportUserId = extensionConfig.userId ?? options.assigneeId;
      const users = await getYouGileUsers();
      type UserPick = vscode.QuickPickItem & { userId: string };
      const picks: UserPick[] = users.map((user) => ({
        label: user.realName ?? user.name ?? user.email ?? user.id,
        description: user.email ?? user.status,
        detail: user.id === defaultReportUserId ? t('messages.yougile.report.defaultUser') : undefined,
        userId: user.id,
      }));
      if (defaultReportUserId && !picks.some((entry) => entry.userId === defaultReportUserId)) {
        picks.unshift({
          label: defaultReportUserId,
          description: t('messages.yougile.report.userFromSettings'),
          detail: t('messages.yougile.report.defaultUser'),
          userId: defaultReportUserId,
        });
      }
      const pickedUser = await vscode.window.showQuickPick<UserPick>(picks, {
        placeHolder: t('messages.yougile.report.pickUser'),
        matchOnDescription: true,
        matchOnDetail: true,
      });
      const reportUserId = pickedUser?.userId ?? defaultReportUserId;
      if (!reportUserId) {
        void vscode.window.showErrorMessage(t('messages.yougile.report.userMissing'));
        return;
      }

      const source = await getYouGileTaskSourceData(false);
      const columnBoardById = new Map(
        source.columns
          .filter((column) => column.boardId)
          .map((column) => [column.id, column.boardId as string])
      );
      const boardTaskIds = new Map<string, string[]>();
      const taskById = new Map(source.tasks.map((task) => [task.id, task]));
      for (const task of source.tasks) {
        const boardId = task.columnId ? columnBoardById.get(task.columnId) : undefined;
        if (!boardId) {
          continue;
        }
        const bucket = boardTaskIds.get(boardId) ?? [];
        bucket.push(task.id);
        boardTaskIds.set(boardId, bucket);
      }

      const perTaskPerDay = new Map<string, Map<string, number>>();
      const overallFactByTask = new Map<string, number>();
      for (const [boardId, taskIds] of boardTaskIds.entries()) {
        const hintsTask = taskById.get(taskIds[0]);
        const result = await getYouGileTimeStatsBatch(boardId, taskIds, {
          userId: reportUserId,
          companyId: hintsTask ? readCompanyIdFromTask(hintsTask) : undefined,
        });
        for (const [taskId, stats] of Object.entries(result.taskStats)) {
          const byDay = perTaskPerDay.get(taskId) ?? new Map<string, number>();
          const userStats = stats.users[reportUserId];
          if (!userStats) {
            perTaskPerDay.set(taskId, byDay);
            continue;
          }
          overallFactByTask.set(taskId, userStats.totalSpentTime);
          for (const record of userStats.records) {
            if (!record.date) {
              continue;
            }
            const dayKey = record.date.slice(0, 10);
            byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + record.duration);
          }
          perTaskPerDay.set(taskId, byDay);
        }
      }

      const rows = source.tasks
        .map((task) => {
          const byDay = perTaskPerDay.get(task.id) ?? new Map<string, number>();
          const secondsByDay = dateKeys.map((key) => byDay.get(key) ?? 0);
          const periodFactSeconds = secondsByDay.reduce((sum, value) => sum + value, 0);
          const overallFactSeconds = overallFactByTask.get(task.id) ?? 0;
          const estimateHours = readPlanHoursFromTask(task);
          return {
            taskTitle: task.title,
            secondsByDay,
            periodFactSeconds,
            periodEstimateHours: estimateHours,
            overallFactSeconds,
            overallEstimateHours: estimateHours,
          };
        })
        .filter((row) => row.periodFactSeconds > 0)
        .sort((a, b) => b.periodFactSeconds - a.periodFactSeconds);

      await openYouGileTimeReportPanel({
        periodLabel: `${toDateKey(startDate)} — ${toDateKey(endDate)}`,
        dateLabels,
        rows,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.selectYouGileAssigneeFilter', async () => {
      if (getTaskSource() !== 'yougile') {
        void vscode.window.showInformationMessage(t('messages.yougile.filter.onlyInYougile'));
        return;
      }

      const users = await getYouGileUsers();
      if (users.length === 0) {
        void vscode.window.showInformationMessage(t('messages.yougile.filter.noUsers'));
        return;
      }

      const sortedUsers = users.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );

      type UserPickItem = vscode.QuickPickItem & {
        pickType: 'clear' | 'user';
        user?: YouGileUser;
      };

      const picks: UserPickItem[] = [
        {
          pickType: 'clear',
          label: t('yougile.filter.clearOption'),
          description: getYouGileIntegrationOptions().assigneeId ?? undefined,
        },
        ...sortedUsers.map((user) => ({
          pickType: 'user' as const,
          label: user.realName ?? user.name ?? user.email ?? user.id,
          description: user.status,
          user,
        })),
      ];

      const picked = await vscode.window.showQuickPick<UserPickItem>(picks, {
        placeHolder: t('messages.yougile.filter.pickPlaceholder'),
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!picked) {
        return;
      }

      if (picked.pickType === 'clear') {
        await setYouGileAssigneeFilter(undefined);
        provider.refresh();
        void vscode.window.showInformationMessage(t('messages.yougile.filter.cleared'));
        return;
      }

      if (!picked.user) {
        return;
      }

      await setYouGileAssigneeFilter(picked.user.id);
      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.yougile.filter.applied', {
          assignee: picked.user.realName ?? picked.user.name ?? picked.user.email ?? picked.user.id,
        })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.selectYouGileProjectFilter', async () => {
      if (getTaskSource() !== 'yougile') {
        void vscode.window.showInformationMessage(t('messages.yougile.filter.onlyInYougile'));
        return;
      }
      const [projects, allBoards] = await Promise.all([getYouGileProjects(), getYouGileBoards()]);
      type ProjectPick = vscode.QuickPickItem & { projectId?: string };
      const currentProjectId = getYouGileIntegrationOptions().projectId;
      const picks: ProjectPick[] = [
        {
          label: t('yougile.filter.clearProjectOption'),
          description: currentProjectId ?? undefined,
          projectId: undefined,
        },
        ...projects.map((project) => ({ label: project.title, projectId: project.id })),
      ];

      const picked = await vscode.window.showQuickPick<ProjectPick>(picks, {
        placeHolder: t('messages.yougile.filter.pickProjectPlaceholder'),
      });
      if (!picked) {
        return;
      }
      await setYouGileProjectFilter(picked.projectId);
      const currentBoardId = getYouGileIntegrationOptions().boardId;
      if (!picked.projectId) {
        await setYouGileBoardFilter(undefined);
      } else if (currentBoardId) {
        const currentBoard = allBoards.find((board) => board.id === currentBoardId);
        if (!currentBoard || currentBoard.projectId !== picked.projectId) {
          await setYouGileBoardFilter(undefined);
        }
      }
      provider.refresh();
      void vscode.window.showInformationMessage(
        picked.projectId
          ? t('messages.yougile.filter.projectApplied', { project: picked.label })
          : t('messages.yougile.filter.projectCleared')
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.selectYouGileBoardFilter', async () => {
      if (getTaskSource() !== 'yougile') {
        void vscode.window.showInformationMessage(t('messages.yougile.filter.onlyInYougile'));
        return;
      }

      const options = getYouGileIntegrationOptions();
      const boards = (await getYouGileBoards()).filter(
        (board) => !options.projectId || board.projectId === options.projectId
      );
      type BoardPick = vscode.QuickPickItem & { boardId?: string };
      const picks: BoardPick[] = [
        {
          label: t('yougile.filter.clearBoardOption'),
          description: options.boardId ?? undefined,
          boardId: undefined,
        },
        ...boards.map((board) => ({ label: board.title, boardId: board.id })),
      ];
      const picked = await vscode.window.showQuickPick<BoardPick>(picks, {
        placeHolder: t('messages.yougile.filter.pickBoardPlaceholder'),
      });
      if (!picked) {
        return;
      }
      await setYouGileBoardFilter(picked.boardId);
      provider.refresh();
      void vscode.window.showInformationMessage(
        picked.boardId
          ? t('messages.yougile.filter.boardApplied', { board: picked.label })
          : t('messages.yougile.filter.boardCleared')
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTaskChats.openYouGileTaskDetails', async (item?: YouGileTaskTreeItem) => {
      if (!item) {
        return;
      }
      let task = item.task;
      let users: YouGileUser[] = [];
      let columns: YouGileColumn[] = [];
      let stickers: YouGileStringSticker[] = [];
      let taskTimeStats: YouGileTaskTimeStats | undefined;
      let liveTimer: YouGileLiveTimer | undefined;
      let timeDebug: YouGileTimeStatsDebug | undefined;
      try {
        const [freshTask, allUsers, allColumns, allStickers] = await Promise.all([
          getYouGileTaskById(item.task.id),
          getYouGileUsers(),
          getYouGileColumns(),
          getYouGileStringStickers(),
        ]);
        if (freshTask) {
          task = freshTask;
        }
        users = allUsers;
        columns = allColumns;
        stickers = allStickers;
        const boardIdByColumnId = new Map(allColumns.map((column) => [column.id, column.boardId]));
        const boardId = task.columnId ? boardIdByColumnId.get(task.columnId) : undefined;
        if (boardId) {
          const timeData = await getYouGileTimeStatsBatch(boardId, [task.id], {
            userId: getYouGileIntegrationOptions().assigneeId,
            companyId: readCompanyIdFromTask(task),
          });
          taskTimeStats = timeData.taskStats[task.id];
          liveTimer = timeData.liveTimers.find((timer) => timer.taskId === task.id);
          timeDebug = timeData.debug;
        } else {
          timeDebug = {
            skipped: true,
            reason: 'Task has no boardId',
            requestUrl: 'https://yougile.com/data/extension/exec',
          };
        }
      } catch (error) {
        // Detail panel can still be rendered with partial tree data.
        timeDebug = {
          skipped: true,
          reason: 'Failed to load task details data',
          requestUrl: 'https://yougile.com/data/extension/exec',
          error: error instanceof Error ? error.message : String(error),
        };
      }
      await openYouGileTaskDetailPanel(task, users, columns, stickers, taskTimeStats, liveTimer, timeDebug);
    })
  );

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
