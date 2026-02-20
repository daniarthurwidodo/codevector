/**
 * BM25 keyword search index implementation
 * Uses Okapi BM25 scoring algorithm
 */

interface DocumentIndex {
  id: string;
  content: string;
  termFreq: Map<string, number>;
  docLength: number;
}

interface InvertedIndexEntry {
  docIds: Set<string>;
  termFreqs: Map<string, number>; // docId -> term frequency
}

export class BM25Index {
  private k1: number = 1.5;
  private b: number = 0.75;
  private documents: Map<string, DocumentIndex> = new Map();
  private invertedIndex: Map<string, InvertedIndexEntry> = new Map();
  private avgDocLength: number = 0;
  private totalDocs: number = 0;

  /**
   * Tokenize text into terms
   * Splits on non-alphanumeric characters and camelCase boundaries
   */
  private tokenize(text: string): string[] {
    // First split camelCase: authenticateUser -> authenticate User
    const withSpaces = text.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Then extract all alphanumeric sequences and convert to lowercase
    return withSpaces
      .toLowerCase()
      .match(/[a-z0-9_]+/gi) || [];
  }

  /**
   * Add a document to the index
   */
  add(id: string, content: string): void {
    const terms = this.tokenize(content);
    const termFreq = new Map<string, number>();

    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    const docIndex: DocumentIndex = {
      id,
      content,
      termFreq,
      docLength: terms.length,
    };

    this.documents.set(id, docIndex);

    // Update inverted index
    for (const [term, freq] of termFreq.entries()) {
      let entry = this.invertedIndex.get(term);
      if (!entry) {
        entry = {
          docIds: new Set(),
          termFreqs: new Map(),
        };
        this.invertedIndex.set(term, entry);
      }
      entry.docIds.add(id);
      entry.termFreqs.set(id, freq);
    }

    // Update statistics
    this.totalDocs = this.documents.size;
    const totalLength = Array.from(this.documents.values())
      .reduce((sum, doc) => sum + doc.docLength, 0);
    this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
  }

  /**
   * Remove a document from the index
   */
  delete(id: string): void {
    const doc = this.documents.get(id);
    if (!doc) return;

    // Remove from inverted index
    for (const term of doc.termFreq.keys()) {
      const entry = this.invertedIndex.get(term);
      if (entry) {
        entry.docIds.delete(id);
        entry.termFreqs.delete(id);
        if (entry.docIds.size === 0) {
          this.invertedIndex.delete(term);
        }
      }
    }

    this.documents.delete(id);

    // Update statistics
    this.totalDocs = this.documents.size;
    const totalLength = Array.from(this.documents.values())
      .reduce((sum, doc) => sum + doc.docLength, 0);
    this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
  }

  /**
   * Search for documents matching query
   * Returns scored document IDs sorted by relevance
   */
  search(query: string): Array<{ id: string; score: number }> {
    const queryTerms = this.tokenize(query);
    const scores: Map<string, number> = new Map();

    for (const term of queryTerms) {
      const entry = this.invertedIndex.get(term);
      if (!entry) continue;

      const idf = this.computeIdf(entry.docIds.size);

      for (const docId of entry.docIds) {
        const doc = this.documents.get(docId);
        if (!doc) continue;

        const tf = entry.termFreqs.get(docId) || 0;
        const normFactor = 1 - this.b + this.b * (doc.docLength / this.avgDocLength);
        const termScore = (tf * (this.k1 + 1)) / (tf + this.k1 * normFactor);

        const currentScore = scores.get(docId) || 0;
        scores.set(docId, currentScore + idf * termScore);
      }
    }

    const results: Array<{ id: string; score: number }> = [];
    for (const [id, score] of scores.entries()) {
      results.push({ id, score });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Compute IDF for a term
   */
  private computeIdf(docCount: number): number {
    if (this.totalDocs === 0) return 0;
    return Math.log((this.totalDocs - docCount + 0.5) / (docCount + 0.5) + 1);
  }

  /**
   * Get index statistics
   */
  getStats(): { totalDocs: number; totalTerms: number; avgDocLength: number } {
    return {
      totalDocs: this.totalDocs,
      totalTerms: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
    this.totalDocs = 0;
    this.avgDocLength = 0;
  }
}
