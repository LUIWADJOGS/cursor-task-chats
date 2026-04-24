import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { t } from '../i18n';

const DEFAULT_API_BASE_URL = 'https://ru.yougile.com/api-v2';
const NO_COLUMN_GROUP_ID = '__yougile_no_column__';
type FilterKey = 'assigneeId' | 'projectId' | 'boardId';
const runtimeFilterOverrides: Partial<Record<FilterKey, string | undefined>> = {};
const runtimeFilterOverrideTouched: Partial<Record<FilterKey, boolean>> = {};

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

export interface YouGileStickerState {
  id: string;
  title: string;
  hint?: string;
}

export interface YouGileStringSticker {
  id: string;
  title: string;
  icon?: string;
  states: YouGileStickerState[];
  raw: Record<string, unknown>;
}

export interface YouGileTimeRecord {
  id: string;
  date?: string;
  duration: number;
  revision?: string;
}

export interface YouGileTaskUserTimeStats {
  totalSpentTime: number;
  records: YouGileTimeRecord[];
}

export interface YouGileTaskTimeStats {
  totalSpentTime: number;
  users: Record<string, YouGileTaskUserTimeStats>;
}

export interface YouGileLiveTimer {
  taskId: string;
  userId: string;
  startedAt?: string;
  duration?: number;
}

export interface YouGileTimeStatsDebug {
  skipped: boolean;
  reason?: string;
  requestUrl: string;
  requestPayload?: Record<string, unknown>;
  responseResult?: string;
  responseBody?: unknown;
  error?: string;
}

export interface YouGileTimeStatsBatchResult {
  taskStats: Record<string, YouGileTaskTimeStats>;
  liveTimers: YouGileLiveTimer[];
  debug: YouGileTimeStatsDebug;
}

