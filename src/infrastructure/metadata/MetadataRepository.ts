import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Metadata stored for each indexed file
 */
export interface FileMetadata {
  filePath: string;
  sha256: string;
  chunkIds: string[];
  indexedAt: number;
  language: string;
}

/**
 * Index statistics
 */
export interface IndexStatistics {
  totalFiles: number;
  totalChunks: number;
  totalSymbols: number;
  indexedAt: number;
  workspaceHash: string;
}

/**
 * Persisted metadata structure
 */
interface PersistedMetadata {
  version: string;
  workspaceHash: string;
  files: Record<string, FileMetadata>;
  chunks: Record<string, string>; // chunkId -> filePath
  statistics: IndexStatistics;
}

/**
 * Metadata repository for persisting index state
 */
export class MetadataRepository {
  private storagePath: string;
  private files: Map<string, FileMetadata> = new Map();
  private chunks: Map<string, string> = new Map(); // chunkId -> filePath
  private workspaceHash: string = '';
  private statistics: IndexStatistics = {
    totalFiles: 0,
    totalChunks: 0,
    totalSymbols: 0,
    indexedAt: 0,
    workspaceHash: '',
  };

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  /**
   * Initialize the repository
   */
  async initialize(): Promise<void> {
    await this.ensureStorageDir();
    await this.load();
  }

  private async ensureStorageDir(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Compute workspace hash from root paths
   */
  computeWorkspaceHash(workspaceRoots: string[]): string {
    const sorted = [...workspaceRoots].sort();
    const hash = crypto.createHash('sha1');
    hash.update(sorted.join('|'));
    return hash.digest('hex');
  }

  /**
   * Load metadata from disk
   */
  private async load(): Promise<void> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return;
      }

      const data = fs.readFileSync(this.storagePath, 'utf-8');
      const parsed = JSON.parse(data) as PersistedMetadata;

      this.workspaceHash = parsed.workspaceHash || '';
      this.files = new Map(Object.entries(parsed.files || {}));
      this.chunks = new Map(Object.entries(parsed.chunks || {}));
      this.statistics = parsed.statistics || this.statistics;
    } catch (error) {
      console.error('Failed to load metadata:', error);
      // Start fresh on error
      this.files.clear();
      this.chunks.clear();
    }
  }

  /**
   * Save metadata to disk
   */
  async save(): Promise<void> {
    try {
      const data: PersistedMetadata = {
        version: '1.0.0',
        workspaceHash: this.workspaceHash,
        files: Object.fromEntries(this.files),
        chunks: Object.fromEntries(this.chunks),
        statistics: {
          ...this.statistics,
          totalFiles: this.files.size,
          totalChunks: this.chunks.size,
          indexedAt: Date.now(),
        },
      };

      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save metadata:', error);
      throw error;
    }
  }

  /**
   * Set workspace roots
   */
  setWorkspace(workspaceRoots: string[]): void {
    this.workspaceHash = this.computeWorkspaceHash(workspaceRoots);
  }

  /**
   * Add or update file metadata
   */
  addFile(metadata: FileMetadata): void {
    this.files.set(metadata.filePath, metadata);
    for (const chunkId of metadata.chunkIds) {
      this.chunks.set(chunkId, metadata.filePath);
    }
    this.updateStatistics();
  }

  /**
   * Remove file metadata
   */
  removeFile(filePath: string): void {
    const metadata = this.files.get(filePath);
    if (metadata) {
      for (const chunkId of metadata.chunkIds) {
        this.chunks.delete(chunkId);
      }
      this.files.delete(filePath);
      this.updateStatistics();
    }
  }

  /**
   * Get file metadata
   */
  getFile(filePath: string): FileMetadata | undefined {
    return this.files.get(filePath);
  }

  /**
   * Check if file exists in index
   */
  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  /**
   * Get file hash for change detection
   */
  getFileHash(filePath: string): string | undefined {
    return this.files.get(filePath)?.sha256;
  }

  /**
   * Get all indexed files
   */
  getAllFiles(): FileMetadata[] {
    return Array.from(this.files.values());
  }

  /**
   * Get chunk metadata
   */
  getChunk(chunkId: string): string | undefined {
    return this.chunks.get(chunkId);
  }

  /**
   * Get index statistics
   */
  getStatistics(): IndexStatistics {
    return {
      ...this.statistics,
      totalFiles: this.files.size,
      totalChunks: this.chunks.size,
      indexedAt: this.statistics.indexedAt,
    };
  }

  /**
   * Update statistics
   */
  private updateStatistics(): void {
    this.statistics = {
      totalFiles: this.files.size,
      totalChunks: this.chunks.size,
      totalSymbols: 0, // Will be computed from chunks
      indexedAt: this.statistics.indexedAt,
      workspaceHash: this.workspaceHash,
    };
  }

  /**
   * Clear all metadata
   */
  clear(): void {
    this.files.clear();
    this.chunks.clear();
    this.workspaceHash = '';
    this.statistics = {
      totalFiles: 0,
      totalChunks: 0,
      totalSymbols: 0,
      indexedAt: 0,
      workspaceHash: '',
    };
  }

  /**
   * Get workspace hash
   */
  getWorkspaceHash(): string {
    return this.workspaceHash;
  }
}
