import type { CodeChunk } from '../domain/CodeChunk';
import type { TreeSitterChunker } from '../infrastructure/chunker/TreeSitterChunker';
import type { EmbeddingService } from '../infrastructure/embeddings/EmbeddingService';
import type { IVectorIndex } from '../infrastructure/vector/IVectorIndex';
import type { BM25Index } from '../infrastructure/bm25/BM25Index';
import type { MetadataRepository, FileMetadata } from '../infrastructure/metadata/MetadataRepository';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Reindex file result
 */
export interface ReindexFileResult {
  success: boolean;
  reindexed: boolean;
  chunkCount: number;
  error?: string;
}

/**
 * Use case for incremental reindexing of a single file
 * Used for file save events
 */
export class ReindexFileUseCase {
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

  async execute(filePath: string): Promise<ReindexFileResult> {
    try {
      // Read file content
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (error) {
        return {
          success: false,
          reindexed: false,
          chunkCount: 0,
          error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
      }

      // Compute file hash
      const fileHash = crypto.createHash('sha256').update(content).digest('hex');

      // Check if file has changed
      const existingHash = this.metadataRepo.getFileHash(filePath);
      if (existingHash && existingHash === fileHash) {
        // File unchanged, skip reindexing
        return {
          success: true,
          reindexed: false,
          chunkCount: 0,
        };
      }

      // Remove old chunks if file was previously indexed
      const existingMetadata = this.metadataRepo.getFile(filePath);
      if (existingMetadata) {
        await this.removeFileChunks(existingMetadata);
      }

      // Chunk the file
      const chunks = await this.chunker.chunkFile(filePath, content);
      if (chunks.length === 0) {
        return {
          success: true,
          reindexed: false,
          chunkCount: 0,
        };
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

      // Persist metadata
      await this.metadataRepo.save();

      return {
        success: true,
        reindexed: true,
        chunkCount: chunks.length,
      };
    } catch (error) {
      return {
        success: false,
        reindexed: false,
        chunkCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
