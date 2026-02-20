/**
 * Worker thread for computing embeddings
 * Prevents blocking the extension host
 */

import { parentPort } from 'worker_threads';

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
 * Simple embedding computation (placeholder)
 * Will be replaced with actual model inference using @xenova/transformers
 */
async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  // Placeholder: return random normalized vectors
  // In production, this will use a local embedding model
  const embeddings: number[][] = [];

  for (const text of texts) {
    // Generate deterministic pseudo-random vector based on text hash
    const vector = new Array(384).fill(0).map((_, i) => {
      const hash = text.charCodeAt(i % text.length) * (i + 1);
      return (Math.sin(hash) * 2 - 1) / Math.sqrt(384); // Normalized
    });

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    const normalized = vector.map((v) => v / norm);

    embeddings.push(normalized);
  }

  return embeddings;
}

if (parentPort) {
  parentPort.on('message', async (request: EmbeddingRequest) => {
    try {
      const { id, texts, batchSize } = request;
      const embeddings: number[][] = [];

      // Process in batches
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchEmbeddings = await computeEmbeddings(batch);
        embeddings.push(...batchEmbeddings);
      }

      const response: EmbeddingResponse = {
        id,
        embeddings,
      };

      if (parentPort) parentPort.postMessage(response);
    } catch (error) {
      const response: EmbeddingResponse = {
        id: request.id,
        embeddings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      if (parentPort) parentPort.postMessage(response);
    }
  });
}
