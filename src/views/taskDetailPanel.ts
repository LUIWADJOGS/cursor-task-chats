import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskEntity, TaskProgressSummary, TaskStatus } from '../types/taskManager';
import type { TaskRepository } from '../db/taskRepository';
import { computeTaskProgressSummary } from '../tasks/taskProgress';
import { t } from '../i18n';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(value?: string): string {
  if (!value) {
    return '—';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleString();
}

function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'todo':
      return t('task.status.todo');
    case 'in_progress':
      return t('task.status.in_progress');
    case 'blocked':
      return t('task.status.blocked');
    case 'done':
      return t('task.status.done');
    case 'archived':
      return t('task.status.archived');
  }
}

export async function openTaskDetailPanel(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  repo: TaskRepository,
  onTreeRefresh: () => void,
  task: TaskEntity
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'taskChatTaskDetail',
    task.title,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const render = async (): Promise<void> => {
    const fresh = repo.getTaskById(task.id);
    if (!fresh) {
      panel.dispose();
      return;
    }
    const checklist = repo.getChecklist(fresh.id);
    const attachments = repo.getAttachments(fresh.id);
    const allT = repo.getAllTasks();
    const allC = repo.getAllChats();
    const progress = await computeTaskProgressSummary(folder.uri.fsPath, fresh, allT, allC);
    panel.title = fresh.title;
    panel.webview.html = buildHtml(fresh, checklist, attachments, progress, panel.webview.cspSource);
  };

  panel.webview.onDidReceiveMessage(
    async (msg: { type: string; id?: string; value?: string; label?: string; path?: string }) => {
      const tid = task.id;
      switch (msg.type) {
        case 'saveTitle': {
          if (msg.value?.trim()) {
            repo.updateTask(tid, { title: msg.value.trim() });
          }
          break;
        }
        case 'saveDescription': {
          repo.updateTask(tid, { description: msg.value?.trim() || undefined });
          break;
        }
        case 'saveStatus': {
          if (
            msg.value === 'todo' ||
            msg.value === 'in_progress' ||
            msg.value === 'blocked' ||
            msg.value === 'done'
          ) {
            repo.updateTask(tid, { status: msg.value });
          }
          break;
        }
        case 'toggleChecklist': {
          if (msg.id) {
            const items = repo.getChecklist(tid);
            const item = items.find((i) => i.id === msg.id);
            if (item) {
              repo.setChecklistItemDone(msg.id, !item.done);
            }
          }
          break;
        }
        case 'addChecklist': {
          if (msg.label?.trim()) {
            repo.addChecklistItem(tid, msg.label.trim());
          }
          break;
        }
        case 'removeChecklist': {
          if (msg.id) {
            repo.removeChecklistItem(msg.id);
          }
          break;
        }
        case 'removeAttachment': {
          if (msg.id) {
            repo.removeAttachment(msg.id);
          }
          break;
        }
        case 'pickAttachment': {
          const picked = await vscode.window.showOpenDialog({
            defaultUri: folder.uri,
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: t('taskDetail.pickFileOpenLabel'),
          });
          if (picked?.[0]) {
            const rel = path.relative(folder.uri.fsPath, picked[0].fsPath);
            if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
              repo.addAttachment(tid, rel.replace(/\\/g, '/'));
            } else {
              void vscode.window.showWarningMessage(t('messages.taskDetail.fileOutsideWorkspace'));
            }
          }
          break;
        }
        case 'openFile': {
          if (msg.path) {
            const abs = path.join(folder.uri.fsPath, msg.path);
            try {
              const doc = await vscode.workspace.openTextDocument(abs);
              await vscode.window.showTextDocument(doc);
            } catch {
              try {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(abs));
              } catch {
                void vscode.window.showWarningMessage(t('messages.taskDetail.openFileFailed'));
              }
            }
          }
          break;
        }
        default:
          return;
      }
      onTreeRefresh();
      await render();
    },
    undefined,
    context.subscriptions
  );

  panel.onDidChangeViewState((e) => {
    if (e.webviewPanel.visible) {
      void render();
    }
  });

  await render();
  panel.onDidDispose(() => onTreeRefresh());
}

