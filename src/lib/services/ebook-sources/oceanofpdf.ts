/**
 * Component: OceanofPDF E-book Source
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * OceanofPDF scraper for ebook downloads
 * Supports mirror configuration and direct HTTP downloads
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
 * OceanofPDF ebook source implementation
 */
export class OceanofPDFSource implements EbookSource {
  id = 'oceanofpdf';
  name = 'OceanofPDF';
  enabled = false;
  priority = 40;

  private mirrors: string[] = [];
  private successfulMirror: string | null = null;

  constructor(mirrors: string[] = []) {
    this.mirrors = mirrors;
  }

  /**
   * Search OceanofPDF for ebooks
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
        logger?.warn(`OceanofPDF mirror ${mirror} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return [];
  }

  /**
   * Search a specific OceanofPDF mirror
   */
  private async searchMirror(
    mirror: string,
    params: EbookSearchParams,
    logger?: RMABLogger
  ): Promise<EbookSearchResult[]> {
    const query = encodeURIComponent(`${params.title} ${params.author}`);
    const searchUrl = `${trimTrailingSlashes(mirror)}/search?q=${query}`;

    logger?.debug(`OceanofPDF search URL: ${searchUrl}`);

    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': RMAB_USER_AGENT },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const results: EbookSearchResult[] = [];

    // Parse OceanofPDF search results
    $('.search-result-item').each((i, elem) => {
      const $item = $(elem);

      const title = $item.find('.title').text().trim();
      const author = $item.find('.author').text().trim();
      const format = 'pdf'; // OceanofPDF primarily has PDF

      // Extract download link
      const downloadLink = $item.find('a[href*="/download/"]').attr('href');
      if (!downloadLink) return;

      // Extract size
      const sizeText = $item.find('.size').text().trim();
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

    logger?.debug(`OceanofPDF found ${results.length} results on mirror ${mirror}`);
    return results;
  }

  /**
   * Download from OceanofPDF
   */
  async download(result: EbookSearchResult, targetDir: string, logger?: RMABLogger): Promise<EbookDownloadResult> {
    try {
      logger?.info(`Downloading from OceanofPDF: ${result.title}`);

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
      logger?.error(`OceanofPDF download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Get mirrors to try
   */
  private getMirrorsToTry(): string[] {
    if (this.successfulMirror && this.mirrors.includes(this.successfulMirror)) {
      return [this.successfulMirror, ...this.mirrors.filter(m => m !== this.successfulMirror)];
    }
    return this.mirrors;
  }

  /**
   * Test OceanofPDF connection
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
