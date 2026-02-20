import * as vscode from 'vscode';
import type { SearchUseCase } from '../../application';
import type { SearchQuery } from '../../domain';

/**
 * Command handler for searching the codebase
 */
export class SearchCommand {
  private useCase: SearchUseCase;

  constructor(useCase: SearchUseCase) {
    this.useCase = useCase;
  }

  /**
   * Execute the search command
   */
  async execute(): Promise<void> {
    // Show input box for search query
    const query = await vscode.window.showInputBox({
      prompt: 'Search codebase',
      placeHolder: 'Enter search query...',
      ignoreFocusOut: true,
    });

    if (!query) {
      return;
    }

    // Get configuration
    const config = vscode.workspace.getConfiguration('codebaseSearch');
    const bm25Weight = config.get<number>('bm25Weight') || 0.5;
    const topK = 10; // Default results

    // Show progress
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Searching codebase...',
        cancellable: false,
      },
      async () => {
        try {
          const searchQuery: SearchQuery = {
            query,
            topK,
            bm25Weight,
          };

          const results = await this.useCase.execute(searchQuery);

          if (results.results.length === 0) {
            vscode.window.showInformationMessage('No results found.');
            return;
          }

          // Show results in webview panel
          this.showResultsPanel(query, results);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(`Search failed: ${errorMessage}`);
        }
      }
    );
  }

  /**
   * Show results in a webview panel
   */
  private showResultsPanel(query: string, results: any): void {
    const panel = vscode.window.createWebviewPanel(
      'codevectorSearch',
      `Search: ${query}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    const resultsHtml = results.results
      .map((result: any) => {
        const scorePercent = Math.round(result.score * 100);
        return `
          <div class="result">
            <div class="result-header">
              <span class="file-path">${this.escapeHtml(result.chunk.filePath)}</span>
              <span class="score">${scorePercent}% match</span>
            </div>
            <div class="result-location">
              Lines ${result.chunk.startLine}-${result.chunk.endLine}
            </div>
            <pre class="code">${this.escapeHtml(result.chunk.content)}</pre>
          </div>
        `;
      })
      .join('');

    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Search Results</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          h2 {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
          }
          .result {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
          }
          .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          .file-path {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
          }
          .score {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
          }
          .result-location {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
          }
          .code {
            background: var(--vscode-textBlockQuote-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            max-height: 300px;
            overflow-y: auto;
          }
        </style>
      </head>
      <body>
        <h2>Search Results for "${this.escapeHtml(query)}"</h2>
        <p>Found ${results.results.length} results</p>
        ${resultsHtml}
      </body>
      </html>
    `;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
