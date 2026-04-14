import type { Database } from 'sql.js';
import * as vscode from 'vscode';
import { readLegacyTaskRegistry } from './legacyRegistryRead';

export function migrateLegacyJsonIntoDatabaseIfNeeded(
  db: Database,
  context: vscode.ExtensionContext,
  workspaceFolderFsPath: string
): void {
  const migrated = readMeta(db, 'migrated_from_global_state');
  if (migrated === '1') {
    return;
  }

  const legacy = readLegacyTaskRegistry(context.globalState);
  if (legacy) {
    for (const t of legacy.tasks) {
      if (t.workspaceFolder !== workspaceFolderFsPath) {
        continue;
      }
      db.run(
        `INSERT OR REPLACE INTO tasks (id, workspace_folder, branch_name, parent_task_id, title, description, status, baseline_commit_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.workspaceFolder,
          t.branchName,
          t.parentTaskId ?? null,
          t.title,
          t.description ?? null,
          t.status,
          t.baselineCommitHash ?? null,
          t.createdAt,
          t.updatedAt,
        ]
      );
    }
    const taskIdsForWs = new Set(
      legacy.tasks.filter((x) => x.workspaceFolder === workspaceFolderFsPath).map((x) => x.id)
    );
    for (const c of legacy.chats) {
      if (!taskIdsForWs.has(c.taskId)) {
        continue;
      }
      db.run(
        `INSERT OR REPLACE INTO task_chats (id, task_id, composer_id, prompt_text, cached_name, custom_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          c.taskId,
          c.composerId,
          c.promptText ?? null,
          c.cachedName ?? null,
          c.customName ?? null,
          c.status,
          c.createdAt,
          c.updatedAt,
        ]
      );
    }
  }

  db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_from_global_state', '1')`);
}

function readMeta(db: Database, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM meta WHERE key = ?');
  stmt.bind([key]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as { value?: string };
  stmt.free();
  return row.value ?? null;
}