function buildHtml(
  task: TaskEntity,
  checklist: { id: string; label: string; done: boolean }[],
  attachments: { id: string; pathRelative: string; note?: string }[],
  progress: TaskProgressSummary,
  cspSource: string
): string {
  const statusOptions = ['todo', 'in_progress', 'blocked', 'done'] as const;
  const opts = statusOptions
    .map(
      (s) =>
        `<option value="${s}" ${task.status === s ? 'selected' : ''}>${escapeHtml(getStatusLabel(s))}</option>`
    )
    .join('');
  const doneChecklist = checklist.filter((item) => item.done).length;
  const checklistSummary = `${doneChecklist}/${checklist.length || 0}`;
  const statusLabel = getStatusLabel(task.status);
  const statusClass = `status-${task.status}`;

  const checklistHtml = checklist
    .map(
      (c) => `
    <label class="list-row checklist-row ${c.done ? 'done' : ''}" data-id="${escapeHtml(c.id)}">
      <input type="checkbox" class="chk edit-field" ${c.done ? 'checked' : ''} data-id="${escapeHtml(c.id)}" />
      <span class="check-indicator" aria-hidden="true"></span>
      <span class="list-main">
        <span class="list-title">${escapeHtml(c.label)}</span>
      </span>
      <button type="button" class="icon-btn edit-only" data-remove="${escapeHtml(c.id)}" aria-label="${escapeHtml(t('taskDetail.removeChecklistItem'))}">×</button>
    </label>`
    )
    .join('');

  const attachHtml = attachments
    .map(
      (a) => `
    <div class="list-row attachment-row">
      <span class="list-main">
        <code>${escapeHtml(a.pathRelative)}</code>
      </span>
      <button type="button" class="secondary-btn" data-open="${escapeHtml(a.pathRelative)}">${escapeHtml(t('taskDetail.openFile'))}</button>
      <button type="button" class="icon-btn edit-only" data-rmatt="${escapeHtml(a.id)}" aria-label="${escapeHtml(t('taskDetail.removeAttachment'))}">×</button>
    </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 20px;
      line-height: 1.5;
    }
    .layout {
      max-width: 920px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 12px;
      padding: 16px;
    }
    .hero {
      display: grid;
      gap: 14px;
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .hero h1 {
      margin: 0;
      font-size: 1.35rem;
      line-height: 1.3;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .primary-btn, .secondary-btn, .icon-btn {
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      transition: opacity 120ms ease, background 120ms ease;
    }
    .primary-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 8px 12px;
    }
    .secondary-btn {
      background: transparent;
      color: var(--vscode-button-foreground, var(--vscode-foreground));
      border-color: var(--vscode-button-border, var(--vscode-widget-border, transparent));
      padding: 8px 12px;
    }
    .icon-btn {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      border-color: var(--vscode-widget-border, transparent);
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
    }
    .primary-btn:hover, .secondary-btn:hover, .icon-btn:hover {
      opacity: 0.9;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 0.85rem;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .status-badge.status-todo {
      background: color-mix(in srgb, var(--vscode-badge-background) 75%, transparent);
    }
    .status-badge.status-in_progress {
      background: color-mix(in srgb, var(--vscode-button-background) 35%, transparent);
    }
    .status-badge.status-blocked {
      background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground, #7a5c00) 35%, transparent);
    }
    .status-badge.status-done {
      background: color-mix(in srgb, var(--vscode-testing-iconPassed, #1a7f37) 35%, transparent);
    }
    .meta-grid, .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .meta-item, .stat {
      background: var(--vscode-editorWidget-background, rgba(127, 127, 127, 0.08));
      border-radius: 10px;
      padding: 12px;
      min-width: 0;
    }
    .meta-label, .stat-label {
      display: block;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .meta-value, .stat-value {
      display: block;
      font-size: 0.95rem;
      word-break: break-word;
    }
    .stat-value {
      font-size: 1.2rem;
      font-weight: 600;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 10px;
    }
    h2 {
      margin: 0;
      font-size: 1rem;
    }
    .section-copy {
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
    }
    .field-label {
      display: block;
      margin: 0 0 6px;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
    }
    .view-value {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.96rem;
    }
    .description-block {
      min-height: 88px;
    }
    .empty-state {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    input[type=text], textarea, select {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
    }
    textarea {
      min-height: 140px;
      resize: vertical;
      font-family: inherit;
    }
    .edit-panel {
      display: grid;
      gap: 14px;
    }
    .list {
      display: grid;
      gap: 8px;
    }
    .list-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--vscode-editorWidget-background, rgba(127, 127, 127, 0.08));
      border: 1px solid transparent;
    }
    .list-main {
      flex: 1 1 auto;
      min-width: 0;
      display: grid;
    }
    .list-title {
      word-break: break-word;
    }
    .checklist-row {
      cursor: default;
    }
    .checklist-row.done .list-title {
      text-decoration: line-through;
      color: var(--vscode-descriptionForeground);
    }
    .checklist-row input[type=checkbox] {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .check-indicator {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 1px solid var(--vscode-checkbox-border, var(--vscode-widget-border, currentColor));
      background: var(--vscode-checkbox-background, transparent);
      position: relative;
      flex: 0 0 auto;
    }
    .checklist-row.done .check-indicator::after {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 999px;
      background: var(--vscode-testing-iconPassed, currentColor);
    }
    .attachment-row code {
      font-size: 0.88rem;
      word-break: break-all;
    }
    .split {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
    }
    body:not(.editing) .edit-root,
    body:not(.editing) .edit-only {
      display: none !important;
    }
    body.editing .view-only {
      display: none !important;
    }
    body:not(.editing) .edit-field {
      pointer-events: none;
    }
    @media (max-width: 760px) {
      body {
        padding: 12px;
      }
      .hero-top, .section-head, .split {
        grid-template-columns: 1fr;
        display: grid;
      }
      .toolbar {
        justify-content: flex-start;
      }
    }
  </style>
</head><body>
  <div class="layout">
    <section class="card hero">
      <div class="hero-top">
        <div>
          <div class="badges">
            <span class="badge status-badge ${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span>
            <span class="badge">${escapeHtml(task.branchName)}</span>
          </div>
          <h1>${escapeHtml(task.title)}</h1>
          <div class="muted">${escapeHtml(t('taskDetail.progressLine', {
            commits: String(progress.commitCount),
            files: String(progress.changedFiles.length),
            subDone: String(progress.doneSubtasks),
            subTot: String(progress.totalSubtasks),
            chats: String(progress.activeChatCount),
          }))}</div>
        </div>
        <div class="toolbar">
          <button type="button" class="secondary-btn view-only" id="editToggle">${escapeHtml(t('taskDetail.editMode'))}</button>
          <button type="button" class="secondary-btn edit-only" id="cancelEdit">${escapeHtml(t('taskDetail.cancelEdit'))}</button>
          <button type="button" class="primary-btn edit-only" id="saveMain">${escapeHtml(t('taskDetail.save'))}</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat">
          <span class="stat-label">${escapeHtml(t('taskDetail.metricCommits'))}</span>
          <span class="stat-value">${escapeHtml(String(progress.commitCount))}</span>
        </div>
        <div class="stat">
          <span class="stat-label">${escapeHtml(t('taskDetail.metricFiles'))}</span>
          <span class="stat-value">${escapeHtml(String(progress.changedFiles.length))}</span>
        </div>
        <div class="stat">
          <span class="stat-label">${escapeHtml(t('taskDetail.metricSubtasks'))}</span>
          <span class="stat-value">${escapeHtml(`${progress.doneSubtasks}/${progress.totalSubtasks}`)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">${escapeHtml(t('taskDetail.metricChecklist'))}</span>
          <span class="stat-value">${escapeHtml(checklistSummary)}</span>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(t('taskDetail.branchLabel'))}</span>
          <span class="meta-value">${escapeHtml(task.branchName)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(t('taskDetail.createdAtLabel'))}</span>
          <span class="meta-value">${escapeHtml(formatDateTime(task.createdAt))}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(t('taskDetail.updatedAtLabel'))}</span>
          <span class="meta-value">${escapeHtml(formatDateTime(task.updatedAt))}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(t('taskDetail.baselineLabel'))}</span>
          <span class="meta-value">${escapeHtml(task.baselineCommitHash?.slice(0, 12) || '—')}</span>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <h2>${escapeHtml(t('taskDetail.mainSection'))}</h2>
        <span class="section-copy view-only">${escapeHtml(t('taskDetail.readOnlyHint'))}</span>
        <span class="section-copy edit-only">${escapeHtml(t('taskDetail.editingHint'))}</span>
      </div>

      <div class="view-only">
        <span class="field-label">${escapeHtml(t('taskDetail.titleLabel'))}</span>
        <div class="view-value">${escapeHtml(task.title)}</div>

        <span class="field-label" style="margin-top:14px;">${escapeHtml(t('taskDetail.statusLabel'))}</span>
        <div class="view-value">${escapeHtml(statusLabel)}</div>

        <span class="field-label" style="margin-top:14px;">${escapeHtml(t('taskDetail.descriptionLabel'))}</span>
        <div class="view-value description-block ${task.description ? '' : 'empty-state'}">${escapeHtml(task.description || t('taskDetail.emptyDescription'))}</div>
      </div>

      <div class="edit-root edit-panel">
        <div>
          <label class="field-label" for="title">${escapeHtml(t('taskDetail.titleLabel'))}</label>
          <input type="text" id="title" value="${escapeHtml(task.title)}" />
        </div>
        <div>
          <label class="field-label" for="status">${escapeHtml(t('taskDetail.statusLabel'))}</label>
          <select id="status">${opts}</select>
        </div>
        <div>
          <label class="field-label" for="desc">${escapeHtml(t('taskDetail.descriptionLabel'))}</label>
          <textarea id="desc">${escapeHtml(task.description ?? '')}</textarea>
        </div>
      </div>
    </section>

    <div class="split">
      <section class="card">
        <div class="section-head">
          <h2>${escapeHtml(t('taskDetail.checklist'))}</h2>
          <span class="section-copy">${escapeHtml(t('taskDetail.checklistSummary', { done: String(doneChecklist), total: String(checklist.length) }))}</span>
        </div>
        <div class="list" id="checklist">${checklistHtml || `<div class="empty-state">${escapeHtml(t('taskDetail.emptyChecklist'))}</div>`}</div>
        <div class="edit-root" style="margin-top:12px;">
          <input type="text" id="newCl" placeholder="${escapeHtml(t('taskDetail.newChecklistPlaceholder'))}" />
          <button type="button" class="primary-btn" id="addCl" style="margin-top:10px;">${escapeHtml(t('taskDetail.addChecklist'))}</button>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>${escapeHtml(t('taskDetail.attachments'))}</h2>
          <span class="section-copy">${escapeHtml(t('taskDetail.attachHint'))}</span>
        </div>
        <button type="button" class="secondary-btn edit-only" id="pickAtt">${escapeHtml(t('taskDetail.addAttachment'))}</button>
        <div class="list" id="atts" style="margin-top:12px;">${attachHtml || `<div class="empty-state">${escapeHtml(t('taskDetail.emptyAttachments'))}</div>`}</div>
      </section>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let state = vscode.getState() || {};
    const body = document.body;
    const applyMode = (editing) => {
      body.classList.toggle('editing', editing);
      document.querySelectorAll('.chk').forEach(el => {
        el.disabled = !editing;
      });
      state = { ...state, editing };
      vscode.setState(state);
    };

    applyMode(Boolean(state.editing));

    document.getElementById('editToggle').onclick = () => applyMode(true);
    document.getElementById('cancelEdit').onclick = () => applyMode(false);
    document.getElementById('saveMain').onclick = () => {
      vscode.postMessage({ type: 'saveTitle', value: document.getElementById('title').value });
      vscode.postMessage({ type: 'saveDescription', value: document.getElementById('desc').value });
      vscode.postMessage({ type: 'saveStatus', value: document.getElementById('status').value });
      applyMode(false);
    };
    document.querySelectorAll('.chk').forEach(el => {
      el.addEventListener('change', () => {
        if (!body.classList.contains('editing')) {
          return;
        }
        vscode.postMessage({ type: 'toggleChecklist', id: el.dataset.id });
      });
    });
    document.querySelectorAll('[data-remove]').forEach(el => {
      el.onclick = () => vscode.postMessage({ type: 'removeChecklist', id: el.dataset.remove });
    });
    document.getElementById('addCl').onclick = () => {
      const v = document.getElementById('newCl').value;
      vscode.postMessage({ type: 'addChecklist', label: v });
      document.getElementById('newCl').value = '';
    };
    document.getElementById('pickAtt').onclick = () => vscode.postMessage({ type: 'pickAttachment' });
    document.querySelectorAll('[data-open]').forEach(el => {
      el.onclick = () => vscode.postMessage({ type: 'openFile', path: el.dataset.open });
    });
    document.querySelectorAll('[data-rmatt]').forEach(el => {
      el.onclick = () => vscode.postMessage({ type: 'removeAttachment', id: el.dataset.rmatt });
    });
  </script>
</body></html>`;
}
