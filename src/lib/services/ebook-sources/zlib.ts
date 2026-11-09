/**
 * Component: Z-Library E-book Source
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * Z-Library scraper for ebook downloads
 * Requires Cloudflare bypass via FlareSolverr
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
 * Z-Library ebook source implementation
 */
export class ZLibrarySource implements EbookSource {
  id = 'zlib';
  name = 'Z-Library';
  enabled = false;
  priority = 30;

  private mirrors: string[] = [];
  private successfulMirror: string | null = null;
  private flaresolverrUrl?: string;

  constructor(mirrors: string[] = [], flaresolverrUrl?: string) {
    this.mirrors = mirrors;
    this.flaresolverrUrl = flaresolverrUrl;
  }

  /**
   * Search Z-Library for ebooks
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
        logger?.warn(`Z-Library mirror ${mirror} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return [];
  }

  /**
   * Search a specific Z-Library mirror
   */
  private async searchMirror(
    mirror: string,
    params: EbookSearchParams,
    logger?: RMABLogger
  ): Promise<EbookSearchResult[]> {
    const query = encodeURIComponent(`${params.title} ${params.author}`);
    const searchUrl = `${trimTrailingSlashes(mirror)}/s/${query}?page=1`;

    logger?.debug(`Z-Library search URL: ${searchUrl}`);

    const html = await this.fetchHtml(searchUrl, logger);
    const $ = cheerio.load(html);
    const results: EbookSearchResult[] = [];

    // Parse Z-Library book cards
    $('.bookRow').each((i, elem) => {
      const $row = $(elem);

      const title = $row.find('h3[itemprop="name"]').text().trim();
      const author = $row.find('a[itemprop="author"]').text().trim();
      const format = 'epub'; // Z-Library primarily has EPUB

      // Extract download link
      const downloadLink = $row.find('a[title="Download"]').attr('href');
      if (!downloadLink) return;

      // Extract size
      const sizeText = $row.find('.property__file .property_value').text().trim();
      const size = this.parseSize(sizeText);

      results.push({
        sourceId: this.id,
        sourceName: this.name,
        title,
        author,
        format,
        size,
        downloadUrl: downloadLink.startsWith('http') ? downloadLink : `${trimTrailingSlashes(mirror)}${downloadLink}`,
      });
    });

    logger?.debug(`Z-Library found ${results.length} results on mirror ${mirror}`);
    return results;
  }

  /**
   * Download from Z-Library
   */
  async download(result: EbookSearchResult, targetDir: string, logger?: RMABLogger): Promise<EbookDownloadResult> {
    try {
      logger?.info(`Downloading from Z-Library: ${result.title}`);

      const response = await axios.get(result.downloadUrl, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { 'User-Agent': RMAB_USER_AGENT },
        maxRedirects: 5,
      });

      const filename = `${result.title} - ${result.author}.${result.format}`;
      const targetPath = `${targetDir}/${filename}`;

      const fs = require('fs');
      const writer = fs.createWriteStream(targetPath);
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
      logger?.error(`Z-Library download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  }

  /**
   * Fetch HTML with FlareSolverr if configured
   */
  private async fetchHtml(url: string, logger?: RMABLogger): Promise<string> {
    if (this.flaresolverrUrl) {
      try {
        const response = await axios.post(
          `${trimTrailingSlashes(this.flaresolverrUrl)}/v1`,
          {
            cmd: 'request.get',
            url,
            maxTimeout: 60000,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 65000,
          }
        );

        if (response.data.status === 'ok' && response.data.solution) {
          return response.data.solution.response;
        }
      } catch (error) {
        logger?.warn(`FlareSolverr failed, falling back to direct: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Direct request
    const response = await axios.get(url, {
      headers: { 'User-Agent': RMAB_USER_AGENT },
      timeout: 30000,
    });

    return response.data;
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
   * Get mirrors to try
   */
  private getMirrorsToTry(): string[] {
    if (this.successfulMirror && this.mirrors.includes(this.successfulMirror)) {
      return [this.successfulMirror, ...this.mirrors.filter(m => m !== this.successfulMirror)];
    }
    return this.mirrors;
  }

  /**
   * Test Z-Library connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.mirrors.length === 0) {
      return { success: false, message: 'No mirrors configured' };
    }

    try {
      const mirror = this.mirrors[0];
      const html = await this.fetchHtml(mirror);

      if (html.includes('Z-Library')) {
        return { success: true, message: `Connected to ${mirror}` };
      }

      return { success: false, message: 'Did not get expected response from Z-Library' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}
