import * as https from 'https';
import * as vscode from 'vscode';
import { t } from '../i18n';

const DEFAULT_API_BASE_URL = 'https://ru.yougile.com/api-v2';

export interface YouGileTask {
  id: string;
  title: string;
  description?: string;
  parentTaskId?: string;
  completed?: boolean;
  archived?: boolean;
  raw: Record<string, unknown>;
}

type YouGileListEnvelope = {
  content?: unknown;
  items?: unknown;
  data?: unknown;
  tasks?: unknown;
};

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function parseTask(rawTask: unknown): YouGileTask | null {
  const raw = asRecord(rawTask);
  if (!raw) {
    return null;
  }

  const id = asString(raw.id) ?? asString(raw.taskId) ?? asString(raw.key);
  if (!id) {
    return null;
  }

  const parentByObject = asRecord(raw.parentTask)?.id ?? asRecord(raw.parent)?.id;
  const parentTaskId =
    asString(raw.parentTaskId) ?? asString(raw.parentId) ?? asString(parentByObject);

  const title =
    asString(raw.title) ??
    asString(raw.name) ??
    asString(raw.summary) ??
    asString(raw.taskNumber) ??
    id;

  return {
    id,
    title,
    description: asString(raw.description),
    parentTaskId,
    completed: toBoolean(raw.completed),
    archived: toBoolean(raw.archived),
    raw,
  };
}

function extractTaskArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const envelope = asRecord(payload) as YouGileListEnvelope | null;
  if (!envelope) {
    return [];
  }

  const candidates = [envelope.content, envelope.items, envelope.data, envelope.tasks];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function requestJson<T>(url: URL, apiKey: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode > 299) {
            reject(new Error(t('yougile.requestFailed', { status: String(res.statusCode ?? 'unknown') })));
            return;
          }
          try {
            resolve((text ? JSON.parse(text) : {}) as T);
          } catch {
            reject(new Error(t('yougile.invalidJson')));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.end();
  });
}

export function getTaskSource(): 'local' | 'yougile' {
  const value = vscode.workspace.getConfiguration('cursorTaskChats').get<string>('integration.source');
  return value === 'yougile' ? 'yougile' : 'local';
}

export function getYouGileConfig(): { apiBaseUrl: string; apiKey: string } {
  const config = vscode.workspace.getConfiguration('cursorTaskChats');
  const apiBaseUrl = normalizeBaseUrl(
    config.get<string>('yougile.apiBaseUrl') ?? DEFAULT_API_BASE_URL
  );
  const apiKey = config.get<string>('yougile.apiKey')?.trim() ?? '';
  return { apiBaseUrl, apiKey };
}

export async function getYouGileTasks(): Promise<YouGileTask[]> {
  const { apiBaseUrl, apiKey } = getYouGileConfig();
  if (!apiKey) {
    throw new Error(t('yougile.apiKeyMissing'));
  }

  const url = new URL('/tasks', `${apiBaseUrl}/`);
  const payload = await requestJson<unknown>(url, apiKey);
  const tasks = extractTaskArray(payload)
    .map((entry) => parseTask(entry))
    .filter((entry): entry is YouGileTask => Boolean(entry));
  return tasks;
}
