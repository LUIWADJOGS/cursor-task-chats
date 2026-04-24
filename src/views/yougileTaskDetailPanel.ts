import * as vscode from 'vscode';
import type { YouGileColumn, YouGileTask, YouGileUser } from '../integrations/yougileClient';
import { t } from '../i18n';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(value: unknown): string {
  if (typeof value !== 'number') {
    return '—';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value);
  }
  return d.toLocaleString();
}

function toPrettyJson(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sanitizeHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/\son\w+=\S+/gi, '')
    .replace(/javascript:/gi, '');
}

function resolveAssigneeLabel(id: string, usersById: Map<string, YouGileUser>): string {
  const user = usersById.get(id);
  if (!user) {
    return id;
  }
  return user.realName ?? user.name ?? user.email ?? id;
}

function getStatusLabel(task: YouGileTask): string {
  if (task.archived) {
    return t('yougile.taskDescription.archived');
  }
  if (task.completed) {
    return t('yougile.taskDescription.done');
  }
  return t('yougile.taskDescription.open');
}

export async function openYouGileTaskDetailPanel(
  task: YouGileTask,
  users: YouGileUser[],
  columns: YouGileColumn[]
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'yougileTaskDetails',
    task.title,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const usersById = new Map(users.map((user) => [user.id, user]));
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  panel.webview.html = buildHtml(task, usersById, columnsById, panel.webview.cspSource);
}

function buildMetaRows(
  task: YouGileTask,
  usersById: Map<string, YouGileUser>,
  columnsById: Map<string, YouGileColumn>
): string {
  const raw = task.raw;
  const createdBy = typeof raw.createdBy === 'string' ? resolveAssigneeLabel(raw.createdBy, usersById) : '—';
  const assignees = task.assigneeIds.length
    ? task.assigneeIds.map((id) => resolveAssigneeLabel(id, usersById)).join(', ')
    : '—';
  const columnName = task.columnId ? (columnsById.get(task.columnId)?.title ?? t('yougile.detail.unknownColumn')) : '—';

  const rows: Array<{ label: string; value: string }> = [
    { label: t('yougile.detail.status'), value: getStatusLabel(task) },
    { label: t('yougile.detail.column'), value: columnName },
    { label: t('yougile.detail.createdBy'), value: createdBy },
    { label: t('yougile.detail.assignees'), value: assignees },
    { label: t('yougile.detail.createdAt'), value: formatDateTime(raw.timestamp) },
    { label: t('yougile.detail.completedAt'), value: formatDateTime(raw.completedTimestamp) },
    { label: t('yougile.detail.archivedAt'), value: formatDateTime(raw.archivedTimestamp) },
  ];

  return rows
    .map(
      (row) => `
      <div class="meta-item">
        <div class="meta-label">${escapeHtml(row.label)}</div>
        <div class="meta-value">${escapeHtml(row.value)}</div>
      </div>
    `
    )
    .join('');
}

function renderJsonSection(title: string, value: unknown, emptyText: string): string {
  const pretty = toPrettyJson(value);
  return `
    <section class="card">
      <h2>${escapeHtml(title)}</h2>
      ${
        pretty
          ? `<pre>${escapeHtml(pretty)}</pre>`
          : `<div class="empty">${escapeHtml(emptyText)}</div>`
      }
    </section>
  `;
}

function buildHtml(
  task: YouGileTask,
  usersById: Map<string, YouGileUser>,
  columnsById: Map<string, YouGileColumn>,
  cspSource: string
): string {
  const showRawPayload = vscode.workspace
    .getConfiguration('cursorTaskChats')
    .get<boolean>('yougile.showRawPayloadInDetails') ?? true;
  const description = task.description?.trim() ?? '';
  const descriptionHtml = description ? sanitizeHtml(description) : '';
  const stickers = (task.raw as Record<string, unknown>).stickers;
  const deadline = (task.raw as Record<string, unknown>).deadline;
  const checklists = (task.raw as Record<string, unknown>).checklists;
  const timeTracking = (task.raw as Record<string, unknown>).timeTracking;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; margin: 0; }
    .layout { display: grid; gap: 14px; max-width: 960px; margin: 0 auto; }
    .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border, transparent); border-radius: 10px; padding: 14px; }
    h1 { margin: 0 0 6px; font-size: 1.3rem; }
    h2 { margin: 0 0 10px; font-size: 1rem; }
    .muted { color: var(--vscode-descriptionForeground); }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .meta-item { background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 10px; }
    .meta-label { font-size: .78rem; color: var(--vscode-descriptionForeground); margin-bottom: 4px; text-transform: uppercase; }
    .meta-value { word-break: break-word; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 10px; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .description-html { background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 10px; }
    .description-html :is(p, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote) { margin-top: 0; }
  </style>
</head>
<body>
  <div class="layout">
    <section class="card">
      <h1>${escapeHtml(task.title)}</h1>
      <div class="muted">${escapeHtml(t('yougile.detail.subtitle'))}</div>
    </section>

    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.mainInfo'))}</h2>
      <div class="meta-grid">${buildMetaRows(task, usersById, columnsById)}</div>
    </section>

    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.description'))}</h2>
      ${
        descriptionHtml
          ? `<div class="description-html">${descriptionHtml}</div>`
          : `<div class="empty">${escapeHtml(t('yougile.detail.emptyDescription'))}</div>`
      }
    </section>

    ${renderJsonSection(t('yougile.detail.stickers'), stickers, t('yougile.detail.emptyStickers'))}
    ${renderJsonSection(t('yougile.detail.deadline'), deadline, t('yougile.detail.emptyDeadline'))}
    ${renderJsonSection(t('yougile.detail.timeTracking'), timeTracking, t('yougile.detail.emptyTimeTracking'))}
    ${renderJsonSection(t('yougile.detail.checklists'), checklists, t('yougile.detail.emptyChecklists'))}
    ${showRawPayload ? renderJsonSection(t('yougile.detail.raw'), task.raw, t('yougile.detail.emptyRaw')) : ''}
  </div>
</body>
</html>`;
}
