import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { SearchUseCase, GetIndexStatusUseCase } from '../application';
import { createSearchQuery } from '../domain';

/**
 * MCP Server for Codebase Intelligence
 * Exposes tools for AI assistants to search and query the codebase
 */
export class MCPServer {
  private server: Server;
  private searchUseCase: SearchUseCase;
  private statusUseCase: GetIndexStatusUseCase;
  private isRunning: boolean = false;
  private restartCount: number = 0;
  private maxRestarts: number = 3;

  constructor(params: {
    searchUseCase: SearchUseCase;
    statusUseCase: GetIndexStatusUseCase;
  }) {
    this.searchUseCase = params.searchUseCase;
    this.statusUseCase = params.statusUseCase;

    this.server = new Server(
      {
        name: 'codevector-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup request handlers
   */
  private setupHandlers(): void {
    // Note: The basic SDK doesn't have tool registration
    // This is a placeholder for when using the full MCP SDK with tools support
    this.server.setRequestHandler('tools/call' as any, async (request: any) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'search_codebase':
          return this.handleSearch(args);
        case 'get_index_status':
          return this.handleStatus();
        case 'list_symbols':
          return this.handleListSymbols();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    this.server.setRequestHandler('tools/list' as any, async () => {
      return {
        tools: [
          {
            name: 'search_codebase',
            description: 'Search the codebase using hybrid semantic + keyword search',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query',
                },
                topK: {
                  type: 'number',
                  default: 10,
                  description: 'Number of results to return',
                },
                bm25Weight: {
                  type: 'number',
                  default: 0.5,
                  description: 'Weight for BM25 keyword search (0-1)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_index_status',
            description: 'Get the current index status and statistics',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'list_symbols',
            description: 'List code symbols (functions, classes) in the workspace',
            inputSchema: {
              type: 'object',
              properties: {
                language: {
                  type: 'string',
                  description: 'Filter by language',
                },
              },
            },
          },
        ],
      };
    });
  }

  /**
   * Handle search_codebase tool
   */
  private async handleSearch(params: {
    query: string;
    topK?: number;
    bm25Weight?: number;
  }): Promise<any> {
    const searchQuery = createSearchQuery({
      query: params.query,
      topK: params.topK,
      bm25Weight: params.bm25Weight,
    });

    const results = await this.searchUseCase.execute(searchQuery);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              results: results.results.map((r: any) => ({
                filePath: r.chunk.filePath,
                startLine: r.chunk.startLine,
                endLine: r.chunk.endLine,
                content: r.chunk.content,
                score: r.score,
                vectorScore: r.vectorScore,
                keywordScore: r.keywordScore,
              })),
              total: results.total,
              offset: results.offset,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle get_index_status tool
   */
  private async handleStatus(): Promise<any> {
    const status = await this.statusUseCase.execute();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              isIndexed: status.isIndexed,
              totalFiles: status.totalFiles,
              totalChunks: status.totalChunks,
              totalSymbols: status.totalSymbols,
              lastIndexedAt: status.lastIndexedAt,
              vectorIndex: {
                totalVectors: status.vectorIndexStats.totalVectors,
                dimensions: status.vectorIndexStats.dimensions,
                indexSize: status.vectorIndexStats.indexSize,
              },
              bm25Index: {
                totalDocs: status.bm25Stats.totalDocs,
                totalTerms: status.bm25Stats.totalTerms,
                avgDocLength: status.bm25Stats.avgDocLength,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle list_symbols tool
   */
  private async handleListSymbols(): Promise<any> {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              symbols: [],
              message: 'Symbol listing not yet implemented',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.isRunning = true;
      this.restartCount = 0;

      console.error('[MCP] Server started');
    } catch (error) {
      console.error('[MCP] Failed to start:', error);
      await this.handleCrash();
    }
  }

  /**
   * Handle server crash with recovery
   */
  private async handleCrash(): Promise<void> {
    this.isRunning = false;

    if (this.restartCount < this.maxRestarts) {
      this.restartCount++;
      console.error(`[MCP] Attempting restart ${this.restartCount}/${this.maxRestarts}`);

      // Delay before restart
      await new Promise((resolve) => setTimeout(resolve, 1000 * this.restartCount));

      try {
        await this.start();
      } catch (error) {
        console.error('[MCP] Restart failed:', error);
        await this.handleCrash();
      }
    } else {
      console.error('[MCP] Max restart attempts reached. Server stopped.');
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.server.close();
      this.isRunning = false;
      console.error('[MCP] Server stopped');
    } catch (error) {
      console.error('[MCP] Error stopping:', error);
    }
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}
