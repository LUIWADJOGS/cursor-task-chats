import * as vscode from 'vscode';
import { getActiveComposerId } from './composerStorage';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openComposerWithCursorCommand(
  context: vscode.ExtensionContext,
  composerId: string
): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes('composer.openComposer')) {
    return false;
  }

  for (const options of [{ view: 'pane' }, { view: 'editor', openInNewTab: true }]) {
    try {
      await vscode.commands.executeCommand('composer.openComposer', composerId, options);
      await delay(200);

      if (await isComposerOpen(context, composerId)) {
        return true;
      }
    } catch {
      // Ignore missing or rejected internal Cursor commands and try the fallback path.
    }
  }

  return false;
}

async function isComposerOpen(context: vscode.ExtensionContext, composerId: string): Promise<boolean> {
  if ((await getActiveComposerId(context)) === composerId) {
    return true;
  }

  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (!activeEditorUri) {
    return false;
  }

  return (
    activeEditorUri.path === composerId ||
    activeEditorUri.path.endsWith(`/${composerId}`) ||
    activeEditorUri.toString().includes(composerId)
  );
}
