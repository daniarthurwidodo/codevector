/**
 * Vector index interface for HNSW implementation
 * Abstract interface that can be implemented by WASM or other backends
 */

export interface SearchHit {
  id: string;
  score: number;
}

export interface IVectorIndex {
  /**
   * Add a vector to the index
   */
  add(id: string, vector: number[]): Promise<void>;

  /**
   * Search for nearest neighbors
   */
  search(vector: number[], k: number): Promise<SearchHit[]>;

  /**
   * Delete a vector from the index
   */
  delete(id: string): Promise<void>;

  /**
   * Serialize the index to bytes
   */
  save(): Promise<Uint8Array>;

  /**
   * Load index from bytes
   */
  load(data: Uint8Array): Promise<void>;

  /**
   * Get index statistics
   */
  getStats(): Promise<{
    totalVectors: number;
    dimensions: number;
    indexSize: number;
  }>;

  /**
   * Clear the index
   */
  clear(): Promise<void>;
}

/**
 * HNSW parameters
 */
export interface HNSWParams {
  m: number; // Number of connections per layer
  efConstruction: number; // Size of dynamic candidate list during construction
  efSearch: number; // Size of dynamic candidate list during search
}

export const DEFAULT_HNSW_PARAMS: HNSWParams = {
  m: 16,
  efConstruction: 200,
  efSearch: 64,
};
