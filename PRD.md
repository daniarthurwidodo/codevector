# Codebase Intelligence Extension

## Product Requirements Document (PRD)

Version: 2.0
Status: Production-Ready (WASM Architecture)
Audience: Engineering, Architecture, DevTools

---

# 1. Product Overview

## 1.1 Vision

Provide a fully local, privacy-first, high-performance codebase intelligence engine for VSCode that enables hybrid semantic + keyword search and MCP tool integration.

The system must scale from small projects to huge monorepos (10 LOC to 1M+ LOC) while remaining deterministic, offline-capable, and marketplace-friendly.

---

## 1.2 Core Value Proposition

* Hybrid semantic + keyword search
* Fully local execution (no telemetry by default)
* Persistent MCP server
* Incremental indexing
* WASM-accelerated vector search (Rust HNSW)
* Clean architecture with swappable backends

---

# 2. Target Users

* Developers of all levels working with any codebase size
* Solo developers with small projects
* Teams with medium-sized applications
* Senior engineers managing large monorepos
* AI-assisted coding workflows
* Enterprise development teams
* Regulated / air-gapped environments

---

# 3. Functional Requirements

## 3.1 Indexing

* Index entire workspace
* Support multi-root workspaces
* Incremental reindex on file save
* SHA-based file change detection
* Configurable exclude globs

## 3.2 Hybrid Search

* Semantic vector search (HNSW via Rust WASM)
* BM25 keyword search (TypeScript)
* Weighted Reciprocal Rank Fusion (RRF)
* Pagination support (offset + top_k)
* File type filtering

## 3.3 MCP Integration

Exposed tools:

* search_codebase
* get_index_status
* list_symbols

Persistent server with crash recovery and auto-restart.

## 3.4 Privacy

* No telemetry by default
* No outbound calls after model download
* All embeddings computed locally
* All indices stored locally

---

# 4. Non-Functional Requirements

## 4.1 Performance Targets

| Metric                   | Small (1k LOC) | Medium (50k LOC) | Large (500k+ LOC) |
| ------------------------ | -------------- | ---------------- | ----------------- |
| Initial index            | < 1s           | < 10s            | < 90s             |
| Incremental reindex      | < 50ms         | < 200ms          | < 500ms           |
| Search p95 latency       | < 50ms         | < 100ms          | < 200ms           |
| Memory usage             | < 50MB         | < 200MB          | < 600MB           |

## 4.2 Scalability

* Designed for any codebase size: 10 LOC to 1M+ LOC
* Adaptive resource allocation based on project size
* Efficient for small projects, scalable for large monorepos

## 4.3 Distribution

* VSCode Marketplace compatible
* No native per-OS binaries required
* Single WASM artifact

---

# 5. Configuration Options

```json
{
  "codebaseSearch.vectorBackend": "wasm",
  "codebaseSearch.bm25Weight": 0.5,
  "codebaseSearch.maxChunkSize": 500,
  "codebaseSearch.batchSize": 32,
  "codebaseSearch.efSearch": 64
}
```

---

# 6. Success Metrics

* Recall@5 ≥ 75% across all codebase sizes
* Stable operation from small projects (1k LOC) to huge monorepos (1M+ LOC)
* No blocking UI operations regardless of codebase size
* Crash recovery success rate ≥ 99%
* Fast startup for small projects (< 1s indexing)
