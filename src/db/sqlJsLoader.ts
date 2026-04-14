import * as path from 'path';
import * as vscode from 'vscode';
import type { SqlJsStatic } from 'sql.js';

let sqlModule: SqlJsStatic | null = null;

export async function loadSqlJs(extensionUri: vscode.Uri): Promise<SqlJsStatic> {
  if (sqlModule) {
    return sqlModule;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('sql.js') as { default?: typeof import('sql.js').default };
  const initSqlJs = (mod.default ?? mod) as typeof import('sql.js').default;
  const distDir = path.join(extensionUri.fsPath, 'node_modules', 'sql.js', 'dist');
  sqlModule = await initSqlJs({
    locateFile: (file: string) => path.join(distDir, file),
  });
  return sqlModule;
}
