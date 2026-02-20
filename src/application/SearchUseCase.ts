import type { SearchQuery } from '../domain/SearchQuery';
import type { SearchResult, SearchResults } from '../domain/SearchResult';
import { createSearchResult } from '../domain/SearchResult';
import type { CodeChunk } from '../domain/CodeChunk';
import type { IVectorIndex } from '../infrastructure/vector/IVectorIndex';
import type { BM25Index } from '../infrastructure/bm25/BM25Index';
import type { EmbeddingService } from '../infrastructure/embeddings/EmbeddingService';
import type { MetadataRepository } from '../infrastructure/metadata/MetadataRepository';
import * as path from 'path';

/**
 * Search result from individual index
 */
interface RankedResult {
  id: string;
  score: number;
  rank: number;
}

/**
 * Use case for hybrid semantic + keyword search
 * Implements Weighted Reciprocal Rank Fusion (RRF)
 */
export class SearchUseCase {
  private vectorIndex: IVectorIndex;
  private bm25Index: BM25Index;
  private embeddingService: EmbeddingService;
  private metadataRepo: MetadataRepository;
  private rrfK: number = 60; // RRF constant

  constructor(params: {
    vectorIndex: IVectorIndex;
    bm25Index: BM25Index;
    embeddingService: EmbeddingService;
    metadataRepo: MetadataRepository;
  }) {
    this.vectorIndex = params.vectorIndex;
    this.bm25Index = params.bm25Index;
    this.embeddingService = params.embeddingService;
    this.metadataRepo = params.metadataRepo;
  }

  /**
   * Execute hybrid search
   */
  async execute(query: SearchQuery): Promise<SearchResults> {
    const { query: searchText, topK, offset, bm25Weight } = query;

    // Embed the query
    const queryEmbedding = await this.embeddingService.embedOne(searchText);

    // Search both indices in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorIndex.search(queryEmbedding, topK * 2),
      Promise.resolve(this.bm25Index.search(searchText)),
    ]);

    // Convert to ranked results
    const vectorRanked = this.toRankedResults(vectorResults);
    const keywordRanked = this.toRankedResults(keywordResults);

    // Apply Weighted RRF Fusion
    const fusedScores = this.weightedRRF(vectorRanked, keywordRanked, bm25Weight || 0.5);

    // Apply filters (file patterns, languages)
    const filtered = this.applyFilters(fusedScores, query);

    // Sort by fused score
    filtered.sort((a, b) => b.fusedScore - a.fusedScore);

    // Build final results with pagination
    const total = filtered.length;
    const paginated = filtered.slice(offset || 0, (offset || 0) + topK);

    const results: SearchResult[] = await Promise.all(
      paginated.map(async (item) => {
        const chunk = await this.getChunk(item.id);
        return createSearchResult({
          chunk,
          score: item.fusedScore,
          vectorScore: item.vectorScore,
          keywordScore: item.keywordScore,
          vectorRank: item.vectorRank,
          keywordRank: item.keywordRank,
        });
      })
    );

    return {
      results,
      total,
      offset: offset || 0,
      topK,
    };
  }

  /**
   * Convert search hits to ranked results
   */
  private toRankedResults(hits: Array<{ id: string; score: number }>): RankedResult[] {
    return hits.map((hit, index) => ({
      id: hit.id,
      score: hit.score,
      rank: index + 1,
    }));
  }

  /**
   * Weighted Reciprocal Rank Fusion
   * score = α * (1/(k + rank_vector)) + (1-α) * (1/(k + rank_keyword))
   */
  private weightedRRF(
    vectorResults: RankedResult[],
    keywordResults: RankedResult[],
    bm25Weight: number
  ): Array<{
    id: string;
    fusedScore: number;
    vectorScore: number;
    keywordScore: number;
    vectorRank: number;
    keywordRank: number;
  }> {
    const vectorWeight = 1 - bm25Weight;
    const resultMap = new Map<
      string,
      {
        fusedScore: number;
        vectorScore: number;
        keywordScore: number;
        vectorRank: number;
        keywordRank: number;
      }
    >();

    // Process vector results
    for (const result of vectorResults) {
      const vectorRRF = 1 / (this.rrfK + result.rank);
      resultMap.set(result.id, {
        fusedScore: vectorWeight * vectorRRF,
        vectorScore: result.score,
        keywordScore: 0,
        vectorRank: result.rank,
        keywordRank: 0,
      });
    }

    // Process keyword results and fuse
    for (const result of keywordResults) {
      const keywordRRF = 1 / (this.rrfK + result.rank);
      const existing = resultMap.get(result.id);

      if (existing) {
        // Add keyword score to existing result
        existing.fusedScore += bm25Weight * keywordRRF;
        existing.keywordScore = result.score;
        existing.keywordRank = result.rank;
      } else {
        // New result from keyword search only
        resultMap.set(result.id, {
          fusedScore: bm25Weight * keywordRRF,
          vectorScore: 0,
          keywordScore: result.score,
          vectorRank: 0,
          keywordRank: result.rank,
        });
      }
    }

    return Array.from(resultMap.entries()).map(([id, scores]) => ({
      id,
      ...scores,
    }));
  }

  /**
   * Apply filters to results
   */
  private applyFilters(
    results: Array<{
      id: string;
      fusedScore: number;
      vectorScore: number;
      keywordScore: number;
      vectorRank: number;
      keywordRank: number;
    }>,
    query: SearchQuery
  ): Array<{
    id: string;
    fusedScore: number;
    vectorScore: number;
    keywordScore: number;
    vectorRank: number;
    keywordRank: number;
  }> {
    let filtered = results;

    // Filter by file patterns
    if (query.filePatterns && query.filePatterns.length > 0) {
      filtered = filtered.filter((item) => {
        const filePath = this.getFilePathFromChunkId(item.id);
        return query.filePatterns!.some((pattern: string) => this.matchGlob(filePath, pattern));
      });
    }

    // Filter by languages
    if (query.languages && query.languages.length > 0) {
      // Would need to check chunk metadata for language
      // For now, skip this filter
    }

    return filtered;
  }

  /**
   * Extract file path from chunk ID
   */
  private getFilePathFromChunkId(chunkId: string): string {
    // Chunk ID format: filePath:startLine-endLine
    const parts = chunkId.split(':');
    return parts[0] || '';
  }

  /**
   * Simple glob matching
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
   * Get chunk from metadata
   */
  private async getChunk(chunkId: string): Promise<CodeChunk> {
    // This is a placeholder - in production, chunks would be cached or re-read from files
    // For now, return a minimal chunk structure
    const filePath = this.getFilePathFromChunkId(chunkId);
    const parts = chunkId.split(':');
    const lineRange = parts[1]?.split('-') || ['0', '0'];

    return {
      id: chunkId,
      filePath,
      content: '', // Would need to read from file
      startLine: parseInt(lineRange[0], 10),
      endLine: parseInt(lineRange[1], 10),
      language: '',
      symbols: [],
      sha256: '',
    };
  }
}
