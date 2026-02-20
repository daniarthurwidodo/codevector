import type { CodeChunk } from '../../domain';
import { createCodeChunk } from '../../domain';
import * as crypto from 'crypto';

/**
 * Language configuration for Tree-sitter
 */
interface LanguageConfig {
  name: string;
  extensions: string[];
  nodeTypes: {
    function: string[];
    class: string[];
    comment: string[];
  };
}

const LANGUAGE_CONFIGS: LanguageConfig[] = [
  {
    name: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    nodeTypes: {
      function: ['function_declaration', 'arrow_function', 'method_definition'],
      class: ['class_declaration'],
      comment: ['comment'],
    },
  },
  {
    name: 'typescript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    nodeTypes: {
      function: ['function_declaration', 'arrow_function', 'method_definition'],
      class: ['class_declaration'],
      comment: ['comment'],
    },
  },
  {
    name: 'python',
    extensions: ['.py', '.pyw'],
    nodeTypes: {
      function: ['function_definition'],
      class: ['class_definition'],
      comment: ['comment'],
    },
  },
  {
    name: 'rust',
    extensions: ['.rs'],
    nodeTypes: {
      function: ['function_item'],
      class: ['struct_item', 'enum_item', 'impl_item'],
      comment: ['line_comment', 'block_comment'],
    },
  },
  {
    name: 'go',
    extensions: ['.go'],
    nodeTypes: {
      function: ['function_declaration', 'method_declaration'],
      class: ['type_declaration'],
      comment: ['comment'],
    },
  },
];

/**
 * Get language from file path
 */
export function getLanguageFromFilePath(filePath: string): string {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  const config = LANGUAGE_CONFIGS.find((c) => c.extensions.includes(ext));
  return config ? config.name : 'plaintext';
}

/**
 * Compute SHA-256 hash of content
 */
export function computeSHA256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Chunk configuration
 */
export interface ChunkConfig {
  maxChunkSize: number;
}

const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxChunkSize: 500,
};

/**
 * Simple code chunker (placeholder for Tree-sitter)
 * Will be enhanced with actual Tree-sitter parsing
 */
export class TreeSitterChunker {
  private config: ChunkConfig;

  constructor(config: ChunkConfig = DEFAULT_CHUNK_CONFIG) {
    this.config = config;
  }

  /**
   * Chunk a file into semantic code chunks
   */
  async chunkFile(filePath: string, content: string): Promise<CodeChunk[]> {
    const language = getLanguageFromFilePath(filePath);
    const fileHash = computeSHA256(content);
    const lines = content.split('\n');

    // Simple line-based chunking as placeholder
    // Will be replaced with Tree-sitter AST-based chunking
    const chunks: CodeChunk[] = [];
    const chunkSize = this.config.maxChunkSize;

    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const chunkContent = chunkLines.join('\n');

      if (chunkContent.trim().length === 0) continue;

      const startLine = i + 1; // 1-indexed
      const endLine = Math.min(i + chunkSize, lines.length);

      chunks.push(
        createCodeChunk({
          filePath,
          content: chunkContent,
          startLine,
          endLine,
          language,
          symbols: [], // Will be populated by Tree-sitter
          sha256: computeSHA256(chunkContent),
        })
      );
    }

    return chunks;
  }

  /**
   * Extract symbols from content (placeholder)
   * Will be implemented with Tree-sitter
   */
  extractSymbols(content: string, language: string): string[] {
    // Placeholder - will use Tree-sitter to extract function/class names
    const symbols: string[] = [];

    // Simple regex-based extraction as placeholder
    const functionRegex = /(?:function|def|fn|func)\s+(\w+)/g;
    const classRegex = /(?:class|struct|type)\s+(\w+)/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      symbols.push(match[1]);
    }
    while ((match = classRegex.exec(content)) !== null) {
      symbols.push(match[1]);
    }

    return symbols;
  }
}
