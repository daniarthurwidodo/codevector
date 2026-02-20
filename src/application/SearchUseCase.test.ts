import { describe, it, expect } from 'vitest';
import { SearchUseCase } from '../SearchUseCase';
import { BM25Index } from '../../infrastructure/bm25';
import { WasmHNSWVectorIndex } from '../../infrastructure/vector';
import { EmbeddingService } from '../../infrastructure/embeddings';
import { MetadataRepository } from '../../infrastructure/metadata';
import { createSearchQuery } from '../../domain';

describe('SearchUseCase', () => {
  const createUseCase = () => {
    const bm25Index = new BM25Index();
    const vectorIndex = new WasmHNSWVectorIndex();
    const embeddingService = new EmbeddingService();
    const metadataRepo = new MetadataRepository(':memory:');

    return new SearchUseCase({
      vectorIndex,
      bm25Index,
      embeddingService,
      metadataRepo,
    });
  };

  it('should perform weighted RRF fusion', async () => {
    const useCase = createUseCase();

    // Add test data
    useCase['bm25Index'].add('chunk1', 'function createUser with authentication');
    useCase['bm25Index'].add('chunk2', 'class User with login method');
    useCase['bm25Index'].add('chunk3', 'database connection pool setup');

    // Add vector data
    await useCase['vectorIndex'].add('chunk1', [1, 0, 0]);
    await useCase['vectorIndex'].add('chunk2', [0.8, 0.2, 0]);
    await useCase['vectorIndex'].add('chunk3', [0, 0, 1]);

    const query = createSearchQuery({
      query: 'user authentication',
      topK: 2,
      bm25Weight: 0.5,
    });

    const results = await useCase.execute(query);

    expect(results.results.length).toBeGreaterThan(0);
    expect(results.total).toBeGreaterThan(0);
  });

  it('should handle empty index', async () => {
    const useCase = createUseCase();

    const query = createSearchQuery({
      query: 'test',
      topK: 10,
    });

    const results = await useCase.execute(query);

    expect(results.results.length).toBe(0);
    expect(results.total).toBe(0);
  });

  it('should respect pagination', async () => {
    const useCase = createUseCase();

    // Add test data
    for (let i = 0; i < 5; i++) {
      useCase['bm25Index'].add(`chunk${i}`, `content ${i}`);
      await useCase['vectorIndex'].add(`chunk${i}`, [1, 0, 0]);
    }

    const query1 = createSearchQuery({
      query: 'content',
      topK: 2,
      offset: 0,
    });

    const query2 = createSearchQuery({
      query: 'content',
      topK: 2,
      offset: 2,
    });

    const results1 = await useCase.execute(query1);
    const results2 = await useCase.execute(query2);

    expect(results1.results.length).toBe(2);
    expect(results2.results.length).toBe(2);
    expect(results1.offset).toBe(0);
    expect(results2.offset).toBe(2);
  });
});
