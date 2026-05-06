import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskEntity, TaskProgressSummary, TaskStatus } from '../types/taskManager';
import type { TaskRepository } from '../db/taskRepository';
import { computeTaskProgressSummary } from '../tasks/taskProgress';
import { t } from '../i18n';
import { UNIFIED_TASK_CARD_BASE_CSS, LOCAL_TASK_EDITOR_SUPPLEMENT_CSS } from './unified/taskCardCss';
import { escapeTaskCardHtml as escapeHtml, renderInfoBadge } from './unified/taskCardParts';

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

function getLocalSummaryAccent(status: TaskStatus): string {
  switch (status) {
    case 'done':
    case 'archived':
      return '#656d76';
    case 'blocked':
      return '#d29922';
    case 'in_progress':
      return '#1f6feb';
    case 'todo':
    default:
      return '#2f81f7';
  }
}

function buildLocalSummaryBlock(
  task: TaskEntity,
  progress: TaskProgressSummary,
  checklistDone: number,
  checklistTotal: number
): string {
  const isClosed = task.status === 'done' || task.status === 'archived';
  const statusColor = isClosed ? '#f85149' : '#2ea043';
  const accent = getLocalSummaryAccent(task.status);
  const statusLabel = getStatusLabel(task.status);
  const groupTitle = t('yougile.detail.mainInfo');
  const badges = [
    renderInfoBadge('📋', t('taskDetail.statusLabel'), statusLabel, { color: accent }),
    renderInfoBadge('🌿', t('taskDetail.branchLabel'), task.branchName, { title: task.branchName }),
    renderInfoBadge('📎', t('taskDetail.metricCommits'), String(progress.commitCount)),
    renderInfoBadge('📄', t('taskDetail.metricFiles'), String(progress.changedFiles.length)),
    renderInfoBadge(
      '🧩',
      t('taskDetail.metricSubtasks'),
      `${progress.doneSubtasks}/${progress.totalSubtasks}`
    ),
    renderInfoBadge('✓', t('taskDetail.metricChecklist'), `${checklistDone}/${checklistTotal}`),
    renderInfoBadge('💬', t('taskDetail.metricChats'), String(progress.activeChatCount)),
  ].join('');
  const baseline = task.baselineCommitHash?.slice(0, 12);
  const extraPills: string[] = [
    `<span class="extra-pill">${escapeHtml(t('taskDetail.updatedAtLabel'))}: ${escapeHtml(formatDateTime(task.updatedAt))}</span>`,
  ];
  if (baseline) {
    extraPills.push(
      `<span class="extra-pill">${escapeHtml(t('taskDetail.baselineLabel'))}: ${escapeHtml(baseline)}</span>`
    );
  }
  return `
    <div class="task-summary" style="--column-color:${escapeHtml(accent)};">
      <div class="task-summary-head">
        <div class="task-title-line">
          <span class="status-dot" style="--status-color:${escapeHtml(statusColor)};" title="${escapeHtml(statusLabel)}"></span>
          <span class="task-title-text">${escapeHtml(task.title)}</span>
        </div>
        <div class="created-at">＋ ${escapeHtml(formatDateTime(task.createdAt))}</div>
      </div>
      <div class="task-summary-row">
        <div class="compact-info-groups" style="flex:1;">
          <div class="info-group">
            <div class="info-group-title">${escapeHtml(groupTitle)}</div>
            <div class="compact-info">${badges}</div>
          </div>
        </div>
      </div>
      <div class="task-extra-line">${extraPills.join('')}</div>
    </div>
  `;
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
  const statusLabel = getStatusLabel(task.status);

  const doneChecklist = checklist.filter((item) => item.done).length;
  const checklistHtml =
    checklist
      .map(
        (c) => `
      <label class="checklist-item checklist-local-row ${c.done ? 'done' : ''}" data-id="${escapeHtml(c.id)}">
        <input type="checkbox" class="chk-local edit-field-local" ${c.done ? 'checked' : ''} data-id="${escapeHtml(c.id)}" />
        <span class="chk-box" aria-hidden="true"></span>
        <span class="checklist-text">${escapeHtml(c.label)}</span>
        <button type="button" class="icon-btn-min edit-only-local danger" data-remove="${escapeHtml(c.id)}" title="${escapeHtml(t('taskDetail.removeChecklistItem'))}">🗑</button>
      </label>`
      )
      .join('') ||
    '';

  const attachHtml =
    attachments
      .map(
        (a) => `
    <div class="attachment-line">
      <code>${escapeHtml(a.pathRelative)}</code>
      <button type="button" class="secondary-btn" data-open="${escapeHtml(a.pathRelative)}">${escapeHtml(t('taskDetail.openFile'))}</button>
      <button type="button" class="icon-btn-min edit-only-local danger" data-rmatt="${escapeHtml(a.id)}" title="${escapeHtml(t('taskDetail.removeAttachment'))}">🗑</button>
    </div>`
      )
      .join('') || '';

  const summaryInner = buildLocalSummaryBlock(task, progress, doneChecklist, checklist.length);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    ${UNIFIED_TASK_CARD_BASE_CSS}
    ${LOCAL_TASK_EDITOR_SUPPLEMENT_CSS}
  </style>
</head>
<body>
  <div class="layout">
    <section class="card">
      ${summaryInner}
    </section>

    <section class="card">
      <div class="local-card-head">
        <button type="button" class="secondary-btn view-only-local" id="editToggle">${escapeHtml(t('taskDetail.editMode'))}</button>
        <button type="button" class="secondary-btn edit-only-local" id="cancelEdit">${escapeHtml(t('taskDetail.cancelEdit'))}</button>
        <button type="button" class="primary-btn edit-only-local" id="saveMain">${escapeHtml(t('taskDetail.save'))}</button>
      </div>
      <h2>${escapeHtml(t('taskDetail.mainSection'))}</h2>
      <span class="view-only-local muted" style="display:block;color:var(--vscode-descriptionForeground);font-size:.85rem;margin-bottom:10px;">${escapeHtml(t('taskDetail.readOnlyHint'))}</span>
      <span class="edit-only-local muted" style="display:block;color:var(--vscode-descriptionForeground);font-size:.85rem;margin-bottom:10px;">${escapeHtml(t('taskDetail.editingHint'))}</span>

      <div class="view-only-local">
        <span class="field-label-local">${escapeHtml(t('taskDetail.titleLabel'))}</span>
        <div class="description-html local-plain">${escapeHtml(task.title)}</div>

        <span class="field-label-local">${escapeHtml(t('taskDetail.statusLabel'))}</span>
        <div class="description-html local-plain">${escapeHtml(statusLabel)}</div>

        <span class="field-label-local">${escapeHtml(t('yougile.detail.description'))}</span>
        ${
          task.description
            ? `<div class="description-html local-plain">${escapeHtml(task.description)}</div>`
            : `<div class="empty">${escapeHtml(t('taskDetail.emptyDescription'))}</div>`
        }
      </div>

      <div class="edit-root-local">
        <span class="field-label-local">${escapeHtml(t('taskDetail.titleLabel'))}</span>
        <input type="text" id="title" value="${escapeHtml(task.title)}" />
        <span class="field-label-local">${escapeHtml(t('taskDetail.statusLabel'))}</span>
        <select id="status">${opts}</select>
        <span class="field-label-local">${escapeHtml(t('yougile.detail.description'))}</span>
        <textarea id="desc">${escapeHtml(task.description ?? '')}</textarea>
      </div>
    </section>

    <section class="card">
      <h2>${escapeHtml(t('taskDetail.checklist'))}</h2>
      <span class="muted" style="color:var(--vscode-descriptionForeground);font-size:.85rem;display:block;margin-bottom:10px;">${escapeHtml(
        t('taskDetail.checklistSummary', { done: String(doneChecklist), total: String(checklist.length) })
      )}</span>
      <div class="checklists">
        <div class="checklist-block">
          ${
            checklistHtml
              ? `<div class="checklist-items" id="checklist">${checklistHtml}</div>`
              : `<div class="empty">${escapeHtml(t('taskDetail.emptyChecklist'))}</div>`
          }
        </div>
      </div>
      <div class="edit-root-local" style="margin-top:12px;display:grid;gap:8px;">
        <input type="text" id="newCl" placeholder="${escapeHtml(t('taskDetail.newChecklistPlaceholder'))}" />
        <button type="button" class="primary-btn edit-only-local" id="addCl">${escapeHtml(t('taskDetail.addChecklist'))}</button>
      </div>
    </section>

    <section class="card">
      <h2>${escapeHtml(t('taskDetail.attachments'))}</h2>
      <span class="muted" style="color:var(--vscode-descriptionForeground);font-size:.85rem;display:block;margin-bottom:10px;">${escapeHtml(t('taskDetail.attachHint'))}</span>
      <button type="button" class="secondary-btn edit-only-local" id="pickAtt">${escapeHtml(t('taskDetail.addAttachment'))}</button>
      <div id="atts" style="margin-top:12px;display:grid;gap:8px;">${
        attachHtml || `<div class="empty">${escapeHtml(t('taskDetail.emptyAttachments'))}</div>`
      }</div>
    </section>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let state = vscode.getState() || {};
    const body = document.body;
    const applyMode = (editing) => {
      body.classList.toggle('editing', editing);
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
    document.querySelectorAll('.chk-local').forEach(el => {
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
    const addCl = document.getElementById('addCl');
    if (addCl) {
      addCl.onclick = () => {
        const input = document.getElementById('newCl');
        vscode.postMessage({ type: 'addChecklist', label: input ? input.value : '' });
        if (input) input.value = '';
      };
    }
    const pickAtt = document.getElementById('pickAtt');
    if (pickAtt) pickAtt.onclick = () => vscode.postMessage({ type: 'pickAttachment' });
    document.querySelectorAll('[data-open]').forEach(el => {
      el.onclick = () => vscode.postMessage({ type: 'openFile', path: el.dataset.open });
    });
    document.querySelectorAll('[data-rmatt]').forEach(el => {
      el.onclick = () => vscode.postMessage({ type: 'removeAttachment', id: el.dataset.rmatt });
    });
  </script>
</body>
</html>`;
}
