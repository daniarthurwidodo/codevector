import * as vscode from 'vscode';
import { IndexWorkspaceUseCase, SearchUseCase, GetIndexStatusUseCase, ReindexFileUseCase } from './application';
import { BM25Index } from './infrastructure/bm25';
import { WasmHNSWVectorIndex } from './infrastructure/vector';
import { TreeSitterChunker } from './infrastructure/chunker';
import { EmbeddingService } from './infrastructure/embeddings';
import { MetadataRepository } from './infrastructure/metadata';
import { IndexCommand, SearchCommand, StatusCommand } from './presentation/commands';
import { MCPServer } from './mcp/server';
import * as path from 'path';

/**
 * Service container for dependency injection
 */
class ServiceContainer {
  public metadataRepo: MetadataRepository;
  public bm25Index: BM25Index;
  public vectorIndex: WasmHNSWVectorIndex;
  public chunker: TreeSitterChunker;
  public embeddingService: EmbeddingService;

  public indexUseCase: IndexWorkspaceUseCase;
  public searchUseCase: SearchUseCase;
  public statusUseCase: GetIndexStatusUseCase;
  public reindexUseCase: ReindexFileUseCase;

  public indexCommand: IndexCommand;
  public searchCommand: SearchCommand;
  public statusCommand: StatusCommand;

  public mcpServer: MCPServer;

  constructor(storagePath: string) {
    // Infrastructure layer
    this.metadataRepo = new MetadataRepository(path.join(storagePath, 'metadata.json'));
    this.bm25Index = new BM25Index();
    this.vectorIndex = new WasmHNSWVectorIndex();
    this.chunker = new TreeSitterChunker();
    this.embeddingService = new EmbeddingService();

    // Application layer
    const useCaseParams = {
      chunker: this.chunker,
      embeddingService: this.embeddingService,
      vectorIndex: this.vectorIndex,
      bm25Index: this.bm25Index,
      metadataRepo: this.metadataRepo,
    };

    this.indexUseCase = new IndexWorkspaceUseCase(useCaseParams);
    this.searchUseCase = new SearchUseCase(useCaseParams);
    this.statusUseCase = new GetIndexStatusUseCase(useCaseParams);
    this.reindexUseCase = new ReindexFileUseCase(useCaseParams);

    // Presentation layer
    this.indexCommand = new IndexCommand(this.indexUseCase);
    this.searchCommand = new SearchCommand(this.searchUseCase);
    this.statusCommand = new StatusCommand(this.statusUseCase);

    // MCP server
    this.mcpServer = new MCPServer({
      searchUseCase: this.searchUseCase,
      statusUseCase: this.statusUseCase,
    });
  }

  async initialize(): Promise<void> {
    await this.metadataRepo.initialize();
  }

  async dispose(): Promise<void> {
    await this.embeddingService.dispose();
    await this.mcpServer.stop();
    this.indexCommand.dispose();
  }
}

let container: ServiceContainer | undefined;

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Codevector] Activating...');

  try {
    // Initialize service container
    container = new ServiceContainer(context.storagePath || context.globalStoragePath);
    await container.initialize();

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('codevector.indexWorkspace', () => {
        container?.indexCommand.execute();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('codevector.search', () => {
        container?.searchCommand.execute();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('codevector.showIndexStatus', () => {
        container?.statusCommand.execute();
      })
    );

    // Register file watcher for incremental indexing
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{js,jsx,ts,tsx,py,rs,go}');
    
    watcher.onDidChange(async (uri) => {
      if (container && shouldIndexFile(uri.fsPath)) {
        await container.reindexUseCase.execute(uri.fsPath);
      }
    });

    watcher.onDidCreate(async (uri) => {
      if (container && shouldIndexFile(uri.fsPath)) {
        await container.reindexUseCase.execute(uri.fsPath);
      }
    });

    watcher.onDidDelete(async (uri) => {
      // Handle file deletion if needed
    });

    context.subscriptions.push(watcher);

    // Start MCP server
    await container.mcpServer.start();

    // Auto-index on activation if workspace exists
    const workspaceRoots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath);
    if (workspaceRoots && workspaceRoots.length > 0) {
      const status = await container.statusUseCase.execute();
      if (!status.isIndexed) {
        vscode.window.showInformationMessage(
          'Codebase not indexed. Run "Codebase Intelligence: Index Workspace" to enable search.',
          'Index Now'
        ).then((selection) => {
          if (selection === 'Index Now') {
            container?.indexCommand.execute();
          }
        });
      }
    }

    console.log('[Codevector] Activated successfully');
  } catch (error) {
    console.error('[Codevector] Activation failed:', error);
    vscode.window.showErrorMessage(
      `Codevector activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if file should be indexed
 */
function shouldIndexFile(filePath: string): boolean {
  const excludePatterns = [
    /node_modules/,
    /\.git/,
    /dist/,
    /build/,
    /\.min\.js$/,
    /vendor/,
  ];

  return !excludePatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
  console.log('[Codevector] Deactivating...');
  await container?.dispose();
  container = undefined;
}
