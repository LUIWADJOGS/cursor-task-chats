import { t, taskStatusLabel } from '../i18n';
import type { TaskChecklistItem, TaskEntity, TaskProgressSummary } from '../types/taskManager';

export interface BuildTaskPromptParams {
  branchName: string;
  task: TaskEntity;
  parentTask?: TaskEntity | null;
  directSubtasks: TaskEntity[];
  progress: TaskProgressSummary;
  checklist?: TaskChecklistItem[];
  attachmentPaths?: string[];
}

export function buildTaskPrompt(params: BuildTaskPromptParams): string {
  const { branchName, task, parentTask, directSubtasks, progress, checklist, attachmentPaths } =
    params;
  const lines: string[] = [];

  lines.push(t('buildTaskPrompt.branch', { branchName }));
  lines.push(t('buildTaskPrompt.taskTitle', { title: task.title }));
  if (task.description?.trim()) {
    lines.push('');
    lines.push(t('buildTaskPrompt.descriptionHeader'));
    lines.push(task.description.trim());
  }
  if (parentTask) {
    lines.push('');
    lines.push(t('buildTaskPrompt.parent', { title: parentTask.title }));
  }
  lines.push('');
  lines.push(t('buildTaskPrompt.status', { status: taskStatusLabel(task.status) }));

  const pending = directSubtasks.filter((s) => s.status !== 'done' && s.status !== 'archived');
  const done = directSubtasks.filter((s) => s.status === 'done');
  if (directSubtasks.length > 0) {
    lines.push('');
    lines.push(
      t('buildTaskPrompt.subtasksSummary', {
        done: String(done.length),
        total: String(directSubtasks.length),
      })
    );
    const maxList = 12;
    for (const st of directSubtasks.slice(0, maxList)) {
      lines.push(`- [${taskStatusLabel(st.status)}] ${st.title}`);
    }
    if (directSubtasks.length > maxList) {
      lines.push(t('buildTaskPrompt.subtasksMore', { count: String(directSubtasks.length - maxList) }));
    }
  }

  lines.push('');
  lines.push(
    t('buildTaskPrompt.progress', {
      commits: String(progress.commitCount),
      files: String(progress.changedFiles.length),
      chats: String(progress.activeChatCount),
    })
  );

  const checklistItems = checklist ?? [];
  if (checklistItems.length > 0) {
    lines.push('');
    lines.push(t('buildTaskPrompt.checklistHeader'));
    const maxCl = 25;
    for (const c of checklistItems.slice(0, maxCl)) {
      lines.push(
        t('buildTaskPrompt.checklistItem', {
          done: c.done ? 'x' : ' ',
          label: c.label,
        })
      );
    }
    if (checklistItems.length > maxCl) {
      lines.push(t('buildTaskPrompt.listMore', { count: String(checklistItems.length - maxCl) }));
    }
  }

  const attPaths = attachmentPaths ?? [];
  if (attPaths.length > 0) {
    lines.push('');
    lines.push(t('buildTaskPrompt.attachmentsHeader'));
    const maxAtt = 20;
    for (const p of attPaths.slice(0, maxAtt)) {
      lines.push(t('buildTaskPrompt.attachmentLine', { path: p }));
    }
    if (attPaths.length > maxAtt) {
      lines.push(t('buildTaskPrompt.listMore', { count: String(attPaths.length - maxAtt) }));
    }
  }

  const maxFiles = 15;
  const files = progress.changedFiles.slice(0, maxFiles);
  if (files.length > 0) {
    lines.push('');
    lines.push(t('buildTaskPrompt.changedFilesHeader'));
    for (const f of files) {
      lines.push(`- ${f}`);
    }
    if (progress.changedFiles.length > maxFiles) {
      lines.push(
        t('buildTaskPrompt.changedFilesMore', {
          count: String(progress.changedFiles.length - maxFiles),
        })
      );
    }
  }

  if (pending.length > 0) {
    lines.push('');
    lines.push(t('buildTaskPrompt.nextStepSubtasks'));
  } else {
    lines.push('');
    lines.push(t('buildTaskPrompt.nextStepImplement'));
  }

  lines.push('');
  lines.push(t('buildTaskPrompt.instructions'));

  return lines.join('\n');
}
