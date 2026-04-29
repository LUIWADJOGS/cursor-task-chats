import {
  getYouGileTaskById,
  getYouGileTaskSourceData,
  getYouGileUsers,
  type YouGileBoard,
  type YouGileColumn,
  type YouGileProject,
  type YouGileTask,
} from '../integrations/yougileClient';
import type {
  ProviderCapability,
  ProviderTreeData,
  TaskProviderAdapter,
  UnifiedTask,
  UnifiedUser,
} from './types';

export interface YouGileProviderTreeData extends ProviderTreeData {
  tasks: UnifiedTask[];
  yougile: {
    tasks: YouGileTask[];
    columns: YouGileColumn[];
    boards: YouGileBoard[];
    projects: YouGileProject[];
  };
}

const capabilities = {
  timeTracking: true,
  startStopTimer: true,
  assigneeFilter: true,
  writeBack: false,
  attachments: false,
};

export class YouGileAdapter implements TaskProviderAdapter<YouGileProviderTreeData> {
  readonly providerId = 'yougile' as const;
  readonly capabilities = capabilities;

  async listTree(): Promise<YouGileProviderTreeData> {
    const source = await getYouGileTaskSourceData();
    return {
      tasks: source.tasks.map((task) => toUnifiedYouGileTask(task)),
      projects: source.projects.map((project) => ({
        provider: 'yougile',
        id: project.id,
        title: project.title,
        raw: project.raw,
      })),
      columns: source.columns.map((column) => ({
        provider: 'yougile',
        id: column.id,
        title: column.title,
        projectId: column.boardId,
        raw: column.raw,
      })),
      yougile: source,
    };
  }

  async getTaskById(taskId: string): Promise<UnifiedTask | undefined> {
    const task = await getYouGileTaskById(taskId);
    return task ? toUnifiedYouGileTask(task) : undefined;
  }

  async getTask(taskId: string): Promise<UnifiedTask | undefined> {
    return this.getTaskById(taskId);
  }

  async searchUsers(query: string): Promise<UnifiedUser[]> {
    const normalized = query.trim().toLocaleLowerCase();
    const users = await getYouGileUsers();
    return users
      .filter((user) => {
        if (!normalized) {
          return true;
        }
        return [user.realName, user.name, user.email, user.id]
          .filter((entry): entry is string => Boolean(entry))
          .some((entry) => entry.toLocaleLowerCase().includes(normalized));
      })
      .map((user) => ({
        provider: 'yougile',
        id: user.id,
        displayName: user.realName ?? user.name ?? user.email ?? user.id,
        email: user.email,
        raw: user.raw,
      }));
  }

  supports(feature: ProviderCapability): boolean {
    return this.capabilities[feature];
  }
}

export function toUnifiedYouGileTask(task: YouGileTask): UnifiedTask {
  return {
    provider: 'yougile',
    id: task.id,
    remoteId: task.id,
    title: task.title,
    description: task.description,
    status: task.archived ? 'archived' : task.completed ? 'done' : 'open',
    parentId: task.parentTaskId,
    path: [task.title],
    raw: task,
  };
}
