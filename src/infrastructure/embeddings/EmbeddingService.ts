import { Worker } from 'worker_threads';
import * as path from 'path';

/**
 * LRU Cache for embeddings
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Embedding service configuration
 */
export interface EmbeddingConfig {
  batchSize: number;
  cacheSize: number;
  workerPath?: string;
}

const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  batchSize: 32,
  cacheSize: 100,
};

/**
 * Embedding request/response types
 */
interface EmbeddingRequest {
  id: string;
  texts: string[];
  batchSize: number;
}

interface EmbeddingResponse {
  id: string;
  embeddings: number[][];
  error?: string;
}

/**
 * Service for computing text embeddings using worker threads
 */
export class EmbeddingService {
  private config: EmbeddingConfig;
  private worker: Worker | null = null;
  private cache: LRUCache<string, number[]>;
  private requestQueue: Array<{
    texts: string[];
    resolve: (embeddings: number[][]) => void;
    reject: (error: Error) => void;
  }> = [];
  private processing: boolean = false;
  private requestId: number = 0;

  constructor(config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG) {
    this.config = config;
    this.cache = new LRUCache(config.cacheSize);
    this.initWorker();
  }

  private initWorker(): void {
    try {
      const workerPath = this.config.workerPath || 
        path.join(__dirname, '../../worker/embedding.worker.js');
      this.worker = new Worker(workerPath);

      this.worker.on('message', (response: EmbeddingResponse) => {
        this.handleWorkerResponse(response);
      });

      this.worker.on('error', (error) => {
        console.error('Worker error:', error);
        this.rejectCurrentRequest(new Error(`Worker error: ${error.message}`));
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker exited with code ${code}`);
          this.worker = null;
        }
      });
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      this.worker = null;
    }
  }

  private handleWorkerResponse(response: EmbeddingResponse): void {
    if (response.error) {
      this.rejectCurrentRequest(new Error(response.error));
      return;
    }

    // Cache the embeddings
    const request = this.requestQueue.shift();
    if (request) {
      for (let i = 0; i < request.texts.length; i++) {
        const cacheKey = this.getCacheKey(request.texts[i]);
        this.cache.set(cacheKey, response.embeddings[i]);
      }
      request.resolve(response.embeddings);
      this.processNextRequest();
    }
  }

  private rejectCurrentRequest(error: Error): void {
    const request = this.requestQueue.shift();
    if (request) {
      request.reject(error);
      this.processNextRequest();
    }
  }

  private processNextRequest(): void {
    if (this.processing || this.requestQueue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const request = this.requestQueue[0];

    if (!this.worker) {
      this.rejectCurrentRequest(new Error('Worker not available'));
      return;
    }

    const embedRequest: EmbeddingRequest = {
      id: `req_${++this.requestId}`,
      texts: request.texts,
      batchSize: this.config.batchSize,
    };

    this.worker.postMessage(embedRequest);
  }

  private getCacheKey(text: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `emb_${hash}`;
  }

  /**
   * Compute embeddings for texts
   */
  async embed(texts: string[]): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      // Check cache first
      const cachedEmbeddings: (number[] | null)[] = texts.map((text) => {
        const key = this.getCacheKey(text);
        return this.cache.get(key) || null;
      });

      const missingIndices: number[] = [];
      texts.forEach((_, i) => {
        if (cachedEmbeddings[i] === null) {
          missingIndices.push(i);
        }
      });

      if (missingIndices.length === 0) {
        resolve(cachedEmbeddings as number[][]);
        return;
      }

      // Need to compute missing embeddings
      const missingTexts = missingIndices.map((i) => texts[i]);

      this.requestQueue.push({
        texts: missingTexts,
        resolve: (embeddings) => {
          // Merge cached and new embeddings
          const result = [...cachedEmbeddings] as number[][];
          let embIndex = 0;
          for (const idx of missingIndices) {
            result[idx] = embeddings[embIndex++];
          }
          resolve(result);
        },
        reject,
      });

      if (!this.processing) {
        this.processNextRequest();
      }
    });
  }

  /**
   * Compute single embedding
   */
  async embedOne(text: string): Promise<number[]> {
    const embeddings = await this.embed([text]);
    return embeddings[0];
  }

  /**
   * Get cache statistics
   */
  getStats(): { cacheSize: number; queueLength: number; workerAvailable: boolean } {
    return {
      cacheSize: this.cache.size,
      queueLength: this.requestQueue.length,
      workerAvailable: this.worker !== null,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Dispose the service
   */
  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.cache.clear();
    this.requestQueue = [];
  }
}
