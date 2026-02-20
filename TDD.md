# Codebase Intelligence Extension

## Technical Design Document (TDD)

Version: 2.0
Status: Production-Ready (WASM Architecture)
Audience: Engineering, Architecture, DevTools

---

# 1. Architecture Overview

## 1.1 Runtime Model

* VSCode Extension Host (Node.js)
* Worker Thread (embeddings)
* Rust HNSW compiled to WASM
* Persistent MCP server

---

## 1.2 Layered Architecture

**Presentation Layer**

* VSCode Commands
* MCP Controller

**Application Layer**

* IndexWorkspaceUseCase
* ReindexFileUseCase
* SearchUseCase
* GetIndexStatusUseCase

**Domain Layer**

* CodeChunk
* SearchQuery
* SearchResult

**Infrastructure Layer**

* WasmHNSWVectorIndex
* BM25Index
* TreeSitterChunker
* EmbeddingService
* MetadataRepository

Dependency direction flows inward only.

---

# 2. WASM Vector Index Design

## 2.1 Rust Implementation

* HNSW graph
* Parameters:
  * M = 16
  * efConstruction = 200
  * efSearch = configurable

Compiled target:

```
wasm32-unknown-unknown
```

Built with:

* wasm-bindgen

---

## 2.2 TypeScript Adapter Interface

```ts
export interface IVectorIndex {
  add(id: string, vector: number[]): Promise<void>
  search(vector: number[], k: number): Promise<SearchHit[]>
  delete(id: string): Promise<void>
  save(): Promise<Uint8Array>
  load(data: Uint8Array): Promise<void>
}
```

Implementation:

```ts
class WasmHNSWVectorIndex implements IVectorIndex
```

---

# 3. Indexing Flow

**Full index:**

1. Enumerate files
2. Filter by glob
3. Chunk via Tree-sitter
4. Batch embed (worker thread)
5. Insert into WASM HNSW
6. Insert into BM25 index
7. Persist metadata

**Incremental:**

1. Compute SHA-256
2. Compare with stored hash
3. Delete all chunks for file
4. Re-chunk
5. Re-embed
6. Re-insert

---

# 4. Hybrid Search Execution

**SearchUseCase:**

1. Normalize query
2. Check LRU embedding cache
3. Embed if needed
4. Vector search (WASM)
5. BM25 search (TS)
6. Weighted RRF fusion
7. Apply pagination
8. Return results

**Weighted RRF:**

```
score = α * (1/(k + rank_vector)) + (1-α) * (1/(k + rank_keyword))
```

---

# 5. Worker Thread Embedding Model

* Prevents blocking extension host
* Supports batch processing
* LRU cache (100 entries)

---

# 6. MCP Server Design

Persistent process inside extension.

**Crash recovery:**

1. Log error
2. Attempt restart (max 3)
3. Surface status warning if failure persists

---

# 7. CI Pipeline (WASM)

Single Linux build pipeline:

* Install Rust
* Build wasm32 target
* Run wasm-bindgen
* Bundle artifact in extension

No OS matrix required.

---

# 8. Persistence Strategy

* WASM returns serialized index bytes
* Node handles file I/O
* Metadata stored in JSON
* Workspace root hashed (SHA-1)

---

# 9. Testing Strategy

**Fixture repositories (covering full size spectrum):**

* Tiny: 100 LOC (single file projects)
* Small: 1k LOC (small utilities)
* Medium: 50k LOC (typical applications)
* Large: 500k LOC (large monorepos)
* Huge: 1M+ LOC (enterprise codebases)

**Metrics (measured across all sizes):**

* recall@5
* recall@10
* p95 latency
* memory usage
* indexing time
* startup performance

---

# 10. Risk Assessment

| Risk                    | Mitigation                                    |
| ----------------------- | --------------------------------------------- |
| WASM memory growth      | Reinitialize module on rebuild                |
| Large index size        | Configurable chunk size + adaptive allocation |
| Small project overhead  | Lazy initialization + minimal footprint       |
| Electron compatibility  | Node-targeted wasm-bindgen build              |
| Model download failures | Retry + offline fallback                      |

---

# 11. Future Extensions

* Native N-API backend (optional)
* Tantivy-based keyword index (Rust)
* Streaming MCP responses
* Cross-repository global index

---

# 12. Conclusion

This design delivers:

* Marketplace-safe distribution
* High-performance search via Rust WASM
* Clean architectural boundaries
* Enterprise-ready privacy guarantees
* Scalable hybrid retrieval for any codebase size
* Efficient resource usage from small to huge projects
* Fast startup and low overhead for small codebases

The system is production-ready, universally applicable, and extensible for future AI-native development workflows.
