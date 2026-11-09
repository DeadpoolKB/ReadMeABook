/**
 * Component: E-book Source Base Interface
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * Base interface for pluggable ebook download sources
 * Each source implements search and download methods
 */

import { RMABLogger } from '../../utils/logger';

/**
 * Search parameters for ebook sources
 */
export interface EbookSearchParams {
  title: string;
  author: string;
  asin?: string;
  format: string; // epub, pdf, mobi, azw3, any
  language: string; // en, de, es, fr, it, etc.
}

/**
 * Single search result from an ebook source
 */
export interface EbookSearchResult {
  sourceId: string;
  sourceName: string;
  title: string;
  author: string;
  format: string;
  size?: number; // Size in bytes
  downloadUrl: string;
  md5?: string; // MD5 hash (if available)
  metadata?: Record<string, any>; // Source-specific metadata
}

/**
 * Download result from an ebook source
 */
export interface EbookDownloadResult {
  success: boolean;
  filePath?: string;
  format?: string;
  error?: string;
}

/**
 * Base interface for ebook sources
 * All ebook sources must implement this interface
 */
export interface EbookSource {
  /**
   * Unique identifier for the source
   */
  id: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Whether the source is enabled
   */
  enabled: boolean;

  /**
   * Priority (lower = higher priority)
   */
  priority: number;

  /**
   * Search for ebooks matching the given parameters
   * @param params Search parameters (title, author, format, etc.)
   * @param logger Optional logger for debugging
   * @returns Array of search results
   */
  search(params: EbookSearchParams, logger?: RMABLogger): Promise<EbookSearchResult[]>;

  /**
   * Download a specific ebook result
   * @param result The search result to download
   * @param targetDir Directory to save the downloaded file
   * @param logger Optional logger for debugging
   * @returns Download result with file path
   */
  download(result: EbookSearchResult, targetDir: string, logger?: RMABLogger): Promise<EbookDownloadResult>;

  /**
   * Test if the source is properly configured and reachable
   * @returns Success status and message
   */
  testConnection?(): Promise<{ success: boolean; message: string }>;
}
