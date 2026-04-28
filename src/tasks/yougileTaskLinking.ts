import * as vscode from 'vscode';
import { openTaskRepository } from '../db/taskRepository';
import { getCurrentBranch, getHeadCommit } from '../git/getCurrentBranch';
import type { YouGileTask } from '../integrations/yougileClient';
import type { TaskEntity } from '../types/taskManager';

export async function ensureLinkedLocalTaskForYouGileTask(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  task: YouGileTask
): Promise<{ task: TaskEntity; created: boolean }> {
  const repo = await openTaskRepository(context, folder);
  const branch = await getCurrentBranch(folder);
  const baselineCommitHash = (await getHeadCommit(folder.uri.fsPath)) ?? undefined;
  return repo.ensureLinkedLocalTask({
    yougileTaskId: task.id,
    title: task.title,
    description: task.description,
    branchName: branch,
    baselineCommitHash,
  });
}
