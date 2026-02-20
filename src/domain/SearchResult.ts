import type { CodeChunk } from './CodeChunk';

/**
 * Search result with relevance score
 */
export interface SearchResult {
  chunk: CodeChunk;
  score: number;
  vectorScore: number;
  keywordScore: number;
  vectorRank: number;
  keywordRank: number;
}

/**
 * Creates a SearchResult instance
 */
export function createSearchResult(params: {
  chunk: CodeChunk;
  score: number;
  vectorScore: number;
  keywordScore: number;
  vectorRank: number;
  keywordRank: number;
}): SearchResult {
  return {
    chunk: params.chunk,
    score: params.score,
    vectorScore: params.vectorScore,
    keywordScore: params.keywordScore,
    vectorRank: params.vectorRank,
    keywordRank: params.keywordRank,
  };
}

/**
 * Search results with pagination info
 */
export interface SearchResults {
  results: SearchResult[];
  total: number;
  offset: number;
  topK: number;
}
