import * as vscode from 'vscode';
import {
  addYouGileSpentTimeRecord,
  deleteYouGileSpentTimeRecord,
  editYouGileSpentTimeRecord,
  getYouGileTaskById,
  getYouGileTimeStatsBatch,
  getYouGileExtensionConfig,
  getYouGileIntegrationOptions,
} from '../integrations/yougileClient';
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

type YouGileTaskDetailPanelOptions = {
  task: YouGileTask;
  users: YouGileUser[];
  columns: YouGileColumn[];
  stickers: YouGileStringSticker[];
  taskTimeStats?: YouGileTaskTimeStats;
  liveTimer?: YouGileLiveTimer;
  timeDebug?: YouGileTimeStatsDebug;
  boardId?: string;
  boardTaskIds?: string[];
  companyId?: string;
  onUpdated?: () => void;
};

type EditableTimeRecord = {
  userId: string;
  recordId: string;
  date: string;
  duration: number;
  revision?: string;
};

/** Webview serializes NaN as null; Number(null) is 0 — read duration without that pitfall. */
function readPostedDuration(message: Record<string, unknown>): number {
  const v = message.duration;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) {
      return NaN;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function readPostedUserId(message: Record<string, unknown>): string {
  const v = message.userId;
  if (typeof v === 'string') {
    return v.trim();
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v).trim();
  }
  return '';
}

function readPostedDate(message: Record<string, unknown>): string {
  const v = message.date;
  if (typeof v === 'string') {
    return v.trim();
  }
  return '';
}

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

// YouGile may return numeric palette IDs (for example color: 16) instead of hex strings.
const YOUGILE_COLOR_PALETTE: string[] = [
  '#f85149',
  '#ff7b72',
  '#d29922',
  '#e3b341',
  '#3fb950',
  '#2ea043',
  '#56d364',
  '#1f6feb',
  '#58a6ff',
  '#a371f7',
  '#bc8cff',
  '#db61a2',
  '#f778ba',
  '#8b949e',
  '#6e7681',
  '#ffa657',
];

function resolveYouGilePaletteColor(value: number): string | undefined {
  if (!Number.isInteger(value)) {
    return undefined;
  }
  // API may use either 0-based [0..15] or 1-based [1..16] palette IDs.
  if (value >= 0 && value < YOUGILE_COLOR_PALETTE.length) {
    return YOUGILE_COLOR_PALETTE[value];
  }
  if (value >= 1 && value <= YOUGILE_COLOR_PALETTE.length) {
    return YOUGILE_COLOR_PALETTE[value - 1];
  }
  return undefined;
}

function normalizeHexColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^#?[0-9a-f]{3,8}$/i.test(trimmed)) {
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }
  const withPrefix = /^0x([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (withPrefix) {
    return `#${withPrefix[1]}`;
  }
  return undefined;
}

function normalizeRgbRecord(value: Record<string, unknown>): string | undefined {
  const red = typeof value.r === 'number' ? value.r : typeof value.red === 'number' ? value.red : undefined;
  const green = typeof value.g === 'number' ? value.g : typeof value.green === 'number' ? value.green : undefined;
  const blue = typeof value.b === 'number' ? value.b : typeof value.blue === 'number' ? value.blue : undefined;
  if (red === undefined || green === undefined || blue === undefined) {
    return undefined;
  }
  const valid = [red, green, blue].every((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 255);
  if (!valid) {
    return undefined;
  }
  return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
}

function normalizeColorValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const hex = normalizeHexColor(value);
    if (hex) {
      return hex;
    }
    const trimmed = value.trim();
    if (/^rgba?\(/i.test(trimmed) || /^hsla?\(/i.test(trimmed) || /^var\(/i.test(trimmed)) {
      return trimmed;
    }
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const paletteColor = resolveYouGilePaletteColor(value);
    if (paletteColor) {
      return paletteColor;
    }
    if (value >= 0 && value <= 0xffffff) {
      return `#${Math.round(value).toString(16).padStart(6, '0')}`;
    }
  }
  const record = asRecord(value);
  if (record) {
    return normalizeRgbRecord(record);
  }
  return undefined;
}

function readColor(...values: unknown[]): string | undefined {
  const queue: unknown[] = [...values];
  const visited = new Set<Record<string, unknown>>();
  while (queue.length) {
    const value = queue.shift();
    const direct = normalizeColorValue(value);
    if (direct) {
      return direct;
    }
    const record = asRecord(value);
    if (!record || visited.has(record)) {
      continue;
    }
    visited.add(record);
    const nestedCandidates = [
      record.color,
      record.backgroundColor,
      record.hexColor,
      record.bgColor,
      record.fillColor,
      record.strokeColor,
      record.value,
      record.style,
      record.background,
      record.fill,
      record.stroke,
      record.palette,
      record.theme,
    ];
    for (const candidate of nestedCandidates) {
      if (candidate !== undefined) {
        queue.push(candidate);
      }
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

export async function openYouGileTaskDetailPanel(options: YouGileTaskDetailPanelOptions): Promise<void> {
  let {
    task,
    users,
    columns,
    stickers,
    taskTimeStats,
    liveTimer,
    timeDebug,
    boardId,
    boardTaskIds,
    companyId,
    onUpdated,
  } = options;
  const panel = vscode.window.createWebviewPanel(
    'yougileTaskDetails',
    task.title,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const render = (): void => {
    const usersById = new Map(users.map((user) => [user.id, user]));
    const columnsById = new Map(columns.map((column) => [column.id, column]));
    const stickersById = new Map(stickers.map((sticker) => [sticker.id, sticker]));
    panel.title = task.title;
    panel.webview.html = buildHtml(
      task,
      usersById,
      columnsById,
      stickersById,
      panel.webview.cspSource,
      taskTimeStats,
      liveTimer,
      timeDebug,
      boardId,
      boardTaskIds
    );
  };

  const refreshTimeData = async (): Promise<void> => {
    if (!boardId) {
      return;
    }
    const refreshedTask = await getYouGileTaskById(task.id);
    if (refreshedTask) {
      task = refreshedTask;
    }
    const response = await getYouGileTimeStatsBatch(boardId, boardTaskIds ?? [task.id], {
      userId: getYouGileIntegrationOptions().assigneeId,
      companyId,
    });
    taskTimeStats = response.taskStats[task.id];
    liveTimer = response.liveTimers.find((timer) => timer.taskId === task.id);
    timeDebug = response.debug;
  };

  panel.webview.onDidReceiveMessage(async (message: Record<string, unknown>) => {
    const type = typeof message.type === 'string' ? message.type : '';
    if (
      type !== 'yougile.addTimeRecord' &&
      type !== 'yougile.editTimeRecord' &&
      type !== 'yougile.deleteTimeRecord'
    ) {
      return;
    }
    if (!boardId) {
      void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.missingBoard'));
      return;
    }
    const userId = readPostedUserId(message);
    const date = readPostedDate(message);
    const duration = readPostedDuration(message);
    try {
      if (type === 'yougile.addTimeRecord') {
        if (!userId) {
          void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.invalidUser'));
          return;
        }
        if (!date) {
          void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.invalidDate'));
          return;
        }
        if (!Number.isFinite(duration) || duration <= 0) {
          void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.invalidDuration'));
          return;
        }
        await addYouGileSpentTimeRecord({
          boardId,
          taskId: task.id,
          taskIds: boardTaskIds ?? [task.id],
          userId,
          date,
          duration,
          companyId,
        });
      } else if (type === 'yougile.editTimeRecord') {
        const recordId = typeof message.recordId === 'string' ? message.recordId.trim() : '';
        if (!recordId || !userId) {
          void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.invalidInput'));
          return;
        }
        if (!date) {
          void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.invalidDate'));
          return;
        }
        if (!Number.isFinite(duration) || duration <= 0) {
          void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.invalidDuration'));
          return;
        }
        const revision = typeof message.revision === 'string' ? message.revision.trim() : undefined;
        await editYouGileSpentTimeRecord({
          boardId,
          taskId: task.id,
          taskIds: boardTaskIds ?? [task.id],
          userId,
          recordId,
          date,
          duration,
          revision,
          companyId,
        });
      } else {
        const recordId = typeof message.recordId === 'string' ? message.recordId.trim() : '';
        if (!recordId || !userId) {
          void vscode.window.showErrorMessage(t('yougile.detail.timeEdit.invalidInput'));
          return;
        }
        await deleteYouGileSpentTimeRecord({
          boardId,
          taskId: task.id,
          taskIds: boardTaskIds ?? [task.id],
          userId,
          recordId,
          companyId,
        });
      }
      await refreshTimeData();
      onUpdated?.();
      render();
      void vscode.window.showInformationMessage(t('yougile.detail.timeEdit.saved'));
    } catch (error) {
      void vscode.window.showErrorMessage(
        t('yougile.detail.timeEdit.failed', {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

  render();
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
  const columnColor = readColor(column?.raw.color, column?.raw.backgroundColor, column?.raw.hexColor, column?.raw) ?? '#2f81f7';
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
  const createdAt = formatDateTime((raw as Record<string, unknown>).timestamp);
  return `
    <div class="task-summary" style="--column-color:${escapeHtml(columnColor)};">
      <div class="task-summary-head">
        <div class="task-title-line">
          <span class="status-dot" style="--status-color:${escapeHtml(statusColor)};" title="${escapeHtml(statusLabel)}"></span>
          <span class="task-title-text">${escapeHtml(task.title)}</span>
          <span class="task-column-name">(${escapeHtml(columnName)})</span>
        </div>
        <div class="created-at">＋ ${escapeHtml(createdAt)}</div>
      </div>
      <div class="task-summary-row">
        <div class="task-people">
          <span class="mini-label">${escapeHtml(t('yougile.detail.createdBy'))}</span>
          <span>${escapeHtml(createdBy)}</span>
          <span class="slash">/</span>
          <span class="mini-label">${escapeHtml(t('yougile.detail.assignees'))}</span>
          <span>${escapeHtml(assignees)}</span>
        </div>
        <button type="button" id="timeSummaryToggle" class="task-time" title="${escapeHtml(factTitle ?? '')}">
          <span class="fact ${factClass}">${escapeHtml(factValue)}</span>
          <span class="slash">/</span>
          <span>${escapeHtml(planValue)}</span>
          <span class="slash">/</span>
          <span class="${factClass}">${escapeHtml(deltaValue)}</span>
        </button>
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

function toInputDateTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const offsetMs = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function buildTimeEditUserOptions(
  task: YouGileTask,
  usersById: Map<string, YouGileUser>
): { id: string; label: string }[] {
  const entries = new Map<string, string>();
  for (const user of usersById.values()) {
    entries.set(user.id, user.realName ?? user.name ?? user.email ?? user.id);
  }
  const extId = getYouGileExtensionConfig().userId?.trim();
  if (extId) {
    entries.set(extId, entries.get(extId) ?? extId);
  }
  const filterAssignee = getYouGileIntegrationOptions().assigneeId?.trim();
  if (filterAssignee) {
    entries.set(filterAssignee, entries.get(filterAssignee) ?? filterAssignee);
  }
  for (const id of task.assigneeIds ?? []) {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (trimmed) {
      entries.set(trimmed, entries.get(trimmed) ?? resolveAssigneeLabel(trimmed, usersById));
    }
  }
  const raw = task.raw as Record<string, unknown> | undefined;
  const createdBy = typeof raw?.createdBy === 'string' ? raw.createdBy.trim() : '';
  if (createdBy) {
    entries.set(createdBy, entries.get(createdBy) ?? resolveAssigneeLabel(createdBy, usersById));
  }
  return [...entries.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

function formatDurationHoursMinutes(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function collectEditableRecords(taskTimeStats?: YouGileTaskTimeStats): EditableTimeRecord[] {
  if (!taskTimeStats) {
    return [];
  }
  const output: EditableTimeRecord[] = [];
  for (const [userId, stats] of Object.entries(taskTimeStats.users)) {
    for (const record of stats.records) {
      output.push({
        userId,
        recordId: record.id,
        date: record.date ?? '',
        duration: record.duration,
        revision: record.revision,
      });
    }
  }
  return output.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function renderTimeEditSection(
  task: YouGileTask,
  usersById: Map<string, YouGileUser>,
  taskTimeStats: YouGileTaskTimeStats | undefined,
  boardId: string | undefined
): string {
  const userOptions = buildTimeEditUserOptions(task, usersById);
  const defaultUserId =
    getYouGileExtensionConfig().userId?.trim() ||
    getYouGileIntegrationOptions().assigneeId?.trim() ||
    task.assigneeIds.find((id) => typeof id === 'string' && id.trim())?.trim() ||
    userOptions[0]?.id ||
    '';
  const records = collectEditableRecords(taskTimeStats);
  const recordRows = records
    .map((record) => {
      const userLabel = resolveAssigneeLabel(record.userId, usersById);
      return `
        <div class="record-row-edit" data-record-id="${escapeHtml(record.recordId)}" data-record-user-id="${escapeHtml(record.userId)}">
          <div class="record-view">
            <span class="record-date">${escapeHtml(formatIsoDateTime(record.date))}</span>
            <span class="record-user">${escapeHtml(userLabel)}</span>
            <span class="record-duration">${escapeHtml(formatDurationHoursMinutes(record.duration))}</span>
            <button type="button" class="icon-btn-min" title="${escapeHtml(t('yougile.detail.timeEdit.edit'))}" data-action="edit-record" data-record-id="${escapeHtml(record.recordId)}">✏️</button>
            <button type="button" class="icon-btn-min danger" title="${escapeHtml(t('yougile.detail.timeEdit.delete'))}" data-action="delete-record" data-delete-record-id="${escapeHtml(record.recordId)}" data-delete-user-id="${escapeHtml(record.userId)}">🗑</button>
          </div>
          <div class="record-inline-editor" hidden>
            <input type="datetime-local" class="edit-inline-date" ${boardId ? '' : 'disabled'} />
            <input type="text" class="edit-inline-duration" placeholder="hh:mm" ${boardId ? '' : 'disabled'} />
            <button type="button" class="icon-btn-min" data-action="save-inline-record" title="${escapeHtml(t('yougile.detail.timeEdit.saveEdit'))}">💾</button>
            <button type="button" class="icon-btn-min" data-action="cancel-inline-record" title="${escapeHtml(t('yougile.detail.timeEdit.cancel'))}">✖</button>
          </div>
        </div>
      `;
    })
    .join('');
  const recordsBlock = recordRows
    ? `<div class="records-edit-list" id="yougileRecordsEditList">${recordRows}</div>`
    : `<div class="records-edit-list empty" id="yougileRecordsEditList"><div class="empty">${escapeHtml(t('yougile.detail.emptyTimeRecords'))}</div></div>`;
  return `
    <section class="card time-edit-card is-collapsed" id="timeEditCard">
      <h2>${escapeHtml(t('yougile.detail.timeEdit.title'))}</h2>
      ${
        boardId
          ? ''
          : `<div class="empty">${escapeHtml(t('yougile.detail.timeEdit.missingBoard'))}</div>`
      }
      <div class="time-edit-grid ${boardId ? '' : 'is-disabled'}">
        <div class="meta-item">
          <div class="time-edit-head">
            <div class="meta-label">${escapeHtml(t('yougile.detail.timeEdit.records'))}</div>
            <button type="button" class="icon-btn-min" id="showAddTimeRowBtn" title="${escapeHtml(t('yougile.detail.timeEdit.add'))}" ${boardId ? '' : 'disabled'}>➕</button>
          </div>
          ${recordsBlock}
          <div id="addTimeRecordRow" class="time-row-editor" hidden>
            <select id="timeRecordUser" ${boardId ? '' : 'disabled'}>
              ${userOptions
                .map(
                  (entry) =>
                    `<option value="${escapeHtml(entry.id)}" ${entry.id === defaultUserId ? 'selected' : ''}>${escapeHtml(entry.label)}</option>`
                )
                .join('')}
            </select>
            <input type="datetime-local" id="timeRecordDate" value="${escapeHtml(toInputDateTime(new Date().toISOString()))}" ${boardId ? '' : 'disabled'} />
            <input type="text" id="timeRecordDuration" value="01:00" placeholder="hh:mm" ${boardId ? '' : 'disabled'} />
            <button type="button" class="icon-btn-min" id="addTimeRecordBtn" title="${escapeHtml(t('yougile.detail.timeEdit.add'))}" ${boardId ? '' : 'disabled'}>✅</button>
            <button type="button" class="icon-btn-min" id="cancelAddTimeRowBtn" title="${escapeHtml(t('yougile.detail.timeEdit.cancel'))}" ${boardId ? '' : 'disabled'}>✖</button>
          </div>
        </div>
      </div>
    </section>
    <script>
      const __timeRecords = ${serializeForScript(records)};
      const __defaultAddUserId = ${serializeForScript(defaultUserId)};
    </script>
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
  timeDebug?: YouGileTimeStatsDebug,
  boardId?: string,
  boardTaskIds?: string[]
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
  const currentColumn = task.columnId ? columnsById.get(task.columnId) : undefined;
  const columnDebugPayload = currentColumn
    ? {
        id: currentColumn.id,
        title: currentColumn.title,
        raw: currentColumn.raw,
      }
    : undefined;
  const columnDebugTitle = `${t('yougile.detail.column')} (${t('yougile.detail.raw')})`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; margin: 0; }
    .layout { display: grid; gap: 14px; max-width: 960px; margin: 0 auto; }
    .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border, transparent); border-radius: 10px; padding: 14px; }
    h1 { margin: 0 0 6px; font-size: 1.3rem; }
    h2 { margin: 0 0 10px; font-size: 1rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .meta-item { background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 10px; }
    .meta-label { font-size: .78rem; color: var(--vscode-descriptionForeground); margin-bottom: 4px; text-transform: uppercase; }
    .meta-value { word-break: break-word; }
    .task-summary { border: 1px solid color-mix(in srgb, var(--column-color) 55%, transparent); border-left: 6px solid var(--column-color); background: color-mix(in srgb, var(--column-color) 12%, var(--vscode-sideBar-background)); border-radius: 10px; padding: 10px 12px; display: grid; gap: 8px; }
    .task-summary-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
    .task-title-line { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
    .created-at { color: var(--vscode-descriptionForeground); white-space: nowrap; font-size: .9rem; flex: 0 0 auto; text-align: right; align-self: center; }
    .status-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--status-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-color) 20%, transparent); flex: 0 0 auto; }
    .task-title-text { font-weight: 700; font-size: 1.12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-column-name { color: var(--vscode-descriptionForeground); white-space: nowrap; }
    .task-summary-row { display: flex; justify-content: space-between; gap: 14px; align-items: center; }
    .task-people { min-width: 0; display: flex; flex-wrap: wrap; gap: 5px; align-items: baseline; }
    .mini-label { color: var(--vscode-descriptionForeground); font-size: .75rem; text-transform: uppercase; }
    .slash { color: var(--vscode-descriptionForeground); }
    .task-time { white-space: nowrap; font-weight: 700; border: 0; background: transparent; color: inherit; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
    .task-time:hover { background: var(--vscode-editorWidget-background, rgba(127,127,127,.12)); }
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
    .time-edit-card.is-collapsed .time-edit-grid { display: none; }
    .time-edit-grid { display:grid; grid-template-columns: 1fr; gap:10px; }
    .time-edit-grid.is-disabled { opacity: .7; pointer-events: none; }
    .time-edit-head { display:flex; align-items:center; justify-content: space-between; gap:8px; margin-bottom:8px; }
    .records-edit-list { display:grid; gap:6px; }
    .record-row-edit { padding: 6px 0; border-bottom: 1px dashed var(--vscode-widget-border, transparent); }
    .record-row-edit:last-child { border-bottom: 0; }
    .record-view { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto auto auto; gap:8px; align-items:center; }
    .record-inline-editor { margin-top: 6px; display: grid; grid-template-columns: minmax(0,1fr) 100px auto auto; gap: 6px; align-items: center; }
    .record-inline-editor[hidden] { display: none !important; margin-top: 0; }
    .icon-btn-min { border:1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent)); background: transparent; color: var(--vscode-foreground); border-radius:6px; padding:4px 6px; cursor:pointer; font: inherit; line-height: 1; }
    .icon-btn-min.danger { color: var(--vscode-errorForeground); border-color: color-mix(in srgb, var(--vscode-errorForeground) 35%, var(--vscode-widget-border, transparent)); }
    #addTimeRecordRow.time-row-editor { margin-top: 10px; }
    .time-row-editor { margin-top:6px; display:grid; grid-template-columns: 1fr minmax(0,1fr) 110px auto auto; gap:6px; align-items:center; }
    .time-row-editor input, .time-row-editor select { width:100%; box-sizing:border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; padding: 5px 6px; font: inherit; }
  </style>
</head>
<body>
  <div class="layout">
    <section class="card">
      ${buildMetaRows(task, usersById, columnsById, stickersById, taskTimeStats, liveTimer)}
    </section>

    ${renderTimeEditSection(task, usersById, taskTimeStats, boardId)}

    <section class="card">
      <h2>${escapeHtml(t('yougile.detail.description'))}</h2>
      ${
        descriptionHtml
          ? `<div class="description-html">${descriptionHtml}</div>`
          : `<div class="empty">${escapeHtml(t('yougile.detail.emptyDescription'))}</div>`
      }
    </section>

    ${showDebugPanels ? renderStickersSection(stickers, stickersById) : ''}
    ${showDebugPanels ? renderJsonSection(columnDebugTitle, columnDebugPayload, t('yougile.detail.unknownColumn')) : ''}
    ${showDebugPanels ? renderJsonSection(t('yougile.detail.deadline'), deadline, t('yougile.detail.emptyDeadline')) : ''}
    ${showDebugPanels ? renderTimeTrackingSection(timeTracking, taskTimeStats) : ''}
    ${showDebugPanels ? renderActualTimeSection(usersById, taskTimeStats, liveTimer) : ''}
    ${showDebugPanels ? renderTimeTrackingDebugSection(timeDebug) : ''}
    ${renderChecklistsSection(checklists)}
    ${showDebugPanels ? renderJsonSection(t('yougile.detail.raw'), task.raw, t('yougile.detail.emptyRaw')) : ''}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const boardId = ${serializeForScript(boardId ?? '')};
    const boardTaskIds = ${serializeForScript(boardTaskIds ?? [task.id])};
    const timeCard = document.getElementById('timeEditCard');
    const timeToggle = document.getElementById('timeSummaryToggle');
    const showAddBtn = document.getElementById('showAddTimeRowBtn');
    const addRow = document.getElementById('addTimeRecordRow');
    const addBtn = document.getElementById('addTimeRecordBtn');
    const cancelAddBtn = document.getElementById('cancelAddTimeRowBtn');
    const recordsListEl = document.getElementById('yougileRecordsEditList');
    const userField = document.getElementById('timeRecordUser');
    const dateField = document.getElementById('timeRecordDate');
    const durationField = document.getElementById('timeRecordDuration');

    const nowForDatetimeLocal = () => {
      const date = new Date();
      const offsetMs = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
    };

    const setTimeCardExpanded = (expanded) => {
      if (!timeCard) return;
      timeCard.classList.toggle('is-collapsed', !expanded);
    };

    const secondsToHm = (seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
      const totalMinutes = Math.floor(seconds / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    };

    const hmToSeconds = (value) => {
      const trimmed = String(value || '').trim();
      const colon = trimmed.indexOf(':');
      if (colon < 1) return NaN;
      const hPart = trimmed.slice(0, colon).trim();
      const mPart = trimmed.slice(colon + 1).trim();
      if (!/^\\d+$/.test(hPart) || !/^\\d{1,2}$/.test(mPart)) return NaN;
      const hours = Number(hPart);
      const minutes = Number(mPart);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
      if (minutes < 0 || minutes > 59) return NaN;
      return (hours * 60 + minutes) * 60;
    };

    const parseDateToIso = (value) => {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    };

    const collapseAllInlineEdits = () => {
      document.querySelectorAll('.record-row-edit').forEach((row) => {
        const pane = row.querySelector('.record-inline-editor');
        const view = row.querySelector('.record-view');
        if (pane) pane.hidden = true;
        if (view) view.hidden = false;
      });
    };

    const startInlineEdit = (row) => {
      const recordId = row.getAttribute('data-record-id');
      if (!recordId || !Array.isArray(__timeRecords)) return;
      const record = __timeRecords.find((entry) => entry.recordId === recordId);
      if (!record) return;
      collapseAllInlineEdits();
      if (addRow) addRow.hidden = true;
      const pane = row.querySelector('.record-inline-editor');
      const view = row.querySelector('.record-view');
      const dateEl = row.querySelector('.edit-inline-date');
      const durEl = row.querySelector('.edit-inline-duration');
      const date = new Date(record.date);
      if (dateEl && !Number.isNaN(date.getTime())) {
        const offsetMs = date.getTimezoneOffset() * 60000;
        dateEl.value = new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
      } else if (dateEl) {
        dateEl.value = '';
      }
      if (durEl) durEl.value = secondsToHm(record.duration);
      if (view) view.hidden = true;
      if (pane) pane.hidden = false;
      setTimeCardExpanded(true);
      dateEl?.focus();
    };

    const cancelInlineEdit = (row) => {
      const pane = row.querySelector('.record-inline-editor');
      const view = row.querySelector('.record-view');
      if (pane) pane.hidden = true;
      if (view) view.hidden = false;
    };

    timeToggle?.addEventListener('click', () => {
      const collapsed = timeCard?.classList.contains('is-collapsed');
      setTimeCardExpanded(Boolean(collapsed));
    });

    showAddBtn?.addEventListener('click', () => {
      collapseAllInlineEdits();
      if (!addRow) return;
      addRow.hidden = false;
      if (userField && typeof __defaultAddUserId === 'string' && __defaultAddUserId.trim()) userField.value = __defaultAddUserId.trim();
      if (dateField) dateField.value = nowForDatetimeLocal();
      if (durationField) durationField.value = '01:00';
      setTimeCardExpanded(true);
      dateField?.focus();
    });

    cancelAddBtn?.addEventListener('click', () => {
      if (addRow) addRow.hidden = true;
    });

    recordsListEl?.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const row = btn.closest('.record-row-edit');
      if (action === 'edit-record') {
        if (row) startInlineEdit(row);
        return;
      }
      if (action === 'cancel-inline-record') {
        if (row) cancelInlineEdit(row);
        return;
      }
      if (action === 'save-inline-record') {
        if (!row) return;
        const recordId = row.getAttribute('data-record-id');
        const userId = row.getAttribute('data-record-user-id');
        if (!recordId || !userId || !Array.isArray(__timeRecords)) return;
        const record = __timeRecords.find((entry) => entry.recordId === recordId);
        const dateEl = row.querySelector('.edit-inline-date');
        const durEl = row.querySelector('.edit-inline-duration');
        const durationSeconds = hmToSeconds(durEl ? durEl.value : '');
        vscode.postMessage({
          type: 'yougile.editTimeRecord',
          boardId,
          boardTaskIds,
          userId,
          date: parseDateToIso(dateEl ? dateEl.value : ''),
          duration: durationSeconds,
          recordId,
          revision: record && record.revision ? record.revision : undefined,
        });
        return;
      }
      if (action === 'delete-record') {
        const recordId = btn.getAttribute('data-delete-record-id');
        const userId = btn.getAttribute('data-delete-user-id');
        if (!recordId || !userId) return;
        if (!confirm(${serializeForScript(t('yougile.detail.timeEdit.deleteConfirm'))})) {
          return;
        }
        vscode.postMessage({
          type: 'yougile.deleteTimeRecord',
          boardId,
          boardTaskIds,
          userId,
          recordId,
        });
      }
    });

    addBtn?.addEventListener('click', () => {
      const durationSeconds = hmToSeconds(durationField ? durationField.value : '');
      vscode.postMessage({
        type: 'yougile.addTimeRecord',
        boardId,
        boardTaskIds,
        userId: userField ? userField.value : '',
        date: parseDateToIso(dateField ? dateField.value : ''),
        duration: durationSeconds,
      });
    });
  </script>
</body>
</html>`;
}
