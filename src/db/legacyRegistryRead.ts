import * as vscode from 'vscode';
import type { TaskRegistryData } from '../types/taskManager';
import { TASK_REGISTRY_SCHEMA_VERSION } from '../types/taskManager';

export const LEGACY_GLOBAL_STATE_KEY = 'cursorTaskChats.registry';

export function readLegacyTaskRegistry(memento: vscode.Memento): TaskRegistryData | null {
  const raw = memento.get<TaskRegistryData>(LEGACY_GLOBAL_STATE_KEY);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks) || !Array.isArray(raw.chats)) {
    return null;
  }
  if (raw.version !== TASK_REGISTRY_SCHEMA_VERSION) {
    return null;
  }
  return raw;
}
