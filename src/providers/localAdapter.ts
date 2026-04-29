import type { ProviderCapability, ProviderTreeData, TaskProviderAdapter, UnifiedTask, UnifiedUser } from './types';

const capabilities = {
  timeTracking: false,
  startStopTimer: false,
  assigneeFilter: false,
  writeBack: true,
  attachments: true,
};

export class LocalTaskAdapter implements TaskProviderAdapter {
  readonly providerId = 'local' as const;
  readonly capabilities = capabilities;

  async listTree(): Promise<ProviderTreeData> {
    return { tasks: [] };
  }

  async getTaskById(taskId: string): Promise<UnifiedTask | undefined> {
    void taskId;
    return undefined;
  }

  async getTask(taskId: string): Promise<UnifiedTask | undefined> {
    return this.getTaskById(taskId);
  }

  async searchUsers(query: string): Promise<UnifiedUser[]> {
    void query;
    return [];
  }

  supports(feature: ProviderCapability): boolean {
    return this.capabilities[feature];
  }
}
