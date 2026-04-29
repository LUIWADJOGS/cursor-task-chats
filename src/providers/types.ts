import type { TaskEntity } from '../types/taskManager';

export type ProviderId = 'local' | 'yougile' | 'youtrack' | 'bitrix24';

export type ProviderCapability =
  | 'timeTracking'
  | 'startStopTimer'
  | 'assigneeFilter'
  | 'writeBack'
  | 'attachments';

export type ProviderCapabilities = Readonly<Record<ProviderCapability, boolean>>;

export interface UnifiedTaskRef {
  provider: ProviderId;
  id: string;
  remoteId: string;
  title: string;
  description?: string;
  externalUrl?: string;
}

export interface UnifiedProject {
  provider: ProviderId;
  id: string;
  title: string;
  raw?: unknown;
}

export interface UnifiedColumn {
  provider: ProviderId;
  id: string;
  title: string;
  projectId?: string;
  raw?: unknown;
}

export interface UnifiedUser {
  provider: ProviderId;
  id: string;
  displayName: string;
  email?: string;
  raw?: unknown;
}

export interface UnifiedTimeRecord {
  provider: ProviderId;
  id: string;
  taskId: string;
  userId?: string;
  date?: string;
  durationSeconds: number;
  raw?: unknown;
}

export interface UnifiedTask extends UnifiedTaskRef {
  status: 'open' | 'done' | 'archived';
  parentId?: string;
  path: string[];
  raw?: unknown;
}

export interface LocalTaskMeta {
  providerTaskKey: string;
  branch?: string;
  linkedChats: number;
  baselineCommitHash?: string;
}

export interface UnifiedTimeStats {
  totalSpentSeconds: number;
  records?: UnifiedTimeRecord[];
}

export interface ProviderTreeData {
  tasks: UnifiedTask[];
  projects?: UnifiedProject[];
  columns?: UnifiedColumn[];
}

export interface EnsureLinkedLocalTaskInput {
  provider: ProviderId;
  remoteTask: UnifiedTaskRef;
  branchName: string;
  baselineCommitHash?: string;
}

export interface TaskProviderAdapter<TTreeData extends ProviderTreeData = ProviderTreeData> {
  readonly providerId: ProviderId;
  readonly capabilities: ProviderCapabilities;
  listTree(): Promise<TTreeData>;
  getTask(taskId: string): Promise<UnifiedTask | undefined>;
  getTaskById(taskId: string): Promise<UnifiedTask | undefined>;
  searchUsers(query: string): Promise<UnifiedUser[]>;
  supports(feature: ProviderCapability): boolean;
  getTimeStats?(taskIds: string[]): Promise<Map<string, UnifiedTimeStats>>;
  ensureLinkedLocalTask?(
    input: Omit<EnsureLinkedLocalTaskInput, 'provider'>
  ): Promise<{ task: TaskEntity; created: boolean }>;
}

export interface UnifiedTaskNode {
  readonly taskRef: UnifiedTaskRef;
}

export function providerTaskKey(provider: ProviderId, remoteId: string): string {
  return `${provider}:${remoteId}`;
}
