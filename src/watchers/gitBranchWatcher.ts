import * as vscode from 'vscode';
import { openTaskRepository } from '../db/taskRepository';
import { getCurrentBranch } from '../git/getCurrentBranch';

export function registerGitBranchWatcher(
  context: vscode.ExtensionContext,
  onBranchMaybeChanged: () => void
): void {
  const folder = () => vscode.workspace.workspaceFolders?.[0];
  let lastBranch: string | null = null;

  const checkAndNotify = async (): Promise<void> => {
    const f = folder();
    if (!f) {
      return;
    }
    const branch = await getCurrentBranch(f);
    const isSwitch = lastBranch !== null && lastBranch !== branch;
    lastBranch = branch;
    if (isSwitch) {
      onBranchMaybeChanged();
      const repo = await openTaskRepository(context, f);
      const roots = repo.getRootTasksForBranch(branch);
      if (roots.length > 0) {
        void vscode.window.showInformationMessage(
          `Branch: ${branch}. Root tasks: ${roots.length}.`
        );
      }
    }
  };

  const watcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');
  watcher.onDidChange(checkAndNotify);
  watcher.onDidCreate(checkAndNotify);
  watcher.onDidDelete(checkAndNotify);

  void checkAndNotify();

  context.subscriptions.push(watcher);
}
