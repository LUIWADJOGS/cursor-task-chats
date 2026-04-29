import * as vscode from 'vscode';
import { openTaskRepository } from '../db/taskRepository';
import { getCurrentBranch, getHeadCommit } from '../git/getCurrentBranch';
import type { YouGileTask } from '../integrations/yougileClient';
import { toUnifiedYouGileTask } from '../providers/yougileAdapter';
import type { ProviderId, UnifiedTaskRef } from '../providers/types';
import type { TaskEntity } from '../types/taskManager';

export async function ensureLinkedLocalTaskForProviderTask(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  provider: ProviderId,
  remoteTask: UnifiedTaskRef
): Promise<{ task: TaskEntity; created: boolean }> {
  const repo = await openTaskRepository(context, folder);
  const branch = await getCurrentBranch(folder);
  const baselineCommitHash = (await getHeadCommit(folder.uri.fsPath)) ?? undefined;
  return repo.ensureLinkedLocalTaskForProviderTask({
    provider,
    remoteTask,
    branchName: branch,
    baselineCommitHash,
  });
}

export async function ensureLinkedLocalTaskForYouGileTask(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  task: YouGileTask
): Promise<{ task: TaskEntity; created: boolean }> {
  return ensureLinkedLocalTaskForProviderTask(context, folder, 'yougile', toUnifiedYouGileTask(task));
}
