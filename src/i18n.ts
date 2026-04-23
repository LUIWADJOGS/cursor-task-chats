import * as vscode from 'vscode';
import type { TaskStatus } from './types/taskManager';

export type TranslationKey =
  | 'buildTaskPrompt.branch'
  | 'buildTaskPrompt.taskTitle'
  | 'buildTaskPrompt.descriptionHeader'
  | 'buildTaskPrompt.parent'
  | 'buildTaskPrompt.status'
  | 'buildTaskPrompt.subtasksSummary'
  | 'buildTaskPrompt.subtasksMore'
  | 'buildTaskPrompt.progress'
  | 'buildTaskPrompt.changedFilesHeader'
  | 'buildTaskPrompt.changedFilesMore'
  | 'buildTaskPrompt.nextStepSubtasks'
  | 'buildTaskPrompt.nextStepImplement'
  | 'buildTaskPrompt.instructions'
  | 'buildTaskPrompt.checklistHeader'
  | 'buildTaskPrompt.checklistItem'
  | 'buildTaskPrompt.attachmentsHeader'
  | 'buildTaskPrompt.attachmentLine'
  | 'buildTaskPrompt.listMore'
  | 'task.status.todo'
  | 'task.status.in_progress'
  | 'task.status.blocked'
  | 'task.status.done'
  | 'task.status.archived'
  | 'task.tree.branchLabel'
  | 'task.tree.branchDescription'
  | 'task.tree.chatDescription'
  | 'task.tooltip.branch'
  | 'task.tooltip.progress'
  | 'task.tooltip.subtasks'
  | 'task.tooltip.commits'
  | 'task.tooltip.chats'
  | 'chat.untitled'
  | 'chat.openTitle'
  | 'messages.attachCurrent.openChatFirst'
  | 'messages.attachCurrent.pickPrompt'
  | 'messages.attachCurrent.pickTask'
  | 'messages.attachCurrent.success'
  | 'messages.copyPrompt.missing'
  | 'messages.copyPrompt.success'
  | 'messages.copyTaskPrompt.success'
  | 'messages.createTask.titlePrompt'
  | 'messages.createTask.titlePlaceholder'
  | 'messages.createTask.titleValidation'
  | 'messages.createTask.descPrompt'
  | 'messages.createTask.openFailed'
  | 'messages.createTask.attachFailed'
  | 'messages.createSubtask.titlePrompt'
  | 'messages.createSubtask.pickParent'
  | 'messages.openTaskChat.openFailed'
  | 'messages.openTaskChat.attachFailed'
  | 'messages.noWorkspace'
  | 'messages.openExisting.failed'
  | 'messages.showTasks.empty'
  | 'messages.showTasks.placeholder'
  | 'messages.commitDiff.noStartCommit'
  | 'messages.commitDiff.noChanges'
  | 'messages.taskDiff.header'
  | 'messages.branchDiff.noBase'
  | 'messages.branchDiff.header'
  | 'messages.renameChat.inputPrompt'
  | 'messages.renameChat.inputPlaceholder'
  | 'messages.renameChat.success'
  | 'messages.renameTask.inputPrompt'
  | 'messages.renameTask.inputPlaceholder'
  | 'messages.renameTask.inputValidation'
  | 'messages.renameTask.success'
  | 'messages.changeStatus.placeholder'
  | 'messages.changeStatus.success'
  | 'messages.changeTaskBranch.inputPrompt'
  | 'messages.changeTaskBranch.inputPlaceholder'
  | 'messages.changeTaskBranch.inputValidation'
  | 'messages.changeTaskBranch.success'
  | 'messages.detach.taskChat'
  | 'messages.detach.task'
  | 'chat.commitsBadge'
  | 'chat.commitsTooltipHeader'
  | 'chat.commitsTooltipMoreFiles'
  | 'taskDetail.progressLine'
  | 'taskDetail.titleLabel'
  | 'taskDetail.statusLabel'
  | 'taskDetail.descriptionLabel'
  | 'taskDetail.save'
  | 'taskDetail.checklist'
  | 'taskDetail.emptyChecklist'
  | 'taskDetail.newChecklistPlaceholder'
  | 'taskDetail.addChecklist'
  | 'taskDetail.attachments'
  | 'taskDetail.emptyAttachments'
  | 'taskDetail.addAttachment'
  | 'taskDetail.attachHint'
  | 'taskDetail.openFile'
  | 'taskDetail.pickFileOpenLabel'
  | 'taskDetail.editMode'
  | 'taskDetail.cancelEdit'
  | 'taskDetail.metricCommits'
  | 'taskDetail.metricFiles'
  | 'taskDetail.metricSubtasks'
  | 'taskDetail.metricChecklist'
  | 'taskDetail.branchLabel'
  | 'taskDetail.createdAtLabel'
  | 'taskDetail.updatedAtLabel'
  | 'taskDetail.baselineLabel'
  | 'taskDetail.mainSection'
  | 'taskDetail.readOnlyHint'
  | 'taskDetail.editingHint'
  | 'taskDetail.emptyDescription'
  | 'taskDetail.checklistSummary'
  | 'taskDetail.removeChecklistItem'
  | 'taskDetail.removeAttachment'
  | 'messages.taskDetail.openFileFailed'
  | 'messages.taskDetail.fileOutsideWorkspace'
  | 'yougile.rootLabel'
  | 'yougile.rootDescription'
  | 'yougile.taskDescription.open'
  | 'yougile.taskDescription.done'
  | 'yougile.taskDescription.archived'
  | 'yougile.taskTooltip.taskId'
  | 'yougile.apiKeyMissing'
  | 'yougile.requestFailed'
  | 'yougile.invalidJson'
  | 'commands.refreshYougile.title'
  | 'messages.refreshYougile.success';

