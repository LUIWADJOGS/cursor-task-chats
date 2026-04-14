import * as vscode from 'vscode';
import { buildTaskPrompt } from '../chat/buildTaskPrompt';
import { openTaskRepository } from '../db/taskRepository';
import { computeTaskProgressSummary } from './taskProgress';
import type { TaskEntity } from '../types/taskManager';

export async function buildPromptTextForTask(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  task: TaskEntity
): Promise<string> {
  const repo = await openTaskRepository(context, folder);
  const allTasks = repo.getAllTasks();
  const allChats = repo.getAllChats();
  const parent = task.parentTaskId ? repo.getTaskById(task.parentTaskId) : null;
  const directSubtasks = allTasks.filter(
    (x) => x.parentTaskId === task.id && x.status !== 'archived'
  );
  const progress = await computeTaskProgressSummary(folder.uri.fsPath, task, allTasks, allChats);
  const checklist = repo.getChecklist(task.id);
  const attachmentPaths = repo.getAttachments(task.id).map((a) => a.pathRelative);
  return buildTaskPrompt({
    branchName: task.branchName,
    task,
    parentTask: parent,
    directSubtasks,
    progress,
    checklist,
    attachmentPaths,
  });
}
