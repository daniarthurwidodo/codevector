import * as vscode from 'vscode';
import type { GetIndexStatusUseCase } from '../../application';

/**
 * Command handler for showing index status
 */
export class StatusCommand {
  private useCase: GetIndexStatusUseCase;

  constructor(useCase: GetIndexStatusUseCase) {
    this.useCase = useCase;
  }

  /**
   * Execute the status command
   */
  async execute(): Promise<void> {
    try {
      const status = await this.useCase.execute();

      let message = `**Index Status**\n\n`;

      if (!status.isIndexed) {
        message += '⚠️ Workspace not indexed yet.\n\n';
        message += 'Run "Codebase Intelligence: Index Workspace" to start indexing.';
      } else {
        message += `✅ **Indexed**\n\n`;
        message += `| Metric | Value |\n`;
        message += `|--------|-------|\n`;
        message += `| Files | ${status.totalFiles} |\n`;
        message += `| Chunks | ${status.totalChunks} |\n`;
        message += `| Symbols | ${status.totalSymbols} |\n`;
        message += `| Last Indexed | ${this.formatDate(status.lastIndexedAt)} |\n\n`;

        message += `**Vector Index**\n\n`;
        message += `| Metric | Value |\n`;
        message += `|--------|-------|\n`;
        message += `| Vectors | ${status.vectorIndexStats.totalVectors} |\n`;
        message += `| Dimensions | ${status.vectorIndexStats.dimensions} |\n`;
        message += `| Size | ${this.formatBytes(status.vectorIndexStats.indexSize)} |\n\n`;

        message += `**BM25 Index**\n\n`;
        message += `| Metric | Value |\n`;
        message += `|--------|-------|\n`;
        message += `| Documents | ${status.bm25Stats.totalDocs} |\n`;
        message += `| Terms | ${status.bm25Stats.totalTerms} |\n`;
        message += `| Avg Doc Length | ${Math.round(status.bm25Stats.avgDocLength)} tokens |\n\n`;

        message += `**Embedding Service**\n\n`;
        message += `- Cache Size: ${status.embeddingCacheStats.cacheSize} entries\n`;
        message += `- Queue Length: ${status.embeddingCacheStats.queueLength}\n`;
        message += `- Worker Available: ${status.embeddingCacheStats.workerAvailable ? '✅' : '❌'}\n`;
      }

      vscode.window.showInformationMessage(message, { modal: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to get status: ${errorMessage}`);
    }
  }

  /**
   * Format date from timestamp
   */
  private formatDate(timestamp: number): string {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}
