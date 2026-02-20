import type { CodeChunk } from '../domain/CodeChunk';
import type { TreeSitterChunker } from '../infrastructure/chunker/TreeSitterChunker';
import type { EmbeddingService } from '../infrastructure/embeddings/EmbeddingService';
import type { IVectorIndex } from '../infrastructure/vector/IVectorIndex';
import type { BM25Index } from '../infrastructure/bm25/BM25Index';
import type { MetadataRepository, FileMetadata } from '../infrastructure/metadata/MetadataRepository';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Index workspace use case parameters
 */
export interface IndexWorkspaceParams {
  workspaceRoots: string[];
  excludeGlobs: string[];
  batchSize: number;
  onProgress?: (progress: { indexed: number; total: number; file: string }) => void;
}

/**
 * Index workspace result
 */
export interface IndexWorkspaceResult {
  indexedFiles: number;
  totalChunks: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Use case for indexing the entire workspace
 */
export class IndexWorkspaceUseCase {
  private chunker: TreeSitterChunker;
  private embeddingService: EmbeddingService;
  private vectorIndex: IVectorIndex;
  private bm25Index: BM25Index;
  private metadataRepo: MetadataRepository;

  constructor(params: {
    chunker: TreeSitterChunker;
    embeddingService: EmbeddingService;
    vectorIndex: IVectorIndex;
    bm25Index: BM25Index;
    metadataRepo: MetadataRepository;
  }) {
    this.chunker = params.chunker;
    this.embeddingService = params.embeddingService;
    this.vectorIndex = params.vectorIndex;
    this.bm25Index = params.bm25Index;
    this.metadataRepo = params.metadataRepo;
  }

  async execute(params: IndexWorkspaceParams): Promise<IndexWorkspaceResult> {
    const { workspaceRoots, excludeGlobs, batchSize } = params;

    // Set workspace hash
    this.metadataRepo.setWorkspace(workspaceRoots);

    // Collect all files
    const files = await this.collectFiles(workspaceRoots, excludeGlobs);
    const result: IndexWorkspaceResult = {
      indexedFiles: 0,
      totalChunks: 0,
      skippedFiles: 0,
      errors: [],
    };

    // Process files
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];

      try {
        const indexed = await this.indexFile(filePath, batchSize);
        if (indexed) {
          result.indexedFiles++;
          result.totalChunks += indexed.chunkCount;
        } else {
          result.skippedFiles++;
        }

        if (params.onProgress) {
          params.onProgress({
            indexed: i + 1,
            total: files.length,
            file: filePath,
          });
        }
      } catch (error) {
        result.errors.push({
          file: filePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Save metadata
    await this.metadataRepo.save();

    return result;
  }

  /**
   * Collect all files to index
   */
  private async collectFiles(roots: string[], excludeGlobs: string[]): Promise<string[]> {
    const files: string[] = [];

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;

      const rootFiles = await this.walkDirectory(root, excludeGlobs);
      files.push(...rootFiles);
    }

    return files;
  }

  /**
   * Walk directory and collect files
   */
  private async walkDirectory(dir: string, excludeGlobs: string[]): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Check exclusions
        if (this.isExcluded(fullPath, excludeGlobs)) {
          continue;
        }

        if (entry.isDirectory()) {
          const subFiles = await this.walkDirectory(fullPath, excludeGlobs);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isSupportedFile(fullPath)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }

    return files;
  }

  /**
   * Check if path matches exclusion patterns
   */
  private isExcluded(filePath: string, excludeGlobs: string[]): boolean {
    for (const pattern of excludeGlobs) {
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching (supports ** and *)
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Check if file type is supported
   */
  private isSupportedFile(filePath: string): boolean {
    const supportedExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts',
      '.py', '.pyw',
      '.rs',
      '.go',
      '.java',
      '.cpp', '.cc', '.cxx', '.h', '.hpp',
      '.rb',
      '.php',
      '.swift',
      '.kt', '.kts',
      '.scala',
      '.sh', '.bash', '.zsh',
      '.sql',
      '.html', '.htm',
      '.css', '.scss', '.sass', '.less',
      '.json', '.yaml', '.yml', '.toml', '.md', '.txt'
    ];

    const ext = path.extname(filePath).toLowerCase();
    return supportedExtensions.includes(ext);
  }

  /**
   * Index a single file
   */
  private async indexFile(
    filePath: string,
    batchSize: number
  ): Promise<{ chunkCount: number } | null> {
    // Read file content
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Compute file hash
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');

    // Check if file has changed
    const existingMetadata = this.metadataRepo.getFile(filePath);
    if (existingMetadata && existingMetadata.sha256 === fileHash) {
      return null; // File unchanged
    }

    // Remove old chunks if file was previously indexed
    if (existingMetadata) {
      await this.removeFileChunks(existingMetadata);
    }

    // Chunk the file
    const chunks = await this.chunker.chunkFile(filePath, content);
    if (chunks.length === 0) {
      return null;
    }

    // Compute embeddings
    const texts = chunks.map((c: CodeChunk) => c.content);
    const embeddings = await this.embeddingService.embed(texts);

    // Add to indices
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      await this.vectorIndex.add(chunk.id, embedding);
      this.bm25Index.add(chunk.id, chunk.content);
    }

    // Update metadata
    this.metadataRepo.addFile({
      filePath,
      sha256: fileHash,
      chunkIds: chunks.map((c: CodeChunk) => c.id),
      indexedAt: Date.now(),
      language: chunks[0].language,
    });

    return { chunkCount: chunks.length };
  }

  /**
   * Remove chunks for a file
   */
  private async removeFileChunks(metadata: FileMetadata): Promise<void> {
    for (const chunkId of metadata.chunkIds) {
      await this.vectorIndex.delete(chunkId);
    }
    this.metadataRepo.removeFile(metadata.filePath);
  }
}
