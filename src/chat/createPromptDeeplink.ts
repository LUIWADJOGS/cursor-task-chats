import * as vscode from 'vscode';
import { truncateForCursorDeeplink } from './promptTruncate';

const BASE_URL = 'cursor://anysphere.cursor-deeplink/prompt';

/** Safe max length for URL-encoded `text` query value. */
export function getMaxEncodedPromptLength(): number {
  return 8000 - BASE_URL.length - 10;
}

export function createPromptDeeplink(promptText: string): string {
  const maxLength = getMaxEncodedPromptLength();
  const safe = truncateForCursorDeeplink(promptText, maxLength);
  const encoded = encodeURIComponent(safe);
  return `${BASE_URL}?text=${encoded}`;
}

export async function openPromptInCursor(promptText: string): Promise<boolean> {
  const link = createPromptDeeplink(promptText);
  return vscode.env.openExternal(vscode.Uri.parse(link));
}
