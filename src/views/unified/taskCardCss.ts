/**
 * Общие стили карточки задачи (как у YouGile) + доп. стили редактирования локальной задачи.
 */

export const UNIFIED_TASK_CARD_BASE_CSS = `
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
    .task-summary-row { display: flex; justify-content: space-between; gap: 14px; align-items: center; flex-wrap: wrap; }
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
    .compact-info-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; flex: 1 1 auto; min-width: 0; }
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
    .description-html { background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border-radius: 8px; padding: 14px; font-size: 1.02rem; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
    .description-html.local-plain { white-space: pre-wrap; }
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
    .time-edit-card.is-collapsed { display: none !important; }
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
    .time-row-editor[hidden] { display: none !important; }
    .time-row-editor input, .time-row-editor select { width:100%; box-sizing:border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; padding: 5px 6px; font: inherit; }
`;

/** Поля редактирования и интерактивный чеклист локальной задачи. */
export const LOCAL_TASK_EDITOR_SUPPLEMENT_CSS = `
    .local-card-head { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .primary-btn, .secondary-btn { border: 1px solid transparent; border-radius: 8px; cursor: pointer; font: inherit; padding: 7px 12px; }
    .primary-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
    .secondary-btn { background: transparent; color: var(--vscode-button-foreground, var(--vscode-foreground)); border-color: var(--vscode-button-border, var(--vscode-widget-border, transparent)); }
    input[type=text], textarea, select { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 8px 10px; font: inherit; }
    textarea { min-height: 120px; resize: vertical; font-family: inherit; }
    .field-label-local { display: block; margin: 12px 0 6px; font-size: .78rem; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    .field-label-local:first-child { margin-top: 0; }
    body:not(.editing) .edit-root-local,
    body:not(.editing) .edit-only-local { display: none !important; }
    body:not(.editing) .chk-local { pointer-events: none; opacity: .85; }
    body.editing .view-only-local { display: none !important; }
    .checklist-local-row { cursor: pointer; user-select: none; }
    .checklist-local-row input[type=checkbox] { position: absolute; opacity: 0; width: 0; height: 0; }
    .chk-box { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--vscode-checkbox-border, var(--vscode-widget-border, currentColor)); flex: 0 0 auto; margin-top: 2px; position: relative; }
    .checklist-local-row.done .chk-box::after { content: ''; position: absolute; inset: 3px; background: var(--vscode-testing-iconPassed, currentColor); border-radius: 2px; }
    .attachment-line { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); flex-wrap: wrap; }
    .checklist-local-row .checklist-text { flex: 1; min-width: 0; word-break: break-word; }
    .attachment-line code { font-size: .88rem; word-break: break-all; flex: 1 1 120px; min-width: 0; }
`;
