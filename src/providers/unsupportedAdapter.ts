import type {
  ProviderCapability,
  ProviderId,
  ProviderTreeData,
  TaskProviderAdapter,
  UnifiedTask,
  UnifiedUser,
} from './types';

const capabilities = {
  timeTracking: false,
  startStopTimer: false,
  assigneeFilter: false,
  writeBack: false,
  attachments: false,
};

export class UnsupportedProviderAdapter implements TaskProviderAdapter {
  readonly capabilities = capabilities;

  constructor(public readonly providerId: Exclude<ProviderId, 'local' | 'yougile'>) {}

  async listTree(): Promise<ProviderTreeData> {
    throw new Error(`Task provider is not implemented yet: ${this.providerId}`);
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