type Translations = Record<TranslationKey, string>;

const en: Translations = {
  'buildTaskPrompt.branch': 'Branch: {branchName}',
  'buildTaskPrompt.taskTitle': 'Task: {title}',
  'buildTaskPrompt.descriptionHeader': 'Description:',
  'buildTaskPrompt.parent': 'Parent task: {title}',
  'buildTaskPrompt.status': 'Status: {status}',
  'buildTaskPrompt.subtasksSummary': 'Subtasks: {done}/{total} done',
  'buildTaskPrompt.subtasksMore': '…and {count} more subtasks',
  'buildTaskPrompt.progress':
    'Progress: {commits} commit(s), {files} file(s) changed vs baseline, {chats} active chat(s).',
  'buildTaskPrompt.changedFilesHeader': 'Changed files (sample):',
  'buildTaskPrompt.changedFilesMore': '…and {count} more files',
  'buildTaskPrompt.nextStepSubtasks': 'Next: finish remaining subtasks, then integrate and verify.',
  'buildTaskPrompt.nextStepImplement':
    'Next: implement the task in small steps. Prefer typed changes; avoid unrelated refactors.',
  'buildTaskPrompt.instructions':
    'Work only within this git branch and this task scope. Do not touch unrelated code. No any/unknown unless justified.',
  'buildTaskPrompt.checklistHeader': 'Checklist:',
  'buildTaskPrompt.checklistItem': '- [{done}] {label}',
  'buildTaskPrompt.attachmentsHeader': 'Attached files (paths in workspace):',
  'buildTaskPrompt.attachmentLine': '- {path}',
  'buildTaskPrompt.listMore': '…and {count} more',

  'task.status.todo': 'todo',
  'task.status.in_progress': 'in progress',
  'task.status.blocked': 'blocked',
  'task.status.done': 'done',
  'task.status.archived': 'archived',

  'task.tree.branchLabel': 'Branch: {branch}',
  'task.tree.branchDescription': 'tasks for this branch',
  'task.tree.chatDescription': 'chat',
  'task.tooltip.branch': 'Branch',
  'task.tooltip.progress': 'Progress',
  'task.tooltip.subtasks': 'subtasks',
  'task.tooltip.commits': 'commits vs baseline',
  'task.tooltip.chats': 'chats',

  'chat.untitled': 'Untitled Chat',
  'chat.openTitle': 'Open Cursor Chat',

  'messages.attachCurrent.openChatFirst':
    'Open the Cursor chat you want to attach, then run "Attach Current Chat To Task".',
  'messages.attachCurrent.pickPrompt': 'Select which open chat to attach',
  'messages.attachCurrent.pickTask': 'Select a task to attach this chat to',
  'messages.attachCurrent.success': 'Attached "{name}" to task "{task}".',

  'messages.copyPrompt.missing': 'This chat has no stored initial prompt.',
  'messages.copyPrompt.success': 'Prompt copied to clipboard.',
  'messages.copyTaskPrompt.success': 'Task prompt copied to clipboard.',

  'messages.createTask.titlePrompt': 'Task title',
  'messages.createTask.titlePlaceholder': 'e.g. Add settings panel',
  'messages.createTask.titleValidation': 'Enter a title',
  'messages.createTask.descPrompt': 'Description (optional, empty to skip)',
  'messages.createTask.openFailed': 'Could not open Cursor chat deeplink.',
  'messages.createTask.attachFailed':
    'Opened a new Cursor chat, but could not attach it to the task automatically.',

  'messages.createSubtask.titlePrompt': 'Subtask title',
  'messages.createSubtask.pickParent': 'Select parent task',

  'messages.openTaskChat.openFailed': 'Could not open Cursor chat deeplink.',
  'messages.openTaskChat.attachFailed':
    'Opened a new Cursor chat, but could not attach it to the task automatically.',

  'messages.noWorkspace': 'Open a workspace folder first.',
  'messages.openExisting.failed': 'Could not switch Cursor to chat "{name}".',
  'messages.showTasks.empty': 'No tasks for branch "{branch}". Create one with "Create Task".',
  'messages.showTasks.placeholder': 'Open a chat on branch: {branch}',

  'messages.commitDiff.noStartCommit': 'No baseline commit recorded for this task.',
  'messages.commitDiff.noChanges': 'No file changes since the task baseline.',
  'messages.taskDiff.header': 'Changes for task "{task}" since baseline',
  'messages.branchDiff.noBase': 'Could not find base branch (main / master / develop).',
  'messages.branchDiff.header': 'All changes on branch "{branch}" vs base',

  'messages.renameChat.inputPrompt': 'Custom name for this chat',
  'messages.renameChat.inputPlaceholder': 'e.g. Spike on API shape',
  'messages.renameChat.success': 'Renamed chat to "{name}".',

  'messages.renameTask.inputPrompt': 'Rename task',
  'messages.renameTask.inputPlaceholder': 'Task title',
  'messages.renameTask.inputValidation': 'Enter a title',
  'messages.renameTask.success': 'Renamed task to "{name}".',

  'messages.changeStatus.placeholder': 'Set task status',
  'messages.changeStatus.success': 'Status set to: {status}',

  'messages.changeTaskBranch.inputPrompt': 'Move this task to another branch',
  'messages.changeTaskBranch.inputPlaceholder': 'Target branch name',
  'messages.changeTaskBranch.inputValidation': 'Enter a branch name',
  'messages.changeTaskBranch.success': 'Moved task "{name}" to branch "{branch}".',

  'messages.detach.taskChat': 'Removed chat "{name}" from the task.',
  'messages.detach.task': 'Archived task "{name}".',

  'chat.commitsBadge': '↑{count}',
  'chat.commitsTooltipHeader': '{count} new commit(s) since task baseline:',
  'chat.commitsTooltipMoreFiles': '…and {count} more files',

  'taskDetail.progressLine':
    'Commits vs baseline: {commits}; files changed: {files}; subtasks done: {subDone}/{subTot}; chats: {chats}.',
  'taskDetail.titleLabel': 'Title',
  'taskDetail.statusLabel': 'Status',
  'taskDetail.descriptionLabel': 'Description',
  'taskDetail.save': 'Save',
  'taskDetail.checklist': 'Checklist',
  'taskDetail.emptyChecklist': 'No checklist items yet.',
  'taskDetail.newChecklistPlaceholder': 'New checklist item…',
  'taskDetail.addChecklist': 'Add item',
  'taskDetail.attachments': 'Attachments',
  'taskDetail.emptyAttachments': 'No attached files.',
  'taskDetail.addAttachment': 'Attach workspace file…',
  'taskDetail.attachHint': 'Files are stored as relative paths; they are not copied.',
  'taskDetail.openFile': 'Open',
  'taskDetail.pickFileOpenLabel': 'Attach',
  'taskDetail.editMode': 'Edit',
  'taskDetail.cancelEdit': 'Cancel',
  'taskDetail.metricCommits': 'Commits',
  'taskDetail.metricFiles': 'Changed files',
  'taskDetail.metricSubtasks': 'Subtasks',
  'taskDetail.metricChecklist': 'Checklist',
  'taskDetail.branchLabel': 'Branch',
  'taskDetail.createdAtLabel': 'Created',
  'taskDetail.updatedAtLabel': 'Updated',
  'taskDetail.baselineLabel': 'Baseline commit',
  'taskDetail.mainSection': 'Task details',
  'taskDetail.readOnlyHint': 'Reading mode is active. Switch to edit when you need to make changes.',
  'taskDetail.editingHint': 'Editing mode is active. Save when you are done.',
  'taskDetail.emptyDescription': 'No description yet.',
  'taskDetail.checklistSummary': '{done} of {total} completed',
  'taskDetail.removeChecklistItem': 'Remove checklist item',
  'taskDetail.removeAttachment': 'Remove attachment',
  'messages.taskDetail.openFileFailed': 'Could not open this path.',
  'messages.taskDetail.fileOutsideWorkspace': 'Pick a file inside the workspace folder.',
  'yougile.rootLabel': 'YouGile Tasks',
  'yougile.rootDescription': 'task tree from YouGile API',
  'yougile.taskDescription.open': 'open',
  'yougile.taskDescription.done': 'done',
  'yougile.taskDescription.archived': 'archived',
  'yougile.taskTooltip.taskId': 'Task ID: {id}',
  'yougile.apiKeyMissing':
    'YouGile API key is empty. Set cursorTaskChats.yougile.apiKey in settings.',
  'yougile.requestFailed': 'YouGile API request failed (HTTP {status}).',
  'yougile.invalidJson': 'YouGile API returned invalid JSON.',
  'commands.refreshYougile.title': 'Refresh YouGile Tasks',
  'messages.refreshYougile.success': 'YouGile tasks refreshed.',
};

