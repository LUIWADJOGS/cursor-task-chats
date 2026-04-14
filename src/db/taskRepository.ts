import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'sql.js';
import * as vscode from 'vscode';
import { loadSqlJs } from './sqlJsLoader';
import { getTaskDatabaseAbsolutePath, getConfig } from './taskDbPaths';
import { migrateLegacyJsonIntoDatabaseIfNeeded } from './migrateLegacyIntoDb';
import type {
  TaskAttachmentEntity,
  TaskChatEntity,
  TaskChatStatus,
  TaskChecklistItem,
  TaskEntity,
  TaskStatus,
} from '../types/taskManager';

/** Keyed by absolute SQLite path so changing `databaseRelativePath` does not reuse a stale DB handle. */
const repoCache = new Map<string, TaskRepository>();

function getUserVersion(db: Database): number {
  const res = db.exec('PRAGMA user_version');
  if (!res[0]?.values?.[0]) {
    return 0;
  }
  return Number(res[0].values[0][0]);
}

function applyInitialSchema(db: Database): void {
  const statements = [
    `CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workspace_folder TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      parent_task_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      baseline_commit_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS task_chats (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      composer_id TEXT NOT NULL,
      prompt_text TEXT,
      cached_name TEXT,
      custom_name TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(task_id, composer_id)
    )`,
    `CREATE TABLE IF NOT EXISTS task_checklist_items (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      label TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      path_relative TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(task_id, path_relative)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_branch_ws ON tasks(branch_name, workspace_folder)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_chats_task ON task_chats(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attach_task ON task_attachments(task_id)`,
  ];
  for (const sql of statements) {
    db.run(sql);
  }
  db.run('PRAGMA user_version = 1');
}

