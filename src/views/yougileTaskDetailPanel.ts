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

function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

function hoursToSeconds(hours: number): number {
  return Math.round(hours * 3600);
}

function formatSignedDuration(seconds: number): string {
  const sign = seconds > 0 ? '+' : seconds < 0 ? '-' : '';
  return `${sign}${formatDuration(Math.abs(seconds))}`;
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readColor(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && /^#?[0-9a-f]{3,8}$/i.test(value.trim())) {
      return value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    }
  }
  return undefined;
}

function renderBadge(icon: string, label: string, value: string, options?: { color?: string; title?: string }): string {
  const style = options?.color ? ` style="--badge-accent:${escapeHtml(options.color)};"` : '';
  const title = options?.title ? ` title="${escapeHtml(options.title)}"` : '';
  return `
    <div class="info-badge"${style}${title}>
      <span class="info-icon">${escapeHtml(icon)}</span>
      <span class="info-text">
        <span class="info-label">${escapeHtml(label)}</span>
        <span class="info-value">${escapeHtml(value)}</span>
      </span>
    </div>
  `;
}

function formatDeadline(value: unknown): string | undefined {
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = typeof value === 'number' ? new Date(value) : new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString();
    }
    return String(value);
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  return formatDeadline(record.date ?? record.deadline ?? record.timestamp);
}

