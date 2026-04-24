import * as https from 'https';
import * as vscode from 'vscode';
import { t } from '../i18n';

const DEFAULT_API_BASE_URL = 'https://ru.yougile.com/api-v2';
const NO_COLUMN_GROUP_ID = '__yougile_no_column__';

export interface YouGileTask {
  id: string;
  title: string;
  description?: string;
  parentTaskId?: string;
  subtaskIds: string[];
  columnId?: string;
  assigneeIds: string[];
  orderIndex: number;
  completed?: boolean;
  archived?: boolean;
  raw: Record<string, unknown>;
}

export interface YouGileColumn {
  id: string;
  title: string;
  boardId?: string;
  raw: Record<string, unknown>;
}

export interface YouGileUser {
  id: string;
  name: string;
  realName?: string;
  email?: string;
  status?: string;
  raw: Record<string, unknown>;
}

export interface YouGileBoard {
  id: string;
  title: string;
  projectId?: string;
  raw: Record<string, unknown>;
}

export interface YouGileProject {
  id: string;
  title: string;
  raw: Record<string, unknown>;
}

export type YouGileTaskSourceData = {
  tasks: YouGileTask[];
  columns: YouGileColumn[];
  boards: YouGileBoard[];
  projects: YouGileProject[];
};

export type YouGileIntegrationOptions = {
  assigneeId?: string;
  projectId?: string;
  boardId?: string;
  showEmptyColumns: boolean;
};

type YouGileListEnvelope = {
  content?: unknown;
  items?: unknown;
  data?: unknown;
  tasks?: unknown;
  columns?: unknown;
  users?: unknown;
  boards?: unknown;
  projects?: unknown;
};

type YouGileTaskListResponse = {
  content?: unknown;
  paging?: {
    next?: boolean;
    limit?: number;
    offset?: number;
    count?: number;
  };
};

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry));
  }
  return [];
}

function asStringKeys(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  return Object.keys(record).map((entry) => entry.trim()).filter((entry) => Boolean(entry));
}

function parseAssigneeIds(raw: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const directCandidates = [
    raw.assigneeId,
    raw.assignedToId,
    raw.responsibleId,
    raw.executorId,
    raw.userId,
  ];
  for (const candidate of directCandidates) {
    const parsed = asString(candidate);
    if (parsed) {
      ids.add(parsed);
    }
  }

  const listCandidates = [
    raw.assigned,
    raw.assignedTo,
    raw.assignees,
    raw.executors,
    raw.users,
    raw.responsibles,
    raw.watchers,
  ];
  for (const candidate of listCandidates) {
    for (const parsed of asStringArray(candidate)) {
      ids.add(parsed);
    }
  }

  const mapCandidates = [raw.assignedUsers, raw.assignedToMap, raw.usersMap];
  for (const candidate of mapCandidates) {
    for (const parsed of asStringKeys(candidate)) {
      ids.add(parsed);
    }
  }

  return Array.from(ids);
}

function parseTask(rawTask: unknown, orderIndex = Number.MAX_SAFE_INTEGER): YouGileTask | null {
  const raw = asRecord(rawTask);
  if (!raw) {
    return null;
  }

  const id = asString(raw.id) ?? asString(raw.taskId) ?? asString(raw.key);
  if (!id) {
    return null;
  }

  const parentByObject = asRecord(raw.parentTask)?.id ?? asRecord(raw.parent)?.id;
  const parentTaskId =
    asString(raw.parentTaskId) ?? asString(raw.parentId) ?? asString(parentByObject);
  const subtaskIds = asStringArray(raw.subtasks);

  const columnByObject = asRecord(raw.column)?.id;
  const columnId = asString(raw.columnId) ?? asString(columnByObject);

  const title =
    asString(raw.title) ??
    asString(raw.name) ??
    asString(raw.summary) ??
    asString(raw.taskNumber) ??
    id;

  return {
    id,
    title,
    description: asString(raw.description),
    parentTaskId,
    subtaskIds,
    columnId,
    assigneeIds: parseAssigneeIds(raw),
    orderIndex,
    completed: toBoolean(raw.completed),
    archived: toBoolean(raw.archived),
    raw,
  };
}

