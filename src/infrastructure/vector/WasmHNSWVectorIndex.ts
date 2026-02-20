/**
 * Stub implementation of WasmHNSWVectorIndex
 * This will be replaced with actual WASM binding once Rust HNSW is built
 */

import type { IVectorIndex, SearchHit, HNSWParams } from './IVectorIndex';
import { DEFAULT_HNSW_PARAMS } from './IVectorIndex';

export class WasmHNSWVectorIndex implements IVectorIndex {
  private vectors: Map<string, number[]> = new Map();
  private dimensions: number = 0;
  private params: HNSWParams;

  constructor(params: HNSWParams = DEFAULT_HNSW_PARAMS) {
    this.params = params;
  }

  async add(id: string, vector: number[]): Promise<void> {
    if (this.dimensions === 0) {
      this.dimensions = vector.length;
    }
    this.vectors.set(id, vector);
  }

  async search(vector: number[], k: number): Promise<SearchHit[]> {
    // Simple brute-force cosine similarity as placeholder
    // Will be replaced with actual HNSW search from WASM
    const hits: SearchHit[] = [];

    for (const [id, storedVector] of this.vectors.entries()) {
      const score = this.cosineSimilarity(vector, storedVector);
      hits.push({ id, score });
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  async save(): Promise<Uint8Array> {
    // Placeholder - will be replaced with WASM serialization
    const data = {
      vectors: Array.from(this.vectors.entries()),
      dimensions: this.dimensions,
      params: this.params,
    };
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json);
  }

  async load(data: Uint8Array): Promise<void> {
    // Placeholder - will be replaced with WASM deserialization
    const json = new TextDecoder().decode(data);
    const parsed = JSON.parse(json);
    this.vectors = new Map(parsed.vectors);
    this.dimensions = parsed.dimensions || 0;
    this.params = parsed.params || this.params;
  }

  async getStats(): Promise<{ totalVectors: number; dimensions: number; indexSize: number }> {
    return {
      totalVectors: this.vectors.size,
      dimensions: this.dimensions,
      indexSize: this.vectors.size * this.dimensions * 4, // 4 bytes per float
    };
  }

  async clear(): Promise<void> {
    this.vectors.clear();
    this.dimensions = 0;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
