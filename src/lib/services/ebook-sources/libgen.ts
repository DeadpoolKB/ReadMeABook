/**
 * Component: LibGen E-book Source
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * LibGen scraper for ebook downloads
 * Supports multiple mirrors and direct HTTP downloads
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { RMABLogger } from '../../utils/logger';
import { RMAB_USER_AGENT } from '../../utils/user-agent';
import {
  EbookSource,
  EbookSearchParams,
  EbookSearchResult,
  EbookDownloadResult,
} from './base';
import { trimTrailingSlashes } from '../../utils/url';

const REQUEST_DELAY_MS = 1500;
const DOWNLOAD_TIMEOUT_MS = 60000;

/**
 * LibGen ebook source implementation
 */
export class LibGenSource implements EbookSource {
  id = 'libgen';
  name = 'LibGen';
  enabled = false;
  priority = 20; // Lower priority than Anna's Archive

  private mirrors: string[] = [];
  private successfulMirror: string | null = null;

  constructor(mirrors: string[] = []) {
    this.mirrors = mirrors;
  }

  /**
   * Search LibGen for ebooks
   */
  async search(params: EbookSearchParams, logger?: RMABLogger): Promise<EbookSearchResult[]> {
    const mirrorsToTry = this.getMirrorsToTry();

    for (const mirror of mirrorsToTry) {
      try {
        const results = await this.searchMirror(mirror, params, logger);
        if (results.length > 0) {
          this.successfulMirror = mirror;
          return results;
        }
      } catch (error) {
        logger?.warn(`LibGen mirror ${mirror} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return [];
  }

  /**
   * Search a specific LibGen mirror
   */
  private async searchMirror(
    mirror: string,
    params: EbookSearchParams,
    logger?: RMABLogger
  ): Promise<EbookSearchResult[]> {
    // Build search URL
    const query = encodeURIComponent(`${params.title} ${params.author}`);
    const searchUrl = `${trimTrailingSlashes(mirror)}/search.php?req=${query}&open=0&res=25&view=simple&column=def`;

    logger?.debug(`LibGen search URL: ${searchUrl}`);

    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': RMAB_USER_AGENT },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const results: EbookSearchResult[] = [];

    // Parse LibGen table rows
    $('table tr').each((i, elem) => {
      if (i === 0) return; // Skip header row

      const $row = $(elem);
      const cells = $row.find('td');

      if (cells.length < 5) return;

      // Extract title and author from first column
      const titleAuthor = $(cells[0]).text().trim();
      const [title, ...authorParts] = titleAuthor.split(/,\s*/);
      const author = authorParts.join(', ');

      // Extract MD5 from download link
      const downloadLink = $(cells[0]).find('a').attr('href');
      const md5Match = downloadLink?.match(/md5=([a-f0-9]{32})/);
      const md5 = md5Match ? md5Match[1] : undefined;

      // Extract format from file column
      const fileCell = $(cells[1]).text().trim();
      const formatMatch = fileCell.match(/\.(epub|pdf|mobi|azw3|djvu|fb2)$/i);
      const format = formatMatch ? formatMatch[1].toLowerCase() : 'unknown';

      // Extract size
      const sizeText = $(cells[2]).text().trim();
      const size = this.parseSize(sizeText);

      // Build download URL
      const downloadUrl = md5 ? `${trimTrailingSlashes(mirror)}/get.php?md5=${md5}` : '';

      if (downloadUrl && this.formatMatches(format, params.format)) {
        results.push({
          sourceId: this.id,
          sourceName: this.name,
          title: title || params.title,
          author: author || params.author,
          format,
          size,
          downloadUrl,
          md5,
        });
      }
    });

    logger?.debug(`LibGen found ${results.length} results on mirror ${mirror}`);
    return results;
  }

  /**
   * Download from LibGen
   */
  async download(result: EbookSearchResult, targetDir: string, logger?: RMABLogger): Promise<EbookDownloadResult> {
    try {
      logger?.info(`Downloading from LibGen: ${result.title}`);

      const response = await axios.get(result.downloadUrl, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { 'User-Agent': RMAB_USER_AGENT },
        maxRedirects: 5,
      });

      // Follow redirects to get actual file URL
      const finalUrl = response.request.res?.responseURL || result.downloadUrl;

      // Download file
      const filename = `${result.title} - ${result.author}.${result.format}`;
      const targetPath = `${targetDir}/${filename}`;

      const writer = require('fs').createWriteStream(targetPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          writer.close();
          resolve({
            success: true,
            filePath: targetPath,
            format: result.format,
          });
        });

        writer.on('error', (error: Error) => {
          writer.close();
          reject(error);
        });
      });
    } catch (error) {
      logger?.error(`LibGen download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeText: string): number | undefined {
    const match = sizeText.match(/([\d.]+)\s*(KB|MB|GB)/i);
    if (!match) return undefined;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case 'KB': return value * 1024;
      case 'MB': return value * 1024 * 1024;
      case 'GB': return value * 1024 * 1024 * 1024;
      default: return undefined;
    }
  }

  /**
   * Check if format matches preference
   */
  private formatMatches(foundFormat: string, preferredFormat: string): boolean {
    if (preferredFormat === 'any') return true;
    return foundFormat === preferredFormat;
  }

  /**
   * Get mirrors to try (successful mirror first, then others)
   */
  private getMirrorsToTry(): string[] {
    if (this.successfulMirror && this.mirrors.includes(this.successfulMirror)) {
      return [this.successfulMirror, ...this.mirrors.filter(m => m !== this.successfulMirror)];
    }
    return this.mirrors;
  }

  /**
   * Test LibGen connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.mirrors.length === 0) {
      return { success: false, message: 'No mirrors configured' };
    }

    try {
      const mirror = this.mirrors[0];
      const response = await axios.get(`${trimTrailingSlashes(mirror)}/`, {
        headers: { 'User-Agent': RMAB_USER_AGENT },
        timeout: 10000,
      });

      if (response.status === 200) {
        return { success: true, message: `Connected to ${mirror}` };
      }

      return { success: false, message: `HTTP ${response.status} from ${mirror}` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}
