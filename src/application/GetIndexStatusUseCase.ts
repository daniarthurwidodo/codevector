import type { MetadataRepository } from '../infrastructure/metadata/MetadataRepository';
import type { IVectorIndex } from '../infrastructure/vector/IVectorIndex';
import type { BM25Index } from '../infrastructure/bm25/BM25Index';
import type { EmbeddingService } from '../infrastructure/embeddings/EmbeddingService';

/**
 * Index statistics result
 */
export interface IndexStatusResult {
  isIndexed: boolean;
  totalFiles: number;
  totalChunks: number;
  totalSymbols: number;
  workspaceHash: string;
  lastIndexedAt: number;
  vectorIndexStats: {
    totalVectors: number;
    dimensions: number;
    indexSize: number;
  };
  bm25Stats: {
    totalDocs: number;
    totalTerms: number;
    avgDocLength: number;
  };
  embeddingCacheStats: {
    cacheSize: number;
    queueLength: number;
    workerAvailable: boolean;
  };
}

/**
 * Use case for getting index status and statistics
 */
export class GetIndexStatusUseCase {
  private metadataRepo: MetadataRepository;
  private vectorIndex: IVectorIndex;
  private bm25Index: BM25Index;
  private embeddingService: EmbeddingService;

  constructor(params: {
    metadataRepo: MetadataRepository;
    vectorIndex: IVectorIndex;
    bm25Index: BM25Index;
    embeddingService: EmbeddingService;
  }) {
    this.metadataRepo = params.metadataRepo;
    this.vectorIndex = params.vectorIndex;
    this.bm25Index = params.bm25Index;
    this.embeddingService = params.embeddingService;
  }

  async execute(): Promise<IndexStatusResult> {
    const metadataStats = this.metadataRepo.getStatistics();
    const vectorStats = await this.vectorIndex.getStats();
    const bm25Stats = this.bm25Index.getStats();
    const embeddingStats = this.embeddingService.getStats();

    return {
      isIndexed: metadataStats.totalFiles > 0,
      totalFiles: metadataStats.totalFiles,
      totalChunks: metadataStats.totalChunks,
      totalSymbols: metadataStats.totalSymbols,
      workspaceHash: metadataStats.workspaceHash,
      lastIndexedAt: metadataStats.indexedAt,
      vectorIndexStats: {
        totalVectors: vectorStats.totalVectors,
        dimensions: vectorStats.dimensions,
        indexSize: vectorStats.indexSize,
      },
      bm25Stats: {
        totalDocs: bm25Stats.totalDocs,
        totalTerms: bm25Stats.totalTerms,
        avgDocLength: bm25Stats.avgDocLength,
      },
      embeddingCacheStats: embeddingStats,
    };
  }
}