function persistDb(db: Database, dbPath: string): void {
  const data = db.export();
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowTask(r: Record<string, unknown>): TaskEntity {
  return {
    id: String(r.id),
    workspaceFolder: String(r.workspace_folder),
    branchName: String(r.branch_name),
    parentTaskId: r.parent_task_id ? String(r.parent_task_id) : undefined,
    title: String(r.title),
    description: r.description ? String(r.description) : undefined,
    status: r.status as TaskStatus,
    baselineCommitHash: r.baseline_commit_hash ? String(r.baseline_commit_hash) : undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowChat(r: Record<string, unknown>): TaskChatEntity {
  return {
    id: String(r.id),
    taskId: String(r.task_id),
    composerId: String(r.composer_id),
    promptText: r.prompt_text ? String(r.prompt_text) : undefined,
    cachedName: r.cached_name ? String(r.cached_name) : undefined,
    customName: r.custom_name ? String(r.custom_name) : undefined,
    status: r.status as TaskChatStatus,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowChecklist(r: Record<string, unknown>): TaskChecklistItem {
  return {
    id: String(r.id),
    taskId: String(r.task_id),
    label: String(r.label),
    done: Number(r.done) === 1,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function rowAttachment(r: Record<string, unknown>): TaskAttachmentEntity {
  return {
    id: String(r.id),
    taskId: String(r.task_id),
    pathRelative: String(r.path_relative),
    note: r.note ? String(r.note) : undefined,
    createdAt: String(r.created_at),
  };
}

export async function openTaskRepository(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<TaskRepository> {
  const config = getConfig(workspaceFolder);
  const dbPath = getTaskDatabaseAbsolutePath(workspaceFolder, config);
  const existing = repoCache.get(dbPath);
  if (existing) {
    return existing;
  }
  const SQL = await loadSqlJs(context.extensionUri);

  let db: Database;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  } else {
    db = new SQL.Database();
  }

  if (getUserVersion(db) < 1) {
    applyInitialSchema(db);
  }

  migrateLegacyJsonIntoDatabaseIfNeeded(db, context, workspaceFolder.uri.fsPath);
  persistDb(db, dbPath);

  const repo = new TaskRepository(db, dbPath, workspaceFolder.uri.fsPath);
  repoCache.set(dbPath, repo);
  return repo;
}

export function flushAllTaskRepositories(): void {
  for (const repo of repoCache.values()) {
    repo.flush();
  }
  repoCache.clear();
}

export class TaskRepository {
  constructor(
    private readonly db: Database,
    private readonly dbPath: string,
    private readonly workspaceFolderFsPath: string
  ) {}

  flush(): void {
    persistDb(this.db, this.dbPath);
  }

  private persist(): void {
    persistDb(this.db, this.dbPath);
  }

  getAllTasks(): TaskEntity[] {
    const stmt = this.db.prepare(
      'SELECT * FROM tasks WHERE workspace_folder = ? ORDER BY updated_at DESC'
    );
    stmt.bind([this.workspaceFolderFsPath]);
    const out: TaskEntity[] = [];
    while (stmt.step()) {
      out.push(rowTask(stmt.getAsObject()));
    }
    stmt.free();
    return out;
  }

  getAllChats(): TaskChatEntity[] {
    const tasks = this.getAllTasks();
    const ids = new Set(tasks.map((t) => t.id));
    if (ids.size === 0) {
      return [];
    }
    const placeholders = [...ids].map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM task_chats WHERE task_id IN (${placeholders})`);
    stmt.bind([...ids]);
    const out: TaskChatEntity[] = [];
    while (stmt.step()) {
      out.push(rowChat(stmt.getAsObject()));
    }
    stmt.free();
    return out;
  }

  getTasksForBranch(branchName: string): TaskEntity[] {
    const stmt = this.db.prepare(
      `SELECT * FROM tasks WHERE workspace_folder = ? AND branch_name = ? AND status != 'archived' ORDER BY updated_at DESC`
    );
    stmt.bind([this.workspaceFolderFsPath, branchName]);
    const out: TaskEntity[] = [];
    while (stmt.step()) {
      out.push(rowTask(stmt.getAsObject()));
    }
    stmt.free();
    return out;
  }

  getRootTasksForBranch(branchName: string): TaskEntity[] {
    return this.getTasksForBranch(branchName).filter((t) => !t.parentTaskId);
  }

  getSubtasks(parentTaskId: string): TaskEntity[] {
    const stmt = this.db.prepare(
      `SELECT * FROM tasks WHERE parent_task_id = ? AND workspace_folder = ? AND status != 'archived' ORDER BY updated_at DESC`
    );
    stmt.bind([parentTaskId, this.workspaceFolderFsPath]);
    const out: TaskEntity[] = [];
    while (stmt.step()) {
      out.push(rowTask(stmt.getAsObject()));
    }
    stmt.free();
    return out;
  }

  getTaskById(id: string): TaskEntity | null {
    const stmt = this.db.prepare(
      'SELECT * FROM tasks WHERE id = ? AND workspace_folder = ? LIMIT 1'
    );
    stmt.bind([id, this.workspaceFolderFsPath]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = rowTask(stmt.getAsObject());
    stmt.free();
    return row;
  }

  getChatsForTask(taskId: string): TaskChatEntity[] {
    const stmt = this.db.prepare(
      `SELECT * FROM task_chats WHERE task_id = ? AND status = 'active' ORDER BY updated_at DESC`
    );
    stmt.bind([taskId]);
    const out: TaskChatEntity[] = [];
    while (stmt.step()) {
      out.push(rowChat(stmt.getAsObject()));
    }
    stmt.free();
    return out;
  }

  getChatById(id: string): TaskChatEntity | null {
    const stmt = this.db.prepare('SELECT * FROM task_chats WHERE id = ? LIMIT 1');
    stmt.bind([id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = rowChat(stmt.getAsObject());
    stmt.free();
    return row;
  }

  getTaskChatByComposerId(composerId: string): TaskChatEntity | null {
    const taskIds = new Set(this.getAllTasks().map((t) => t.id));
    const stmt = this.db.prepare('SELECT * FROM task_chats WHERE composer_id = ?');
    stmt.bind([composerId]);
    while (stmt.step()) {
      const c = rowChat(stmt.getAsObject());
      if (taskIds.has(c.taskId)) {
        stmt.free();
        return c;
      }
    }
    stmt.free();
    return null;
  }

  createTask(
    input: Omit<TaskEntity, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskStatus }
  ): TaskEntity {
    const now = new Date().toISOString();
    const task: TaskEntity = {
      ...input,
      status: input.status ?? 'todo',
      id: nextId(),
      createdAt: now,
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO tasks (id, workspace_folder, branch_name, parent_task_id, title, description, status, baseline_commit_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.workspaceFolder,
        task.branchName,
        task.parentTaskId ?? null,
        task.title,
        task.description ?? null,
        task.status,
        task.baselineCommitHash ?? null,
        task.createdAt,
        task.updatedAt,
      ]
    );
    this.persist();
    return task;
  }

  updateTask(
    id: string,
    patch: Partial<
      Pick<TaskEntity, 'title' | 'description' | 'status' | 'branchName' | 'baselineCommitHash' | 'parentTaskId'>
    >
  ): TaskEntity | null {
    const cur = this.getTaskById(id);
    if (!cur) {
      return null;
    }
    const updated: TaskEntity = {
      ...cur,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.run(
      `UPDATE tasks SET title = ?, description = ?, status = ?, branch_name = ?, baseline_commit_hash = ?, parent_task_id = ?, updated_at = ?
       WHERE id = ? AND workspace_folder = ?`,
      [
        updated.title,
        updated.description ?? null,
        updated.status,
        updated.branchName,
        updated.baselineCommitHash ?? null,
        updated.parentTaskId ?? null,
        updated.updatedAt,
        id,
        this.workspaceFolderFsPath,
      ]
    );
    this.persist();
    return updated;
  }

  archiveTask(id: string): TaskEntity | null {
    return this.updateTask(id, { status: 'archived' });
  }

  createTaskChatLink(
    input: Omit<TaskChatEntity, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskChatStatus }
  ): TaskChatEntity {
    const now = new Date().toISOString();
    const chat: TaskChatEntity = {
      ...input,
      status: input.status ?? 'active',
      id: nextId(),
      createdAt: now,
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO task_chats (id, task_id, composer_id, prompt_text, cached_name, custom_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chat.id,
        chat.taskId,
        chat.composerId,
        chat.promptText ?? null,
        chat.cachedName ?? null,
        chat.customName ?? null,
        chat.status,
        chat.createdAt,
        chat.updatedAt,
      ]
    );
    this.persist();
    return chat;
  }

  updateTaskChatLink(
    id: string,
    patch: Partial<Pick<TaskChatEntity, 'customName' | 'cachedName' | 'promptText' | 'status'>>
  ): TaskChatEntity | null {
    const cur = this.getChatById(id);
    if (!cur) {
      return null;
    }
    const updated: TaskChatEntity = {
      ...cur,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.run(
      `UPDATE task_chats SET prompt_text = ?, cached_name = ?, custom_name = ?, status = ?, updated_at = ? WHERE id = ?`,
      [
        updated.promptText ?? null,
        updated.cachedName ?? null,
        updated.customName ?? null,
        updated.status,
        updated.updatedAt,
        id,
      ]
    );
    this.persist();
    return updated;
  }

  upsertTaskChatByComposer(
    input: Omit<TaskChatEntity, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskChatStatus }
  ): TaskChatEntity {
    const stmt = this.db.prepare(
      'SELECT * FROM task_chats WHERE task_id = ? AND composer_id = ? LIMIT 1'
    );
    stmt.bind([input.taskId, input.composerId]);
    if (stmt.step()) {
      const existing = rowChat(stmt.getAsObject());
      stmt.free();
      const now = new Date().toISOString();
      this.db.run(
        `UPDATE task_chats SET prompt_text = ?, cached_name = ?, custom_name = ?, status = ?, updated_at = ? WHERE id = ?`,
        [
          input.promptText ?? null,
          input.cachedName ?? null,
          input.customName ?? null,
          input.status ?? 'active',
          now,
          existing.id,
        ]
      );
      this.persist();
      return this.getChatById(existing.id) ?? { ...existing, ...input, updatedAt: new Date().toISOString() };
    }
    stmt.free();
    return this.createTaskChatLink(input);
  }

  archiveTaskChatLink(id: string): TaskChatEntity | null {
    return this.updateTaskChatLink(id, { status: 'archived' });
  }

  getDescendantTaskIds(rootId: string): Set<string> {
    const all = this.getAllTasks();
    const out = new Set<string>();
    const walk = (id: string): void => {
      out.add(id);
      for (const t of all) {
        if (t.parentTaskId === id && t.status !== 'archived') {
          walk(t.id);
        }
      }
    };
    walk(rootId);
    return out;
  }

  getChecklist(taskId: string): TaskChecklistItem[] {
    const stmt = this.db.prepare(
      'SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY sort_order ASC, id ASC'
    );
    stmt.bind([taskId]);
    const out: TaskChecklistItem[] = [];
    while (stmt.step()) {
      out.push(rowChecklist(stmt.getAsObject()));
    }
    stmt.free();
    return out;
  }

  getChecklistStats(taskId: string): { done: number; total: number } {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as c, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as d FROM task_checklist_items WHERE task_id = ?'
    );
    stmt.bind([taskId]);
    if (!stmt.step()) {
      stmt.free();
      return { done: 0, total: 0 };
    }
    const o = stmt.getAsObject() as { c?: number; d?: number | null };
    stmt.free();
    const total = Number(o.c ?? 0);
    const done = Number(o.d ?? 0);
    return { done, total };
  }

  addChecklistItem(taskId: string, label: string): TaskChecklistItem {
    const id = nextId();
    const stmt = this.db.prepare(
      'SELECT MAX(sort_order) as m FROM task_checklist_items WHERE task_id = ?'
    );
    stmt.bind([taskId]);
    let maxSort = -1;
    if (stmt.step()) {
      const r = stmt.getAsObject() as { m?: number | null };
      maxSort = Number(r.m ?? -1);
    }
    stmt.free();
    const sortOrder = maxSort + 1;
    this.db.run(
      `INSERT INTO task_checklist_items (id, task_id, label, done, sort_order) VALUES (?, ?, ?, 0, ?)`,
      [id, taskId, label, sortOrder]
    );
    this.persist();
    return {
      id,
      taskId,
      label,
      done: false,
      sortOrder,
    };
  }

  setChecklistItemDone(id: string, done: boolean): void {
    this.db.run('UPDATE task_checklist_items SET done = ? WHERE id = ?', [done ? 1 : 0, id]);
    this.persist();
  }

  removeChecklistItem(id: string): void {
    this.db.run('DELETE FROM task_checklist_items WHERE id = ?', [id]);
    this.persist();
  }

  getAttachments(taskId: string): TaskAttachmentEntity[] {
    const stmt = this.db.prepare(
      'SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC'
    );
    stmt.bind([taskId]);
    const out: TaskAttachmentEntity[] = [];
    while (stmt.step()) {
      out.push(rowAttachment(stmt.getAsObject()));
    }
    stmt.free();
    return out;
  }

  addAttachment(taskId: string, pathRelative: string, note?: string): TaskAttachmentEntity {
    const now = new Date().toISOString();
    const find = this.db.prepare(
      'SELECT * FROM task_attachments WHERE task_id = ? AND path_relative = ? LIMIT 1'
    );
    find.bind([taskId, pathRelative]);
    if (find.step()) {
      const row = rowAttachment(find.getAsObject());
      find.free();
      this.db.run('UPDATE task_attachments SET note = ? WHERE id = ?', [note ?? null, row.id]);
      this.persist();
      const stmt2 = this.db.prepare('SELECT * FROM task_attachments WHERE id = ?');
      stmt2.bind([row.id]);
      stmt2.step();
      const updated = rowAttachment(stmt2.getAsObject());
      stmt2.free();
      return updated;
    }
    find.free();
    const id = nextId();
    this.db.run(
      `INSERT INTO task_attachments (id, task_id, path_relative, note, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, taskId, pathRelative, note ?? null, now]
    );
    this.persist();
    return { id, taskId, pathRelative, note, createdAt: now };
  }

  removeAttachment(id: string): void {
    this.db.run('DELETE FROM task_attachments WHERE id = ?', [id]);
    this.persist();
  }
}
