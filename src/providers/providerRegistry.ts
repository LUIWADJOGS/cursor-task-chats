import * as vscode from 'vscode';
import type { ProviderId, TaskProviderAdapter } from './types';

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderId, TaskProviderAdapter>();

  register(adapter: TaskProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  get(providerId: ProviderId): TaskProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`Task provider is not registered: ${providerId}`);
    }
    return adapter;
  }

  getActiveProviderId(): ProviderId {
    return getConfiguredProviderId();
  }

  getActive(): TaskProviderAdapter {
    return this.get(this.getActiveProviderId());
  }
}

export function getConfiguredProviderId(): ProviderId {
  const value = vscode.workspace.getConfiguration('cursorTaskChats').get<string>('integration.source');
  switch (value) {
    case 'yougile':
    case 'youtrack':
    case 'bitrix24':
      return value;
    default:
      return 'local';
  }
}