function renderStickerBadges(stickers: unknown, stickersById: Map<string, YouGileStringSticker>): string {
  const normalized = asRecord(stickers);
  if (!normalized || Object.keys(normalized).length === 0) {
    return '';
  }
  return Object.entries(normalized)
    .map(([stickerId, value]) => {
      const stickerDef = stickersById.get(stickerId);
      const stateValue =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : undefined;
      const stateDef = stateValue
        ? stickerDef?.states.find((state) => state.id === stateValue)
        : undefined;
      const title = stickerDef?.title ?? t('yougile.detail.unknownSticker');
      const renderedValue = stateDef?.title ?? (stateValue ?? toPrettyJson(value));
      const icon = stickerDef?.icon ?? '🏷';
      return renderBadge(icon, title, renderedValue, {
        color: readColor(stickerDef?.raw.color, stickerDef?.raw.backgroundColor),
        title: stateDef?.hint ?? renderedValue,
      });
    })
    .join('');
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
  columnsById: Map<string, YouGileColumn>,
  stickersById: Map<string, YouGileStringSticker>,
  taskTimeStats?: YouGileTaskTimeStats,
  liveTimer?: YouGileLiveTimer
): string {
  const raw = task.raw;
  const createdBy = typeof raw.createdBy === 'string' ? resolveAssigneeLabel(raw.createdBy, usersById) : '—';
  const assignees = task.assigneeIds.length
    ? task.assigneeIds.map((id) => resolveAssigneeLabel(id, usersById)).join(', ')
    : '—';
  const column = task.columnId ? columnsById.get(task.columnId) : undefined;
  const columnName = task.columnId ? (column?.title ?? t('yougile.detail.unknownColumn')) : '—';
  const isClosed = Boolean(task.completed || task.archived);
  const statusColor = isClosed ? '#f85149' : '#2ea043';
  const statusLabel = isClosed ? t('yougile.taskDescription.done') : t('yougile.taskDescription.open');
  const columnColor = readColor(column?.raw.color, column?.raw.backgroundColor, column?.raw.hexColor) ?? '#2f81f7';
  const timeTracking = asRecord(raw.timeTracking);
  const deadline = formatDeadline(raw.deadline);
  const stickerBadges = renderStickerBadges(raw.stickers, stickersById);
  const plan = typeof timeTracking?.plan === 'number' ? timeTracking.plan : undefined;
  const workFromTimeTracking = typeof timeTracking?.work === 'number' ? timeTracking.work : undefined;
  const fact = typeof taskTimeStats?.totalSpentTime === 'number'
    ? secondsToHours(taskTimeStats.totalSpentTime)
    : workFromTimeTracking;
  const factSeconds = typeof taskTimeStats?.totalSpentTime === 'number'
    ? taskTimeStats.totalSpentTime
    : typeof fact === 'number'
      ? hoursToSeconds(fact)
      : undefined;
  const planSeconds = typeof plan === 'number' ? hoursToSeconds(plan) : undefined;
  const deltaSeconds = typeof factSeconds === 'number' && typeof planSeconds === 'number'
    ? factSeconds - planSeconds
    : undefined;
  const factTitle = taskTimeStats
    ? Object.entries(taskTimeStats.users)
        .map(([userId, stats]) => {
          const records = stats.records
            .map((record) => `${formatIsoDateTime(record.date)}: ${formatDuration(record.duration)}`)
            .join('\n');
          return `${resolveAssigneeLabel(userId, usersById)}: ${formatDuration(stats.totalSpentTime)}${records ? `\n${records}` : ''}`;
        })
        .join('\n\n')
    : undefined;
  const factValue = factSeconds !== undefined ? formatDuration(factSeconds) : '—';
  const planValue = planSeconds !== undefined ? formatDuration(planSeconds) : '—';
  const deltaValue = deltaSeconds !== undefined ? formatSignedDuration(deltaSeconds) : '—';
  const factClass = deltaSeconds === undefined || deltaSeconds <= 0 ? 'good' : 'bad';
  return `
    <div class="task-summary" style="--column-color:${escapeHtml(columnColor)};">
      <div class="task-summary-head">
        <div class="task-title-line">
          <span class="status-dot" style="--status-color:${escapeHtml(statusColor)};" title="${escapeHtml(statusLabel)}"></span>
          <span class="task-title-text">${escapeHtml(task.title)}</span>
          <span class="task-column-name">(${escapeHtml(columnName)})</span>
        </div>
      </div>
      <div class="task-summary-row">
        <div class="task-people">
          <span class="mini-label">${escapeHtml(t('yougile.detail.createdBy'))}</span>
          <span>${escapeHtml(createdBy)}</span>
          <span class="slash">/</span>
          <span class="mini-label">${escapeHtml(t('yougile.detail.assignees'))}</span>
          <span>${escapeHtml(assignees)}</span>
        </div>
        <div class="task-time" title="${escapeHtml(factTitle ?? '')}">
          <span class="fact ${factClass}">${escapeHtml(factValue)}</span>
          <span class="slash">/</span>
          <span>${escapeHtml(planValue)}</span>
          <span class="slash">/</span>
          <span class="${factClass}">${escapeHtml(deltaValue)}</span>
        </div>
      </div>
      <div class="task-extra-line">
        ${deadline ? `<span class="extra-pill">⏰ ${escapeHtml(deadline)}</span>` : ''}
        ${liveTimer ? `<span class="extra-pill live">▶ ${escapeHtml(resolveAssigneeLabel(liveTimer.userId, usersById))}</span>` : ''}
        ${stickerBadges}
      </div>
    </div>
  `;
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

function renderTimeTrackingSection(timeTracking: unknown, taskTimeStats?: YouGileTaskTimeStats): string {
  const value =
    timeTracking && typeof timeTracking === 'object' && !Array.isArray(timeTracking)
      ? (timeTracking as Record<string, unknown>)
      : null;
  if (!value && !taskTimeStats) {
    return `
      <section class="card">
        <h2>${escapeHtml(t('yougile.detail.timeTracking'))}</h2>
        <div class="empty">${escapeHtml(t('yougile.detail.emptyTimeTracking'))}</div>
      </section>
    `;
  }

  const plan = typeof value?.plan === 'number' ? value.plan : undefined;
  const workFromTimeTracking = typeof value?.work === 'number' ? value.work : undefined;
  const workFromActual = typeof taskTimeStats?.totalSpentTime === 'number'
    ? secondsToHours(taskTimeStats.totalSpentTime)
    : undefined;
  // Fact time from extension endpoint is more reliable than task.timeTracking.work.
  const work = workFromActual ?? workFromTimeTracking;
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
  const responseBody = debug.responseBody !== undefined ? toPrettyJson(debug.responseBody) : '';
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
      ${
        responseBody
          ? `<div class="meta-label" style="margin-top:8px;">${escapeHtml(t('yougile.detail.debugResponseBody'))}</div>
             <pre>${escapeHtml(responseBody)}</pre>`
          : ''
      }
    </section>
  `;
}

function renderChecklistsSection(checklists: unknown): string {
  const list = Array.isArray(checklists) ? checklists : [];
  if (list.length === 0) {
    return `
      <section class="card">
        <h2>${escapeHtml(t('yougile.detail.checklists'))}</h2>
        <div class="empty">${escapeHtml(t('yougile.detail.emptyChecklists'))}</div>
      </section>
    `;
  }
  const renderedLists = list
    .map((rawList, index) => {
      const checklist = asRecord(rawList);
      const title = typeof checklist?.title === 'string' && checklist.title.trim()
        ? checklist.title.trim()
        : `${t('yougile.detail.checklist')} ${index + 1}`;
      const items = Array.isArray(checklist?.items) ? checklist.items : [];
      const renderedItems = items
        .map((rawItem) => {
          const item = asRecord(rawItem);
          const text = typeof item?.title === 'string' ? item.title : '';
          const isCompleted = item?.isCompleted === true;
          return `
            <li class="checklist-item ${isCompleted ? 'done' : ''}">
              <span class="checkbox">${isCompleted ? '☑' : '☐'}</span>
              <span>${escapeHtml(text)}</span>
            </li>
          `;
        })
        .join('');
      return `
        <div class="checklist-block">
          <div class="checklist-title">${escapeHtml(title)}</div>
          ${
            renderedItems
              ? `<ul class="checklist-items">${renderedItems}</ul>`
              : `<div class="empty">${escapeHtml(t('yougile.detail.emptyChecklistItems'))}</div>`
          }
        </div>
      `;
    })
    .join('');
  return `
    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.checklists'))}</h2>
      <div class="checklists">${renderedLists}</div>
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
  const config = vscode.workspace.getConfiguration('cursorTaskChats');
  const showDebugPanels =
    config.get<boolean>('yougile.showDebugPanels') ??
    config.get<boolean>('yougile.showRawPayloadInDetails') ??
    false;
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
    .title-card { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .created-at { color: var(--vscode-descriptionForeground); white-space: nowrap; font-size: .9rem; margin-top: 2px; }
    .task-summary { border: 1px solid color-mix(in srgb, var(--column-color) 55%, transparent); border-left: 6px solid var(--column-color); background: color-mix(in srgb, var(--column-color) 12%, var(--vscode-sideBar-background)); border-radius: 10px; padding: 10px 12px; display: grid; gap: 8px; }
    .task-title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .status-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--status-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-color) 20%, transparent); flex: 0 0 auto; }
    .task-title-text { font-weight: 700; font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-column-name { color: var(--vscode-descriptionForeground); white-space: nowrap; }
    .task-summary-row { display: flex; justify-content: space-between; gap: 14px; align-items: center; }
    .task-people { min-width: 0; display: flex; flex-wrap: wrap; gap: 5px; align-items: baseline; }
    .mini-label { color: var(--vscode-descriptionForeground); font-size: .75rem; text-transform: uppercase; }
    .slash { color: var(--vscode-descriptionForeground); }
    .task-time { white-space: nowrap; font-weight: 700; }
    .good { color: #2ea043; }
    .bad { color: #f85149; }
    .task-extra-line { display: flex; flex-wrap: wrap; gap: 6px; }
    .extra-pill { background: var(--vscode-editorWidget-background, rgba(127,127,127,.12)); border-radius: 999px; padding: 4px 8px; font-size: .85rem; }
    .extra-pill.live { color: #2ea043; }
    .compact-info-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
    .info-group { background: var(--vscode-editorWidget-background, rgba(127,127,127,.06)); border-radius: 10px; padding: 8px; }
    .info-group-title { color: var(--vscode-descriptionForeground); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 6px 2px; }
    .compact-info { display: flex; flex-wrap: wrap; gap: 6px; }
    .info-badge { --badge-accent: var(--vscode-textLink-foreground); display: inline-flex; align-items: center; gap: 6px; max-width: 100%; border: 1px solid color-mix(in srgb, var(--badge-accent) 45%, transparent); border-left: 3px solid var(--badge-accent); background: color-mix(in srgb, var(--badge-accent) 10%, var(--vscode-editorWidget-background, rgba(127,127,127,.08))); border-radius: 8px; padding: 5px 7px; }
    .info-icon { color: var(--badge-accent); font-size: .95rem; line-height: 1; }
    .info-text { min-width: 0; display: grid; gap: 1px; }
    .info-label { font-size: .62rem; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: .02em; }
    .info-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; font-size: .9rem; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 10px; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .description-html { background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 14px; font-size: 1.02rem; line-height: 1.65; }
    .description-html :is(p, ul, ol, blockquote) { margin-top: 0; margin-bottom: 12px; }
    .description-html li { margin: 6px 0; }
    .description-html :is(h1, h2, h3, h4, h5, h6) { margin-top: 14px; margin-bottom: 10px; line-height: 1.3; }
    .sticker-head { display: flex; align-items: center; gap: 8px; }
    .sticker-icon { font-size: 1.15rem; line-height: 1; }
    .record-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px dashed var(--vscode-widget-border, transparent); }
    .record-row:last-child { border-bottom: 0; }
    .debug-error { color: var(--vscode-errorForeground); }
    .checklists { display: grid; gap: 12px; }
    .checklist-block { background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 10px; }
    .checklist-title { font-weight: 600; margin-bottom: 8px; }
    .checklist-items { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
    .checklist-item { display: flex; align-items: flex-start; gap: 8px; line-height: 1.45; }
    .checklist-item.done { color: var(--vscode-descriptionForeground); text-decoration: line-through; }
    .checkbox { color: var(--vscode-textLink-foreground); flex: 0 0 auto; }
  </style>
</head>
<body>
  <div class="layout">
    <section class="card">
      <div class="title-card">
        <div>
          <h1>${escapeHtml(task.title)}</h1>
          <div class="muted">${escapeHtml(t('yougile.detail.subtitle'))}</div>
        </div>
        <div class="created-at">＋ ${escapeHtml(formatDateTime((task.raw as Record<string, unknown>).timestamp))}</div>
      </div>
    </section>

    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.mainInfo'))}</h2>
      ${buildMetaRows(task, usersById, columnsById, stickersById, taskTimeStats, liveTimer)}
    </section>

    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.description'))}</h2>
      ${
        descriptionHtml
          ? `<div class="description-html">${descriptionHtml}</div>`
          : `<div class="empty">${escapeHtml(t('yougile.detail.emptyDescription'))}</div>`
      }
    </section>

    ${showDebugPanels ? renderStickersSection(stickers, stickersById) : ''}
    ${showDebugPanels ? renderJsonSection(t('yougile.detail.deadline'), deadline, t('yougile.detail.emptyDeadline')) : ''}
    ${showDebugPanels ? renderTimeTrackingSection(timeTracking, taskTimeStats) : ''}
    ${showDebugPanels ? renderActualTimeSection(usersById, taskTimeStats, liveTimer) : ''}
    ${showDebugPanels ? renderTimeTrackingDebugSection(timeDebug) : ''}
    ${renderChecklistsSection(checklists)}
    ${showDebugPanels ? renderJsonSection(t('yougile.detail.raw'), task.raw, t('yougile.detail.emptyRaw')) : ''}
  </div>
</body>
</html>`;
}