const ru: Translations = {
  'buildTaskPrompt.branch': 'Ветка: {branchName}',
  'buildTaskPrompt.taskTitle': 'Задача: {title}',
  'buildTaskPrompt.descriptionHeader': 'Описание:',
  'buildTaskPrompt.parent': 'Родительская задача: {title}',
  'buildTaskPrompt.status': 'Статус: {status}',
  'buildTaskPrompt.subtasksSummary': 'Подзадачи: {done}/{total} выполнено',
  'buildTaskPrompt.subtasksMore': '…и ещё {count} подзадач',
  'buildTaskPrompt.progress':
    'Прогресс: {commits} коммит(ов), {files} файл(ов) изменено относительно baseline, {chats} активных чат(ов).',
  'buildTaskPrompt.changedFilesHeader': 'Изменённые файлы (фрагмент):',
  'buildTaskPrompt.changedFilesMore': '…и ещё {count} файлов',
  'buildTaskPrompt.nextStepSubtasks': 'Дальше: закрой оставшиеся подзадачи, затем интеграция и проверка.',
  'buildTaskPrompt.nextStepImplement':
    'Дальше: реализуй задачу небольшими шагами. Предпочитай типобезопасные изменения; без лишних рефакторингов.',
  'buildTaskPrompt.instructions':
    'Работай только в этой git-ветке и в рамках этой задачи. Не трогай посторонний код. Без any/unknown без необходимости.',
  'buildTaskPrompt.checklistHeader': 'Чеклист:',
  'buildTaskPrompt.checklistItem': '- [{done}] {label}',
  'buildTaskPrompt.attachmentsHeader': 'Прикреплённые файлы (пути в workspace):',
  'buildTaskPrompt.attachmentLine': '- {path}',
  'buildTaskPrompt.listMore': '…ещё {count}',

  'task.status.todo': 'к выполнению',
  'task.status.in_progress': 'в работе',
  'task.status.blocked': 'блок',
  'task.status.done': 'готово',
  'task.status.archived': 'архив',

  'task.tree.branchLabel': 'Ветка: {branch}',
  'task.tree.branchDescription': 'задачи для этой ветки',
  'task.tree.chatDescription': 'чат',
  'task.tooltip.branch': 'Ветка',
  'task.tooltip.progress': 'Прогресс',
  'task.tooltip.subtasks': 'подзадач',
  'task.tooltip.commits': 'коммитов от baseline',
  'task.tooltip.chats': 'чатов',

  'chat.untitled': 'Чат без названия',
  'chat.openTitle': 'Открыть чат Cursor',

  'messages.attachCurrent.openChatFirst':
    'Открой нужный чат Cursor, затем запусти "Attach Current Chat To Task".',
  'messages.attachCurrent.pickPrompt': 'Выбери, какой открытый чат привязать',
  'messages.attachCurrent.pickTask': 'Выбери задачу для привязки чата',
  'messages.attachCurrent.success': 'Чат "{name}" привязан к задаче "{task}".',

  'messages.copyPrompt.missing': 'У этого чата нет сохранённого начального prompt.',
  'messages.copyPrompt.success': 'Prompt скопирован в буфер обмена.',
  'messages.copyTaskPrompt.success': 'Prompt задачи скопирован в буфер обмена.',

  'messages.createTask.titlePrompt': 'Название задачи',
  'messages.createTask.titlePlaceholder': 'например, Панель настроек',
  'messages.createTask.titleValidation': 'Введите название',
  'messages.createTask.descPrompt': 'Описание (необязательно, пусто — пропустить)',
  'messages.createTask.openFailed': 'Не удалось открыть deeplink чата Cursor.',
  'messages.createTask.attachFailed':
    'Новый чат Cursor открыт, но автоматически привязать его к задаче не удалось.',

  'messages.createSubtask.titlePrompt': 'Название подзадачи',
  'messages.createSubtask.pickParent': 'Выбери родительскую задачу',

  'messages.openTaskChat.openFailed': 'Не удалось открыть deeplink чата Cursor.',
  'messages.openTaskChat.attachFailed':
    'Новый чат Cursor открыт, но автоматически привязать его к задаче не удалось.',

  'messages.noWorkspace': 'Сначала открой папку workspace.',
  'messages.openExisting.failed': 'Не удалось переключить Cursor на чат "{name}".',
  'messages.showTasks.empty':
    'Для ветки "{branch}" нет задач. Создай задачу через "Create Task".',
  'messages.showTasks.placeholder': 'Открыть чат на ветке: {branch}',

  'messages.commitDiff.noStartCommit': 'Для этой задачи не записан baseline-коммит.',
  'messages.commitDiff.noChanges': 'С момента baseline нет изменений в файлах.',
  'messages.taskDiff.header': 'Изменения задачи "{task}" с момента baseline',
  'messages.branchDiff.noBase': 'Не удалось найти базовую ветку (main / master / develop).',
  'messages.branchDiff.header': 'Все изменения на ветке "{branch}" относительно базы',

  'messages.renameChat.inputPrompt': 'Своё имя для этого чата',
  'messages.renameChat.inputPlaceholder': 'например, Спайк по API',
  'messages.renameChat.success': 'Чат переименован в "{name}".',

  'messages.renameTask.inputPrompt': 'Переименовать задачу',
  'messages.renameTask.inputPlaceholder': 'Название задачи',
  'messages.renameTask.inputValidation': 'Введите название',
  'messages.renameTask.success': 'Задача переименована в "{name}".',

  'messages.changeStatus.placeholder': 'Статус задачи',
  'messages.changeStatus.success': 'Статус: {status}',

  'messages.changeTaskBranch.inputPrompt': 'Перенести задачу на другую ветку',
  'messages.changeTaskBranch.inputPlaceholder': 'Имя целевой ветки',
  'messages.changeTaskBranch.inputValidation': 'Введите имя ветки',
  'messages.changeTaskBranch.success': 'Задача "{name}" перенесена на ветку "{branch}".',

  'messages.detach.taskChat': 'Чат "{name}" убран из задачи.',
  'messages.detach.task': 'Задача "{name}" отправлена в архив.',

  'chat.commitsBadge': '↑{count}',
  'chat.commitsTooltipHeader': '{count} новых коммит(ов) с baseline задачи:',
  'chat.commitsTooltipMoreFiles': '…и ещё {count} файлов',

  'taskDetail.progressLine':
    'Коммитов от baseline: {commits}; файлов изменено: {files}; подзадач готово: {subDone}/{subTot}; чатов: {chats}.',
  'taskDetail.titleLabel': 'Название',
  'taskDetail.statusLabel': 'Статус',
  'taskDetail.descriptionLabel': 'Описание',
  'taskDetail.save': 'Сохранить',
  'taskDetail.checklist': 'Чеклист',
  'taskDetail.emptyChecklist': 'Пунктов чеклиста пока нет.',
  'taskDetail.newChecklistPlaceholder': 'Новый пункт…',
  'taskDetail.addChecklist': 'Добавить',
  'taskDetail.attachments': 'Вложения',
  'taskDetail.emptyAttachments': 'Нет прикреплённых файлов.',
  'taskDetail.addAttachment': 'Прикрепить файл из workspace…',
  'taskDetail.attachHint': 'Хранятся относительные пути; файлы не копируются.',
  'taskDetail.openFile': 'Открыть',
  'taskDetail.pickFileOpenLabel': 'Прикрепить',
  'taskDetail.editMode': 'Редактировать',
  'taskDetail.cancelEdit': 'Отмена',
  'taskDetail.metricCommits': 'Коммиты',
  'taskDetail.metricFiles': 'Изменённые файлы',
  'taskDetail.metricSubtasks': 'Подзадачи',
  'taskDetail.metricChecklist': 'Чеклист',
  'taskDetail.branchLabel': 'Ветка',
  'taskDetail.createdAtLabel': 'Создано',
  'taskDetail.updatedAtLabel': 'Обновлено',
  'taskDetail.baselineLabel': 'Baseline-коммит',
  'taskDetail.mainSection': 'Детали задачи',
  'taskDetail.readOnlyHint': 'Сейчас включён режим просмотра. Для изменений перейди в редактирование.',
  'taskDetail.editingHint': 'Сейчас включён режим редактирования. Сохрани изменения, когда закончишь.',
  'taskDetail.emptyDescription': 'Описание пока не заполнено.',
  'taskDetail.checklistSummary': 'Выполнено {done} из {total}',
  'taskDetail.removeChecklistItem': 'Удалить пункт чеклиста',
  'taskDetail.removeAttachment': 'Удалить вложение',
  'messages.taskDetail.openFileFailed': 'Не удалось открыть путь.',
  'messages.taskDetail.fileOutsideWorkspace': 'Выбери файл внутри папки workspace.',
  'yougile.rootLabel': 'Задачи YouGile',
  'yougile.rootDescription': 'дерево задач из YouGile API',
  'yougile.taskDescription.open': 'открыта',
  'yougile.taskDescription.done': 'выполнена',
  'yougile.taskDescription.archived': 'архив',
  'yougile.taskTooltip.taskId': 'ID задачи: {id}',
  'yougile.apiKeyMissing':
    'Пустой ключ YouGile API. Укажи cursorTaskChats.yougile.apiKey в настройках.',
  'yougile.requestFailed': 'Ошибка запроса к YouGile API (HTTP {status}).',
  'yougile.invalidJson': 'YouGile API вернул невалидный JSON.',
  'commands.refreshYougile.title': 'Обновить задачи YouGile',
  'messages.refreshYougile.success': 'Задачи YouGile обновлены.',
};

const translations = isRussianLanguage() ? ru : en;

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const template = translations[key] ?? en[key];
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, token: string) => params[token] ?? `{${token}}`);
}

export function taskStatusLabel(status: TaskStatus): string {
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

export function taskStatusShortLabel(status: TaskStatus): string {
  switch (status) {
    case 'todo':
      return 'todo';
    case 'in_progress':
      return 'wip';
    case 'blocked':
      return 'blk';
    case 'done':
      return 'done';
    case 'archived':
      return 'arc';
    default:
      return status;
  }
}

function isRussianLanguage(): boolean {
  const language = vscode.env.language?.toLowerCase() ?? 'en';
  return language === 'ru' || language.startsWith('ru-');
}