function parseColumn(rawColumn: unknown): YouGileColumn | null {
  const raw = asRecord(rawColumn);
  if (!raw) {
    return null;
  }

  const id = asString(raw.id) ?? asString(raw.columnId);
  if (!id) {
    return null;
  }

  const title = asString(raw.title) ?? asString(raw.name) ?? id;
  const boardByObject = asRecord(raw.board)?.id;
  const boardId = asString(raw.boardId) ?? asString(boardByObject);
  return { id, title, boardId, raw };
}

function parseBoard(rawBoard: unknown): YouGileBoard | null {
  const raw = asRecord(rawBoard);
  if (!raw) {
    return null;
  }

  const id = asString(raw.id) ?? asString(raw.boardId);
  if (!id) {
    return null;
  }
  const title = asString(raw.title) ?? asString(raw.name) ?? id;
  const projectByObject = asRecord(raw.project)?.id;
  const projectId = asString(raw.projectId) ?? asString(projectByObject);
  return { id, title, projectId, raw };
}

function parseProject(rawProject: unknown): YouGileProject | null {
  const raw = asRecord(rawProject);
  if (!raw) {
    return null;
  }

  const id = asString(raw.id) ?? asString(raw.projectId);
  if (!id) {
    return null;
  }
  const title = asString(raw.title) ?? asString(raw.name) ?? id;
  return { id, title, raw };
}

function parseUser(rawUser: unknown): YouGileUser | null {
  const raw = asRecord(rawUser);
  if (!raw) {
    return null;
  }

  const id = asString(raw.id) ?? asString(raw.userId);
  if (!id) {
    return null;
  }

  const firstName = asString(raw.firstName);
  const lastName = asString(raw.lastName);
  const fullName = [firstName, lastName].filter((entry): entry is string => Boolean(entry)).join(' ').trim();

  const realName = asString(raw.realName);
  const name =
    realName ??
    asString(raw.name) ??
    asString(raw.fullName) ??
    asString(raw.title) ??
    (fullName || id);

  const email = asString(raw.email);
  const status = asString(raw.status);
  return { id, name, realName, email, status, raw };
}

function extractTaskArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }

  const candidates = [envelope.content, envelope.items, envelope.data, envelope.tasks];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function requestJson<T>(url: URL, apiKey: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode > 299) {
            const bodyMessage = text ? ` ${text.slice(0, 300)}` : '';
            reject(
              new Error(
                `${t('yougile.requestFailed', { status: String(res.statusCode ?? 'unknown') })}${bodyMessage}`
              )
            );
            return;
          }
          try {
            resolve((text ? JSON.parse(text) : {}) as T);
          } catch {
            reject(new Error(t('yougile.invalidJson')));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function requestTaskListPage(
  apiBaseUrl: string,
  apiKey: string,
  offset: number,
  limit: number,
  assigneeId?: string
): Promise<YouGileTaskListResponse> {
  const url = new URL('task-list', `${apiBaseUrl}/`);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  if (assigneeId) {
    url.searchParams.set('assignedTo', assigneeId);
  }
  return requestJson<YouGileTaskListResponse>(url, apiKey);
}

async function getAllTaskListItems(
  apiBaseUrl: string,
  apiKey: string,
  assigneeId?: string
): Promise<unknown[]> {
  const limit = 1000;
  let offset = 0;
  const all: unknown[] = [];

  while (true) {
    const page = await requestTaskListPage(apiBaseUrl, apiKey, offset, limit, assigneeId);
    const items = extractTaskArray(page);
    all.push(...items);

    const next = page.paging?.next ?? false;
    if (!next || items.length === 0) {
      break;
    }
    offset += limit;
  }
  return all;
}

export function getTaskSource(): 'local' | 'yougile' {
  const value = vscode.workspace.getConfiguration('cursorTaskChats').get<string>('integration.source');
  return value === 'yougile' ? 'yougile' : 'local';
}

export function getYouGileConfig(): { apiBaseUrl: string; apiKey: string } {
  const config = vscode.workspace.getConfiguration('cursorTaskChats');
  const apiBaseUrl = normalizeBaseUrl(
    config.get<string>('yougile.apiBaseUrl') ?? DEFAULT_API_BASE_URL
  );
  const apiKey = config.get<string>('yougile.apiKey')?.trim() ?? '';
  return { apiBaseUrl, apiKey };
}

export function getYouGileIntegrationOptions(): YouGileIntegrationOptions {
  const config = vscode.workspace.getConfiguration('cursorTaskChats');
  const assigneeId = config.get<string>('yougile.assigneeId')?.trim() || undefined;
  const projectId = config.get<string>('yougile.projectId')?.trim() || undefined;
  const boardId = config.get<string>('yougile.boardId')?.trim() || undefined;
  const showEmptyColumns = config.get<boolean>('yougile.showEmptyColumns') ?? false;
  return { assigneeId, projectId, boardId, showEmptyColumns };
}

function extractColumnArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }

  const candidates = [envelope.content, envelope.items, envelope.data, envelope.columns];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function extractUserArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }

  const candidates = [envelope.content, envelope.items, envelope.data, envelope.users];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function extractBoardArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }
  const candidates = [envelope.content, envelope.items, envelope.data, envelope.boards];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function extractProjectArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }
  const candidates = [envelope.content, envelope.items, envelope.data, envelope.projects];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function filterTasksByAssignee(tasks: YouGileTask[], assigneeId?: string): YouGileTask[] {
  if (!assigneeId) {
    return tasks;
  }
  return tasks.filter((task) => task.assigneeIds.includes(assigneeId));
}

