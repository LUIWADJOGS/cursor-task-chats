export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'archived';

export type TaskChatStatus = 'active' | 'archived';

export interface TaskEntity {
  id: string;
  workspaceFolder: string;
  branchName: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  baselineCommitHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskChatEntity {
  id: string;
  taskId: string;
  composerId: string;
  promptText?: string;
  cachedName?: string;
  customName?: string;
  createdAt: string;
  updatedAt: string;
  status: TaskChatStatus;
}

export const TASK_REGISTRY_SCHEMA_VERSION = 1 as const;

export interface TaskRegistryData {
  version: typeof TASK_REGISTRY_SCHEMA_VERSION;
  tasks: TaskEntity[];
  chats: TaskChatEntity[];
}

export interface TaskProgressSummary {
  commitCount: number;
  changedFiles: string[];
  activeChatCount: number;
  totalSubtasks: number;
  doneSubtasks: number;
}

export interface TaskChecklistItem {
  id: string;
  taskId: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

export interface TaskAttachmentEntity {
  id: string;
  taskId: string;
  pathRelative: string;
  note?: string;
  createdAt: string;
}
