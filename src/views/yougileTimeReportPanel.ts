import * as vscode from 'vscode';

type YouGileTimeReportRow = {
  taskTitle: string;
  secondsByDay: number[];
  periodFactSeconds: number;
  periodEstimateHours?: number;
  overallFactSeconds: number;
  overallEstimateHours?: number;
};

type OpenYouGileTimeReportParams = {
  periodLabel: string;
  dateLabels: string[];
  rows: YouGileTimeReportRow[];
  lowDayThresholdSeconds: number;
  lowDayCellColor: string;
  overEstimateRowColor: string;
  intersectionCellColor: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0m';
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function sanitizeCssColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const isHex = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed);
  const isFunctional = /^(rgb|rgba|hsl|hsla)\([^)]+\)$/.test(trimmed);
  const isVar = /^var\(--[A-Za-z0-9_-]+\)$/.test(trimmed);
  return isHex || isFunctional || isVar ? trimmed : fallback;
}

export async function openYouGileTimeReportPanel(params: OpenYouGileTimeReportParams): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'yougileTimeReport',
    `YouGile Time Report: ${params.periodLabel}`,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );
  const lowDayThresholdSeconds = Math.max(0, params.lowDayThresholdSeconds || 0);
  const lowDayCellColor = sanitizeCssColor(params.lowDayCellColor, 'rgba(255, 193, 7, 0.25)');
  const overEstimateRowColor = sanitizeCssColor(params.overEstimateRowColor, 'rgba(255, 99, 71, 0.20)');
  const intersectionCellColor = sanitizeCssColor(params.intersectionCellColor, 'rgba(255, 128, 0, 0.35)');

  const headerCells = params.dateLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join('');
  const bodyRows = params.rows
    .map((row) => {
      const overEstimate =
        row.periodEstimateHours !== undefined && row.periodFactSeconds > row.periodEstimateHours * 3600;
      const cells = row.secondsByDay
        .map((value) => {
          const lowDayClass = lowDayThresholdSeconds > 0 && value < lowDayThresholdSeconds ? ' low-day' : '';
          const intersectionClass = overEstimate && lowDayClass ? ' intersection' : '';
          return `<td class="num${lowDayClass}${intersectionClass}">${escapeHtml(formatDuration(value))}</td>`;
        })
        .join('');
      const periodEstimate = row.periodEstimateHours !== undefined ? `${row.periodEstimateHours}h` : '—';
      const totalCell = `${formatDuration(row.periodFactSeconds)} / ${formatDuration(
        row.overallFactSeconds
      )} / ${periodEstimate}`;
      const rowClass = overEstimate ? ' class="over-estimate"' : '';
      return `<tr${rowClass}><td class="task">${escapeHtml(row.taskTitle)}</td>${cells}<td class="num total">${totalCell}</td></tr>`;
    })
    .join('');
  const dayTotals = params.dateLabels.map((_, dayIndex) =>
    params.rows.reduce((sum, row) => sum + (row.secondsByDay[dayIndex] ?? 0), 0)
  );
  const periodTotal = params.rows.reduce((sum, row) => sum + row.periodFactSeconds, 0);
  const overallTotal = params.rows.reduce((sum, row) => sum + row.overallFactSeconds, 0);
  const estimateRows = params.rows.filter((row) => row.periodEstimateHours !== undefined);
  const estimateTotal =
    estimateRows.length > 0
      ? `${Math.round(estimateRows.reduce((sum, row) => sum + (row.periodEstimateHours ?? 0), 0) * 100) / 100}h`
      : '—';
  const totalDayCells = dayTotals
    .map((value) => `<td class="num total">${escapeHtml(formatDuration(value))}</td>`)
    .join('');
  const totalSummary = `${formatDuration(periodTotal)} / ${formatDuration(overallTotal)} / ${estimateTotal}`;
  const totalRow = params.rows.length
    ? `<tr class="total-row"><td class="task total">ИТОГО</td>${totalDayCells}<td class="num total">${totalSummary}</td></tr>`
    : '';

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --cursor-task-chats-low-day-cell-color: ${lowDayCellColor};
      --cursor-task-chats-over-estimate-row-color: ${overEstimateRowColor};
      --cursor-task-chats-intersection-cell-color: ${intersectionCellColor};
    }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
    .card { border: 1px solid var(--vscode-widget-border, transparent); border-radius: 8px; padding: 12px; background: var(--vscode-sideBar-background); }
    .period { color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .table-wrap { overflow: auto; max-height: calc(100vh - 110px); }
    table { border-collapse: collapse; width: max-content; min-width: 100%; }
    th, td { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2)); padding: 6px 8px; white-space: nowrap; }
    th { position: sticky; top: 0; background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); z-index: 2; }
    .task { position: sticky; left: 0; background: var(--vscode-sideBar-background); min-width: 260px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; z-index: 1; }
    th.task { z-index: 3; }
    .num { text-align: right; }
    .total { font-weight: 600; }
    .total-row td { background: var(--vscode-editorWidget-background, rgba(127,127,127,.1)); }
    td.low-day { background: var(--cursor-task-chats-low-day-cell-color); }
    tr.over-estimate td { background: var(--cursor-task-chats-over-estimate-row-color); }
    tr.over-estimate td.intersection { background: var(--cursor-task-chats-intersection-cell-color); }
  </style>
</head>
<body>
  <div class="card">
    <div class="period">Period: ${escapeHtml(params.periodLabel)}</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="task">Task</th>
            ${headerCells}
            <th>ИТОГО (за период / всего / оценка)</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || '<tr><td colspan="100%">No time tracked for selected period.</td></tr>'}
          ${totalRow}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

