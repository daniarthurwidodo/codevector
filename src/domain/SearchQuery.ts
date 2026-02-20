/**
 * Search query parameters
 */
export interface SearchQuery {
  query: string;
  topK: number;
  offset?: number;
  filePatterns?: string[];
  languages?: string[];
  bm25Weight?: number;
}

/**
 * Creates a SearchQuery with defaults
 */
export function createSearchQuery(params: {
  query: string;
  topK?: number;
  offset?: number;
  filePatterns?: string[];
  languages?: string[];
  bm25Weight?: number;
}): SearchQuery {
  return {
    query: params.query,
    topK: params.topK ?? 10,
    offset: params.offset ?? 0,
    filePatterns: params.filePatterns,
    languages: params.languages,
    bm25Weight: params.bm25Weight ?? 0.5,
  };
}
