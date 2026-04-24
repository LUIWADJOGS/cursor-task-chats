import * as vscode from 'vscode';

type YouGileTimeReportRow = {
  taskTitle: string;
  secondsByDay: number[];
  totalSeconds: number;
};

type OpenYouGileTimeReportParams = {
  periodLabel: string;
  dateLabels: string[];
  rows: YouGileTimeReportRow[];
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

export async function openYouGileTimeReportPanel(params: OpenYouGileTimeReportParams): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'yougileTimeReport',
    `YouGile Time Report: ${params.periodLabel}`,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const headerCells = params.dateLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join('');
  const bodyRows = params.rows
    .map((row) => {
      const cells = row.secondsByDay
        .map((value) => `<td class="num">${escapeHtml(formatDuration(value))}</td>`)
        .join('');
      return `<tr><td class="task">${escapeHtml(row.taskTitle)}</td>${cells}<td class="num total">${escapeHtml(
        formatDuration(row.totalSeconds)
      )}</td></tr>`;
    })
    .join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
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
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || '<tr><td colspan="100%">No time tracked for selected period.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