function resolveParentIdsFromSubtasks(tasks: YouGileTask[]): YouGileTask[] {
  const parentIdByTaskId = new Map<string, string>();
  for (const task of tasks) {
    for (const subId of task.subtaskIds) {
      if (!parentIdByTaskId.has(subId)) {
        parentIdByTaskId.set(subId, task.id);
      }
    }
  }

  return tasks.map((task) => ({
    ...task,
    parentTaskId: task.parentTaskId ?? parentIdByTaskId.get(task.id),
  }));
}

function applyBoardProjectFilter(
  tasks: YouGileTask[],
  columns: YouGileColumn[],
  boards: YouGileBoard[],
  options: YouGileIntegrationOptions
): { tasks: YouGileTask[]; columns: YouGileColumn[]; boards: YouGileBoard[] } {
  const allowedBoardIds = new Set<string>();

  if (options.boardId) {
    allowedBoardIds.add(options.boardId);
  } else if (options.projectId) {
    for (const board of boards) {
      if (board.projectId === options.projectId) {
        allowedBoardIds.add(board.id);
      }
    }
  } else {
    for (const board of boards) {
      allowedBoardIds.add(board.id);
    }
  }

  const filteredBoards = boards.filter((board) => allowedBoardIds.has(board.id));
  const allowedColumnIds = new Set(
    columns.filter((column) => column.boardId && allowedBoardIds.has(column.boardId)).map((column) => column.id)
  );
  const filteredColumns = columns.filter((column) => {
    if (!column.boardId) {
      return false;
    }
    return allowedBoardIds.has(column.boardId);
  });
  const filteredTasks = tasks.filter((task) => {
    if (!task.columnId) {
      return false;
    }
    return allowedColumnIds.has(task.columnId);
  });

  return { tasks: filteredTasks, columns: filteredColumns, boards: filteredBoards };
}

function addSyntheticNoColumn(columns: YouGileColumn[], tasks: YouGileTask[]): YouGileColumn[] {
  const hasNoColumnTasks = tasks.some((task) => !task.columnId);
  if (!hasNoColumnTasks) {
    return columns;
  }
  return [
    ...columns,
    { id: NO_COLUMN_GROUP_ID, title: t('yougile.column.noColumn'), raw: {} },
  ];
}

