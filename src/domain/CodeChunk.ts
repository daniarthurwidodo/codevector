/**
 * Represents a chunk of code from a file
 */
export interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  symbols: string[];
  sha256: string;
}

/**
 * Creates a unique chunk ID based on file path and line numbers
 */
export function createChunkId(filePath: string, startLine: number, endLine: number): string {
  return `${filePath}:${startLine}-${endLine}`;
}

/**
 * Creates a CodeChunk instance
 */
export function createCodeChunk(params: {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  symbols?: string[];
  sha256: string;
}): CodeChunk {
  return {
    id: createChunkId(params.filePath, params.startLine, params.endLine),
    filePath: params.filePath,
    content: params.content,
    startLine: params.startLine,
    endLine: params.endLine,
    language: params.language,
    symbols: params.symbols || [],
    sha256: params.sha256,
  };
}
