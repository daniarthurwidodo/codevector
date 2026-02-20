import { describe, it, expect } from 'vitest';
import { BM25Index } from '../BM25Index';

describe('BM25Index', () => {
  it('should add and search documents', () => {
    const index = new BM25Index();

    index.add('doc1', 'The quick brown fox jumps over the lazy dog');
    index.add('doc2', 'The fast red fox runs through the forest');
    index.add('doc3', 'A lazy cat sleeps on the couch');

    const results = index.search('quick fox');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('doc1');
  });

  it('should delete documents', () => {
    const index = new BM25Index();

    index.add('doc1', 'The quick brown fox');
    index.add('doc2', 'The fast red fox');

    index.delete('doc1');

    const results = index.search('quick');
    expect(results.length).toBe(0);
  });

  it('should return empty results for unknown terms', () => {
    const index = new BM25Index();

    index.add('doc1', 'The quick brown fox');

    const results = index.search('nonexistent term xyz');
    expect(results.length).toBe(0);
  });

  it('should handle case insensitivity', () => {
    const index = new BM25Index();

    index.add('doc1', 'The Quick Brown Fox');

    const results1 = index.search('quick');
    const results2 = index.search('QUICK');

    expect(results1.length).toBe(results2.length);
  });

  it('should return statistics', () => {
    const index = new BM25Index();

    index.add('doc1', 'The quick brown fox');
    index.add('doc2', 'The fast red fox');

    const stats = index.getStats();

    expect(stats.totalDocs).toBe(2);
    expect(stats.totalTerms).toBeGreaterThan(0);
    expect(stats.avgDocLength).toBeGreaterThan(0);
  });

  it('should clear the index', () => {
    const index = new BM25Index();

    index.add('doc1', 'The quick brown fox');
    index.clear();

    const stats = index.getStats();
    expect(stats.totalDocs).toBe(0);
  });
});