export interface YouGileAuthCompany {
  id: string;
  name: string;
  isAdmin?: boolean;
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

export type YouGileExtensionConfig = {
  userKey?: string;
  userId?: string;
  companyId?: string;
  appVersion: string;
  clientType: string;
  v: number;
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
  stickers?: unknown;
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

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function parseStickerState(rawState: unknown): YouGileStickerState | null {
  const raw = asRecord(rawState);
  if (!raw) {
    return null;
  }
  const id = asString(raw.id) ?? asString(raw.stateId);
  if (!id) {
    return null;
  }
  const title = asString(raw.title) ?? asString(raw.name) ?? id;
  const hint = asString(raw.description) ?? asString(raw.hint);
  return { id, title, hint };
}

function parseStringSticker(rawSticker: unknown): YouGileStringSticker | null {
  const raw = asRecord(rawSticker);
  if (!raw) {
    return null;
  }
  const id = asString(raw.id) ?? asString(raw.stickerId);
  if (!id) {
    return null;
  }
  const title = asString(raw.title) ?? asString(raw.name) ?? id;
  const icon = asString(raw.icon) ?? asString(raw.emoji) ?? asString(raw.iconText);

  const statesRaw = raw.states;
  let states: YouGileStickerState[] = [];
  if (Array.isArray(statesRaw)) {
    states = statesRaw
      .map((entry) => parseStickerState(entry))
      .filter((entry): entry is YouGileStickerState => Boolean(entry));
  } else {
    const statesRecord = asRecord(statesRaw);
    if (statesRecord) {
      states = Object.entries(statesRecord)
        .map(([stateId, value]) => {
          const parsed = parseStickerState(value);
          return parsed ?? { id: stateId, title: stateId };
        })
        .filter((entry): entry is YouGileStickerState => Boolean(entry));
    }
  }

  return { id, title, icon, states, raw };
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
  return requestJsonWithOptions<T>(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

function requestJsonWithOptions<T>(
  url: URL,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: options.method,
        headers: options.headers,
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
    if (options.body) {
      req.write(options.body);
    }
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
  const rawApiBase =
    getWorkspaceSettingRaw('cursorTaskChats.yougile.apiBaseUrl') ??
    config.get<string>('yougile.apiBaseUrl') ??
    DEFAULT_API_BASE_URL;
  const rawApiKey =
    getWorkspaceSettingRaw('cursorTaskChats.yougile.apiKey') ??
    config.get<string>('yougile.apiKey') ??
    '';
  const apiBaseUrl = normalizeBaseUrl(
    String(rawApiBase)
  );
  const apiKey = String(rawApiKey).trim();
  return { apiBaseUrl, apiKey };
}

export function getYouGileIntegrationOptions(): YouGileIntegrationOptions {
  const config = vscode.workspace.getConfiguration('cursorTaskChats');
  const assigneeId = getFilterValueWithRuntimeOverride(
    'assigneeId',
    config.get<string>('yougile.assigneeId')
  );
  const projectId = getFilterValueWithRuntimeOverride(
    'projectId',
    config.get<string>('yougile.projectId')
  );
  const boardId = getFilterValueWithRuntimeOverride(
    'boardId',
    config.get<string>('yougile.boardId')
  );
  const showEmptyColumns = config.get<boolean>('yougile.showEmptyColumns') ?? false;
  return { assigneeId, projectId, boardId, showEmptyColumns };
}

export function getYouGileExtensionConfig(): YouGileExtensionConfig {
  const config = vscode.workspace.getConfiguration('cursorTaskChats');
  const userKey = (
    getWorkspaceSettingRaw('cursorTaskChats.yougile.extension.userKey') ??
    config.get<string>('yougile.extension.userKey')
  )?.toString().trim() || undefined;
  const userId = (
    getWorkspaceSettingRaw('cursorTaskChats.yougile.extension.userId') ??
    config.get<string>('yougile.extension.userId')
  )?.toString().trim() || undefined;
  const companyId = (
    getWorkspaceSettingRaw('cursorTaskChats.yougile.extension.companyId') ??
    config.get<string>('yougile.extension.companyId')
  )?.toString().trim() || undefined;
  const appVersion = (
    getWorkspaceSettingRaw('cursorTaskChats.yougile.extension.appVersion') ??
    config.get<string>('yougile.extension.appVersion') ??
    '40.45.1'
  ).toString().trim() || '40.45.1';
  const clientType = (
    getWorkspaceSettingRaw('cursorTaskChats.yougile.extension.clientType') ??
    config.get<string>('yougile.extension.clientType') ??
    'web'
  ).toString().trim() || 'web';
  const rawVersion =
    getWorkspaceSettingRaw('cursorTaskChats.yougile.extension.apiVersion') ??
    config.get<number>('yougile.extension.apiVersion') ??
    9;
  const v = typeof rawVersion === 'number' ? rawVersion : Number(rawVersion) || 9;
  return { userKey, userId, companyId, appVersion, clientType, v };
}

function getWorkspaceSettingRaw(key: string): string | number | boolean | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  const settingsPath = path.join(folder.uri.fsPath, '.vscode', 'settings.json');
  try {
    if (!fs.existsSync(settingsPath)) {
      return undefined;
    }
    const text = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const value = parsed[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    return undefined;
  } catch {
    return undefined;
  }
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

function extractStickerArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }
  const candidates = [envelope.content, envelope.items, envelope.data, envelope.stickers];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function extractGenericContentArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }
  const candidates = [envelope.content, envelope.items, envelope.data];
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

export async function getYouGileUsersByApiKey(apiKey: string, apiBaseUrl?: string): Promise<YouGileUser[]> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl ?? getYouGileConfig().apiBaseUrl);
  const payload = await requestJson<unknown>(new URL('users', `${baseUrl}/`), apiKey);
  return extractUserArray(payload)
    .map((entry) => parseUser(entry))
    .filter((entry): entry is YouGileUser => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
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

export async function getYouGileStringStickers(): Promise<YouGileStringSticker[]> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }

  const payload = await requestJson<unknown>(new URL('string-stickers', `${apiBaseUrl}/`), apiKey);
  return extractStickerArray(payload)
    .map((entry) => parseStringSticker(entry))
    .filter((entry): entry is YouGileStringSticker => Boolean(entry));
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

function parseTimeRecord(raw: unknown): YouGileTimeRecord | null {
  const entry = asRecord(raw);
  if (!entry) {
    return null;
  }
  const id = asString(entry.id);
  const duration = asNumber(entry.duration);
  if (!id || duration === undefined) {
    return null;
  }
  return {
    id,
    duration,
    date: asString(entry.date),
    revision: asString(entry.revision),
  };
}

function parseTaskUserTimeStats(raw: unknown): YouGileTaskUserTimeStats | null {
  const entry = asRecord(raw);
  if (!entry) {
    return null;
  }
  const totalSpentTime = asNumber(entry.totalSpentTime);
  if (totalSpentTime === undefined) {
    return null;
  }
  const recordsRaw = Array.isArray(entry.records) ? entry.records : [];
  const records = recordsRaw
    .map((record) => parseTimeRecord(record))
    .filter((record): record is YouGileTimeRecord => Boolean(record));
  return { totalSpentTime, records };
}

function parseTaskTimeStats(raw: unknown): YouGileTaskTimeStats | null {
  const entry = asRecord(raw);
  if (!entry) {
    return null;
  }
  const totalSpentTime = asNumber(entry.totalSpentTime);
  if (totalSpentTime === undefined) {
    return null;
  }
  const usersRaw = asRecord(entry.users) ?? {};
  const users: Record<string, YouGileTaskUserTimeStats> = {};
  for (const [userId, userStatsRaw] of Object.entries(usersRaw)) {
    const stats = parseTaskUserTimeStats(userStatsRaw);
    if (stats) {
      users[userId] = stats;
    }
  }
  return { totalSpentTime, users };
}

function parseLiveTimer(raw: unknown): YouGileLiveTimer | null {
  const entry = asRecord(raw);
  if (!entry) {
    return null;
  }
  const taskId = asString(entry.taskId) ?? asString(entry.idTask);
  const userId = asString(entry.userId) ?? asString(entry.idUser);
  if (!taskId || !userId) {
    return null;
  }
  return {
    taskId,
    userId,
    startedAt: asString(entry.startedAt) ?? asString(entry.date),
    duration: asNumber(entry.duration),
  };
}

function parseAuthCompany(raw: unknown): YouGileAuthCompany | null {
  const entry = asRecord(raw);
  if (!entry) {
    return null;
  }
  const id = asString(entry.id) ?? asString(entry.companyId);
  if (!id) {
    return null;
  }
  return {
    id,
    name: asString(entry.name) ?? id,
    isAdmin: toBoolean(entry.isAdmin),
  };
}

function parseApiKeyEntry(raw: unknown): { key: string; deleted: boolean; timestamp?: number; userId?: string } | null {
  const entry = asRecord(raw);
  if (!entry) {
    return null;
  }
  const key = asString(entry.key);
  if (!key) {
    return null;
  }
  const deleted = toBoolean(entry.deleted) ?? false;
  const timestampText = asString(entry.timestamp);
  const timestamp = timestampText ? Number(timestampText) : asNumber(entry.timestamp);
  const userId = asString(entry.userId) ?? asString(entry.idUser);
  return { key, deleted, timestamp: Number.isFinite(timestamp ?? NaN) ? timestamp : undefined, userId };
}

function getAuthBaseUrl(apiBaseUrl: string): string {
  const normalized = normalizeBaseUrl(apiBaseUrl);
  if (normalized.endsWith('/api-v2')) {
    return normalized;
  }
  return `${normalized}/api-v2`;
}

async function postAuthJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { apiBaseUrl } = getYouGileConfig();
  const authBase = getAuthBaseUrl(apiBaseUrl);
  return requestJsonWithOptions<T>(new URL(path, `${authBase}/`), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function getYouGileAuthCompanies(login: string, password: string): Promise<YouGileAuthCompany[]> {
  const payload = await postAuthJson<unknown>('auth/companies', { login, password });
  return extractGenericContentArray(payload)
    .map((entry) => parseAuthCompany(entry))
    .filter((entry): entry is YouGileAuthCompany => Boolean(entry));
}

export async function resolveYouGileApiKey(
  login: string,
  password: string,
  companyId: string
): Promise<{ key: string; userId?: string }> {
  const listPayload = await postAuthJson<unknown>('auth/keys/get', { login, password, companyId });
  const parsedKeys = extractGenericContentArray(listPayload)
    .map((entry) => parseApiKeyEntry(entry))
    .filter((entry): entry is { key: string; deleted: boolean; timestamp?: number; userId?: string } => Boolean(entry))
    .filter((entry) => !entry.deleted)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const picked = parsedKeys[0];
  if (picked) {
    return { key: picked.key, userId: picked.userId };
  }

  const created = await postAuthJson<unknown>('auth/keys', { login, password, companyId });
  const createdEntry = asRecord(created);
  const key = asString(createdEntry?.key);
  if (!key) {
    throw new Error('YouGile auth key was not returned by auth/keys endpoint');
  }
  return { key };
}

export async function saveYouGileAuthSetup(options: {
  apiKey: string;
  userKey?: string;
  companyId: string;
  userId?: string;
}): Promise<void> {
  await writeWorkspaceSetting('cursorTaskChats.integration.source', 'yougile');
  await writeWorkspaceSetting('cursorTaskChats.yougile.apiKey', options.apiKey);
  if (options.userKey?.trim()) {
    await writeWorkspaceSetting('cursorTaskChats.yougile.extension.userKey', options.userKey.trim());
  }
  await writeWorkspaceSetting('cursorTaskChats.yougile.extension.companyId', options.companyId);
  if (options.userId?.trim()) {
    await writeWorkspaceSetting('cursorTaskChats.yougile.extension.userId', options.userId.trim());
    await writeWorkspaceSetting('cursorTaskChats.yougile.assigneeId', options.userId.trim());
    setRuntimeFilterOverride('assigneeId', options.userId.trim());
  }
}

export async function getYouGileTimeStatsBatch(
  boardId: string,
  taskIds: string[],
  hints?: { userId?: string; companyId?: string }
): Promise<YouGileTimeStatsBatchResult> {
  const requestUrl = 'https://yougile.com/data/extension/exec';
  const extensionConfig = getYouGileExtensionConfig();
  const fallbackUserId = getYouGileIntegrationOptions().assigneeId;
  const resolvedUserId = extensionConfig.userId ?? hints?.userId ?? fallbackUserId;
  const resolvedCompanyId = extensionConfig.companyId ?? hints?.companyId;
  if (!boardId || taskIds.length === 0) {
    return {
      taskStats: {},
      liveTimers: [],
      debug: {
        skipped: true,
        reason: 'Missing boardId or taskIds',
        requestUrl,
      },
    };
  }
  if (!extensionConfig.userKey || !resolvedUserId || !resolvedCompanyId) {
    return {
      taskStats: {},
      liveTimers: [],
      debug: {
        skipped: true,
        reason: `Missing required params: ${[
          !extensionConfig.userKey ? 'userKey' : undefined,
          !resolvedUserId ? 'userId' : undefined,
          !resolvedCompanyId ? 'companyId' : undefined,
        ]
          .filter((entry): entry is string => Boolean(entry))
          .join(', ')}`,
        requestUrl,
        requestPayload: {
          userId: resolvedUserId,
          key: extensionConfig.userKey,
          companyId: resolvedCompanyId,
          extension: 'timetracking',
          prop: 'getBatchData',
          args: [{ boardId, userId: resolvedUserId, taskIds }],
          v: extensionConfig.v,
          appVersion: extensionConfig.appVersion,
          clientType: extensionConfig.clientType,
        },
      },
    };
  }

  const payload = {
    userId: resolvedUserId,
    key: extensionConfig.userKey,
    companyId: resolvedCompanyId,
    extension: 'timetracking',
    prop: 'getBatchData',
    args: [{ boardId, userId: resolvedUserId, taskIds }],
    v: extensionConfig.v,
    appVersion: extensionConfig.appVersion,
    clientType: extensionConfig.clientType,
  };
  let response: unknown;
  try {
    response = await requestJsonWithOptions<unknown>(new URL(requestUrl), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return {
      taskStats: {},
      liveTimers: [],
      debug: {
        skipped: false,
        requestUrl,
        requestPayload: {
          ...payload,
          key: extensionConfig.userKey,
        },
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const root = asRecord(response);
  const data = asRecord(root?.data);
  const taskStatsRaw = asRecord(data?.taskStats) ?? {};
  const taskStats: Record<string, YouGileTaskTimeStats> = {};
  for (const [taskId, rawStats] of Object.entries(taskStatsRaw)) {
    const parsed = parseTaskTimeStats(rawStats);
    if (parsed) {
      taskStats[taskId] = parsed;
    }
  }

  const liveTimersRaw = Array.isArray(data?.liveTimers) ? data.liveTimers : [];
  const liveTimers = liveTimersRaw
    .map((timer) => parseLiveTimer(timer))
    .filter((timer): timer is YouGileLiveTimer => Boolean(timer));

  return {
    taskStats,
    liveTimers,
    debug: {
      skipped: false,
      requestUrl,
      requestPayload: {
        ...payload,
        key: extensionConfig.userKey,
      },
      responseResult: asString(root?.result),
      responseBody: root,
    },
  };
}

export async function setYouGileAssigneeFilter(
  assigneeId?: string
): Promise<void> {
  const idValue = assigneeId?.trim() || '';
  setRuntimeFilterOverride('assigneeId', idValue);
  await writeWorkspaceSetting('cursorTaskChats.yougile.assigneeId', idValue);
}

export async function setYouGileProjectFilter(projectId?: string): Promise<void> {
  const value = projectId?.trim() || '';
  setRuntimeFilterOverride('projectId', value);
  await writeWorkspaceSetting('cursorTaskChats.yougile.projectId', value);
}

export async function setYouGileBoardFilter(boardId?: string): Promise<void> {
  const value = boardId?.trim() || '';
  setRuntimeFilterOverride('boardId', value);
  await writeWorkspaceSetting('cursorTaskChats.yougile.boardId', value);
}

export function getYouGileColumnGroupId(task: YouGileTask): string {
  return task.columnId ?? NO_COLUMN_GROUP_ID;
}

async function writeWorkspaceSetting(key: string, value: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    const rootConfig = vscode.workspace.getConfiguration();
    await rootConfig.update(key, value, vscode.ConfigurationTarget.Global);
    return;
  }

  const vscodeDir = vscode.Uri.joinPath(folder.uri, '.vscode');
  const settingsUri = vscode.Uri.joinPath(vscodeDir, 'settings.json');
  await vscode.workspace.fs.createDirectory(vscodeDir);

  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  let content = '{}';
  try {
    const raw = await vscode.workspace.fs.readFile(settingsUri);
    content = decoder.decode(raw);
  } catch {
    content = '{}';
  }

  let json: Record<string, unknown>;
  try {
    const parsed = JSON.parse(content);
    json = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    json = {};
  }

  json[key] = value;
  const next = `${JSON.stringify(json, null, 2)}\n`;
  await vscode.workspace.fs.writeFile(settingsUri, encoder.encode(next));
}

function setRuntimeFilterOverride(key: FilterKey, value: string): void {
  runtimeFilterOverrides[key] = value;
  runtimeFilterOverrideTouched[key] = true;
}

function getFilterValueWithRuntimeOverride(
  key: FilterKey,
  configValue?: string
): string | undefined {
  const value = runtimeFilterOverrideTouched[key] ? runtimeFilterOverrides[key] : configValue;
  return value?.trim() || undefined;
}
