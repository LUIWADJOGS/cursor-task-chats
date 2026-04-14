import * as path from 'path';
import * as vscode from 'vscode';

const CONFIG_SECTION = 'cursorTaskChats';
const DB_RELATIVE_KEY = 'databaseRelativePath';

const DEFAULT_RELATIVE = '.cursor/task-chats/tasks.sqlite';

export function getTaskDatabaseAbsolutePath(
  workspaceFolder: vscode.WorkspaceFolder,
  config: vscode.WorkspaceConfiguration
): string {
  const relative =
    (config.get<string>(DB_RELATIVE_KEY)?.trim() || DEFAULT_RELATIVE).replace(/\\/g, '/');
  const normalized = relative.startsWith('/') ? relative.slice(1) : relative;
  return path.join(workspaceFolder.uri.fsPath, ...normalized.split('/').filter(Boolean));
}

export function getConfig(workspaceFolder: vscode.WorkspaceFolder): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION, workspaceFolder.uri);
}
