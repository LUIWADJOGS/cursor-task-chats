import { getCommitDiffSince } from '../git/commitDiff';
import type { TaskChatEntity, TaskEntity, TaskProgressSummary } from '../types/taskManager';

export async function computeTaskProgressSummary(
  workspacePath: string,
  task: TaskEntity,
  allTasks: TaskEntity[],
  chats: TaskChatEntity[]
): Promise<TaskProgressSummary> {
  const subtasks = allTasks.filter(
    (t) => t.parentTaskId === task.id && t.status !== 'archived'
  );
  const doneSubtasks = subtasks.filter((s) => s.status === 'done').length;
  const activeChatCount = chats.filter((c) => c.taskId === task.id && c.status === 'active').length;

  const baseline = task.baselineCommitHash;
  if (!baseline) {
    return {
      commitCount: 0,
      changedFiles: [],
      activeChatCount,
      totalSubtasks: subtasks.length,
      doneSubtasks,
    };
  }

  const diff = await getCommitDiffSince(workspacePath, baseline);
  return {
    commitCount: diff.commitCount,
    changedFiles: diff.changedFiles,
    activeChatCount,
    totalSubtasks: subtasks.length,
    doneSubtasks,
  };
}
