# Codebase Intelligence Extension

A fully local, privacy-first codebase intelligence engine for VSCode that provides hybrid semantic + keyword search with MCP tool integration.

## Features

- **Hybrid Search**: Combines semantic vector search (HNSW) with BM25 keyword search using Weighted Reciprocal Rank Fusion
- **Fully Local**: All embeddings and indices computed and stored locally with no telemetry
- **High Performance**: WASM-accelerated vector search powered by Rust HNSW implementation
- **Incremental Indexing**: SHA-based change detection for fast incremental updates
- **MCP Integration**: Persistent MCP server with crash recovery and auto-restart
- **Scalable**: Designed for any codebase size from small projects to huge monorepos (10 LOC to 1M+ LOC)

## Architecture

Built with clean architecture principles:

- **Presentation Layer**: VSCode Commands, MCP Controller
- **Application Layer**: Use cases for indexing, search, and status
- **Domain Layer**: Core entities (CodeChunk, SearchQuery, SearchResult)
- **Infrastructure Layer**: WASM HNSW, BM25, Tree-sitter chunking, embeddings

## Performance Targets

| Metric                   | Small (1k LOC) | Medium (50k LOC) | Large (500k+ LOC) |
| ------------------------ | -------------- | ---------------- | ----------------- |
| Initial index            | < 1s           | < 10s            | < 90s             |
| Incremental reindex      | < 50ms         | < 200ms          | < 500ms           |
| Search p95 latency       | < 50ms         | < 100ms          | < 200ms           |
| Memory usage             | < 50MB         | < 200MB          | < 600MB           |

## Configuration

```json
{
  "codebaseSearch.vectorBackend": "wasm",
  "codebaseSearch.bm25Weight": 0.5,
  "codebaseSearch.maxChunkSize": 500,
  "codebaseSearch.batchSize": 32,
  "codebaseSearch.efSearch": 64
}
```

## MCP Tools

- `search_codebase`: Hybrid semantic + keyword search
- `get_index_status`: Check indexing status and statistics
- `list_symbols`: List code symbols in the workspace

## Target Users

- Developers of all levels working with any codebase size
- Solo developers with small projects
- Teams with medium-sized applications
- Senior engineers managing large monorepos
- AI-assisted coding workflows
- Enterprise development teams
- Regulated or air-gapped environments

## Documentation

- [Product Requirements Document (PRD)](./PRD.md)
- [Technical Design Document (TDD)](./TDD.md)

## Privacy

- No telemetry by default
- No outbound calls after model download
- All processing happens locally
- All data stored locally

## Distribution

- VSCode Marketplace compatible
- Single WASM artifact (no native binaries per OS)
- Works offline after initial setup

## Success Metrics

- Recall@5 ≥ 75% across all codebase sizes
- Stable operation from small projects (1k LOC) to huge monorepos (1M+ LOC)
- No blocking UI operations regardless of codebase size
- Crash recovery success rate ≥ 99%
- Fast startup for small projects (< 1s indexing)