export async function getYouGileTaskSourceData(): Promise<YouGileTaskSourceData> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  const options = getYouGileIntegrationOptions();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }

  const [taskItems, columnsPayload, boardsPayload, projectsPayload] = await Promise.all([
    getAllTaskListItems(apiBaseUrl, apiKey, options.assigneeId),
    requestJson<unknown>(new URL('columns', `${apiBaseUrl}/`), apiKey),
    requestJson<unknown>(new URL('boards', `${apiBaseUrl}/`), apiKey),
    requestJson<unknown>(new URL('projects', `${apiBaseUrl}/`), apiKey),
  ]);

  const tasks = taskItems
    .map((entry, index) => parseTask(entry, index))
    .filter((entry): entry is YouGileTask => Boolean(entry))
    .filter((entry) => !entry.archived);
  const filteredTasks = resolveParentIdsFromSubtasks(filterTasksByAssignee(tasks, options.assigneeId));

  const columns = extractColumnArray(columnsPayload)
    .map((entry) => parseColumn(entry))
    .filter((entry): entry is YouGileColumn => Boolean(entry));
  const boards = extractBoardArray(boardsPayload)
    .map((entry) => parseBoard(entry))
    .filter((entry): entry is YouGileBoard => Boolean(entry));
  const projects = extractProjectArray(projectsPayload)
    .map((entry) => parseProject(entry))
    .filter((entry): entry is YouGileProject => Boolean(entry));

  const scope = applyBoardProjectFilter(filteredTasks, columns, boards, options);

  const columnsWithSynthetic = addSyntheticNoColumn(scope.columns, scope.tasks);
  return { tasks: scope.tasks, columns: columnsWithSynthetic, boards: scope.boards, projects };
}

export async function getYouGileUsers(): Promise<YouGileUser[]> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }

  const payload = await requestJson<unknown>(new URL('users', `${apiBaseUrl}/`), apiKey);
  return extractUserArray(payload)
    .map((entry) => parseUser(entry))
    .filter((entry): entry is YouGileUser => Boolean(entry));
}

export async function getYouGileColumns(): Promise<YouGileColumn[]> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }

  const payload = await requestJson<unknown>(new URL('columns', `${apiBaseUrl}/`), apiKey);
  return extractColumnArray(payload)
    .map((entry) => parseColumn(entry))
    .filter((entry): entry is YouGileColumn => Boolean(entry));
}

export async function getYouGileBoards(): Promise<YouGileBoard[]> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }

  const payload = await requestJson<unknown>(new URL('boards', `${apiBaseUrl}/`), apiKey);
  return extractBoardArray(payload)
    .map((entry) => parseBoard(entry))
    .filter((entry): entry is YouGileBoard => Boolean(entry));
}

export async function getYouGileProjects(): Promise<YouGileProject[]> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }

  const payload = await requestJson<unknown>(new URL('projects', `${apiBaseUrl}/`), apiKey);
  return extractProjectArray(payload)
    .map((entry) => parseProject(entry))
    .filter((entry): entry is YouGileProject => Boolean(entry));
}

export async function getYouGileTaskById(taskId: string): Promise<YouGileTask | undefined> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }
  const trimmed = taskId.trim();
  if (!trimmed) {
    return undefined;
  }

  const payload = await requestJson<unknown>(
    new URL(`tasks/${encodeURIComponent(trimmed)}`, `${apiBaseUrl}/`),
    apiKey
  );
  const parsed = parseTask(payload);
  return parsed ?? undefined;
}

export async function setYouGileAssigneeFilter(
  assigneeId?: string
): Promise<void> {
  const idValue = assigneeId?.trim() || '';
  const rootConfig = vscode.workspace.getConfiguration();
  await rootConfig.update(
    'cursorTaskChats.yougile.assigneeId',
    idValue,
    vscode.ConfigurationTarget.Workspace
  );
}

export async function setYouGileProjectFilter(projectId?: string): Promise<void> {
  const value = projectId?.trim() || '';
  const rootConfig = vscode.workspace.getConfiguration();
  await rootConfig.update(
    'cursorTaskChats.yougile.projectId',
    value,
    vscode.ConfigurationTarget.Workspace
  );
}

export async function setYouGileBoardFilter(boardId?: string): Promise<void> {
  const value = boardId?.trim() || '';
  const rootConfig = vscode.workspace.getConfiguration();
  await rootConfig.update(
    'cursorTaskChats.yougile.boardId',
    value,
    vscode.ConfigurationTarget.Workspace
  );
}

export function getYouGileColumnGroupId(task: YouGileTask): string {
  return task.columnId ?? NO_COLUMN_GROUP_ID;
}
