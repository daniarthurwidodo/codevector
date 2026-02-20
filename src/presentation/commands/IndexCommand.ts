import * as vscode from 'vscode';
import type { IndexWorkspaceUseCase } from '../../application';

/**
 * Command handler for indexing the workspace
 */
export class IndexCommand {
  private useCase: IndexWorkspaceUseCase;
  private statusBarItem: vscode.StatusBarItem;

  constructor(useCase: IndexWorkspaceUseCase) {
    this.useCase = useCase;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
  }

  /**
   * Execute the index command
   */
  async execute(): Promise<void> {
    const workspaceRoots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) || [];

    if (workspaceRoots.length === 0) {
      vscode.window.showWarningMessage('No workspace folders open. Please open a folder first.');
      return;
    }

    const config = vscode.workspace.getConfiguration('codebaseSearch');
    const excludeGlobs = config.get<string[]>('excludeGlobs') || [];
    const batchSize = config.get<number>('batchSize') || 32;

    // Show progress
    this.statusBarItem.text = '$(sync~spin) Indexing...';
    this.statusBarItem.show();

    try {
      const result = await this.useCase.execute({
        workspaceRoots,
        excludeGlobs,
        batchSize,
        onProgress: (progress) => {
          this.statusBarItem.text = `$(sync~spin) Indexing: ${progress.indexed}/${progress.total}`;
        },
      });

      this.statusBarItem.hide();

      // Show result
      let message = `Indexing complete!\n\n`;
      message += `Indexed: ${result.indexedFiles} files\n`;
      message += `Chunks: ${result.totalChunks}\n`;
      message += `Skipped: ${result.skippedFiles} (unchanged)`;

      if (result.errors.length > 0) {
        message += `\n\nErrors: ${result.errors.length}`;
      }

      vscode.window.showInformationMessage(message);
    } catch (error) {
      this.statusBarItem.hide();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Indexing failed: ${errorMessage}`);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
