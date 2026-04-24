import * as vscode from 'vscode';
import type {
  YouGileColumn,
  YouGileLiveTimer,
  YouGileStringSticker,
  YouGileTask,
  YouGileTaskTimeStats,
  YouGileTimeStatsDebug,
  YouGileUser,
} from '../integrations/yougileClient';
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

function formatIsoDateTime(value?: string): string {
  if (!value) {
    return '—';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleString();
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
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
  columns: YouGileColumn[],
  stickers: YouGileStringSticker[],
  taskTimeStats?: YouGileTaskTimeStats,
  liveTimer?: YouGileLiveTimer,
  timeDebug?: YouGileTimeStatsDebug
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'yougileTaskDetails',
    task.title,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const usersById = new Map(users.map((user) => [user.id, user]));
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const stickersById = new Map(stickers.map((sticker) => [sticker.id, sticker]));
  panel.webview.html = buildHtml(
    task,
    usersById,
    columnsById,
    stickersById,
    panel.webview.cspSource,
    taskTimeStats,
    liveTimer,
    timeDebug
  );
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

function renderStickersSection(
  stickers: unknown,
  stickersById: Map<string, YouGileStringSticker>
): string {
  const normalized =
    stickers && typeof stickers === 'object' && !Array.isArray(stickers)
      ? (stickers as Record<string, unknown>)
      : null;

  if (!normalized || Object.keys(normalized).length === 0) {
    return `
      <section class="card">
        <h2>${escapeHtml(t('yougile.detail.stickers'))}</h2>
        <div class="empty">${escapeHtml(t('yougile.detail.emptyStickers'))}</div>
      </section>
    `;
  }

  const rows = Object.entries(normalized)
    .map(([stickerId, value]) => {
      const stickerDef = stickersById.get(stickerId);
      const stickerIcon = stickerDef?.icon ?? '🏷';
      const stickerTitle = stickerDef?.title ?? t('yougile.detail.unknownSticker');
      const stateValue =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : undefined;
      const stateDef = stateValue
        ? stickerDef?.states.find((state) => state.id === stateValue)
        : undefined;
      const renderedValue =
        stateDef?.title ??
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : toPrettyJson(value));
      const hoverHint = stateDef?.hint ?? renderedValue;
      return `
        <div class="meta-item">
          <div class="meta-label">${escapeHtml(t('yougile.detail.sticker'))}</div>
          <div class="meta-value sticker-head">
            <span class="sticker-icon" title="${escapeHtml(stickerTitle)}">${escapeHtml(stickerIcon)}</span>
            <span>${escapeHtml(stickerTitle)}</span>
          </div>
          <div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.stickerValue'))}</div>
          <div class="meta-value" title="${escapeHtml(hoverHint)}">${escapeHtml(renderedValue)}</div>
        </div>
      `;
    })
    .join('');

  return `
    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.stickers'))}</h2>
      <div class="meta-grid">${rows}</div>
    </section>
  `;
}

function renderTimeTrackingSection(timeTracking: unknown): string {
  const value =
    timeTracking && typeof timeTracking === 'object' && !Array.isArray(timeTracking)
      ? (timeTracking as Record<string, unknown>)
      : null;
  if (!value) {
    return `
      <section class="card">
        <h2>${escapeHtml(t('yougile.detail.timeTracking'))}</h2>
        <div class="empty">${escapeHtml(t('yougile.detail.emptyTimeTracking'))}</div>
      </section>
    `;
  }

  const plan = typeof value.plan === 'number' ? value.plan : undefined;
  const work = typeof value.work === 'number' ? value.work : undefined;
  const delta =
    typeof plan === 'number' && typeof work === 'number' ? work - plan : undefined;

  return `
    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.timeTracking'))}</h2>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">${escapeHtml(t('yougile.detail.timeTrackingPlan'))}</div>
          <div class="meta-value">${escapeHtml(plan !== undefined ? `${plan}h` : '—')}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">${escapeHtml(t('yougile.detail.timeTrackingWork'))}</div>
          <div class="meta-value">${escapeHtml(work !== undefined ? `${work}h` : '—')}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">${escapeHtml(t('yougile.detail.timeTrackingDelta'))}</div>
          <div class="meta-value">${escapeHtml(delta !== undefined ? `${delta >= 0 ? '+' : ''}${delta}h` : '—')}</div>
        </div>
      </div>
    </section>
  `;
}

function renderActualTimeSection(
  usersById: Map<string, YouGileUser>,
  taskTimeStats?: YouGileTaskTimeStats,
  liveTimer?: YouGileLiveTimer
): string {
  if (!taskTimeStats && !liveTimer) {
    return `
      <section class="card">
        <h2>${escapeHtml(t('yougile.detail.actualTime'))}</h2>
        <div class="empty">${escapeHtml(t('yougile.detail.emptyActualTime'))}</div>
      </section>
    `;
  }

  const perUserRows = taskTimeStats
    ? Object.entries(taskTimeStats.users)
        .map(([userId, stats]) => {
          const label = resolveAssigneeLabel(userId, usersById);
          const records = stats.records
            .map(
              (record) => `
              <div class="record-row">
                <span>${escapeHtml(formatIsoDateTime(record.date))}</span>
                <span>${escapeHtml(formatDuration(record.duration))}</span>
              </div>
            `
            )
            .join('');
          return `
            <div class="meta-item">
              <div class="meta-label">${escapeHtml(t('yougile.detail.timeUser'))}</div>
              <div class="meta-value">${escapeHtml(label)}</div>
              <div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.timeTotal'))}</div>
              <div class="meta-value">${escapeHtml(formatDuration(stats.totalSpentTime))}</div>
              <div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.timeRecords'))}</div>
              ${records || `<div class="empty">${escapeHtml(t('yougile.detail.emptyTimeRecords'))}</div>`}
            </div>
          `;
        })
        .join('')
    : '';

  const liveTimerLabel = liveTimer
    ? `
      <div class="meta-item">
        <div class="meta-label">${escapeHtml(t('yougile.detail.liveTimer'))}</div>
        <div class="meta-value">${escapeHtml(resolveAssigneeLabel(liveTimer.userId, usersById))}</div>
        <div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.liveTimerStart'))}</div>
        <div class="meta-value">${escapeHtml(formatIsoDateTime(liveTimer.startedAt))}</div>
        ${
          typeof liveTimer.duration === 'number'
            ? `<div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.liveTimerDuration'))}</div>
               <div class="meta-value">${escapeHtml(formatDuration(liveTimer.duration))}</div>`
            : ''
        }
      </div>
    `
    : '';

  return `
    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.actualTime'))}</h2>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">${escapeHtml(t('yougile.detail.timeTotal'))}</div>
          <div class="meta-value">${escapeHtml(formatDuration(taskTimeStats?.totalSpentTime ?? 0))}</div>
        </div>
        ${liveTimerLabel}
        ${perUserRows}
      </div>
    </section>
  `;
}

function renderTimeTrackingDebugSection(debug?: YouGileTimeStatsDebug): string {
  if (!debug) {
    return '';
  }
  const requestPayload = debug.requestPayload ? toPrettyJson(debug.requestPayload) : '';
  const statusText = debug.skipped
    ? `${t('yougile.detail.debugStatusSkipped')}${debug.reason ? `: ${debug.reason}` : ''}`
    : `${t('yougile.detail.debugStatusSent')}${debug.responseResult ? ` (${debug.responseResult})` : ''}`;
  return `
    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.timeDebug'))}</h2>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">${escapeHtml(t('yougile.detail.debugStatus'))}</div>
          <div class="meta-value">${escapeHtml(statusText)}</div>
          <div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.debugEndpoint'))}</div>
          <div class="meta-value">${escapeHtml(debug.requestUrl)}</div>
          ${
            debug.error
              ? `<div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.debugError'))}</div>
                 <div class="meta-value debug-error">${escapeHtml(debug.error)}</div>`
              : ''
          }
        </div>
      </div>
      ${
        requestPayload
          ? `<div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.debugRequestBody'))}</div>
             <pre>${escapeHtml(requestPayload)}</pre>`
          : ''
      }
    </section>
  `;
}

function buildHtml(
  task: YouGileTask,
  usersById: Map<string, YouGileUser>,
  columnsById: Map<string, YouGileColumn>,
  stickersById: Map<string, YouGileStringSticker>,
  cspSource: string,
  taskTimeStats?: YouGileTaskTimeStats,
  liveTimer?: YouGileLiveTimer,
  timeDebug?: YouGileTimeStatsDebug
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
    .sticker-head { display: flex; align-items: center; gap: 8px; }
    .sticker-icon { font-size: 1.15rem; line-height: 1; }
    .record-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px dashed var(--vscode-widget-border, transparent); }
    .record-row:last-child { border-bottom: 0; }
    .debug-error { color: var(--vscode-errorForeground); }
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

    ${renderStickersSection(stickers, stickersById)}
    ${renderJsonSection(t('yougile.detail.deadline'), deadline, t('yougile.detail.emptyDeadline'))}
    ${renderTimeTrackingSection(timeTracking)}
    ${renderActualTimeSection(usersById, taskTimeStats, liveTimer)}
    ${renderTimeTrackingDebugSection(timeDebug)}
    ${renderJsonSection(t('yougile.detail.checklists'), checklists, t('yougile.detail.emptyChecklists'))}
    ${showRawPayload ? renderJsonSection(t('yougile.detail.raw'), task.raw, t('yougile.detail.emptyRaw')) : ''}
  </div>
</body>
</html>`;
}
