/**
 * Component: Welib E-book Source
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * Welib scraper for ebook downloads
 * Parses Anna's Archive-style slow_download links
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
 * Welib ebook source implementation
 */
export class WelibSource implements EbookSource {
  id = 'welib';
  name = 'Welib';
  enabled = false;
  priority = 50;

  private mirrors: string[] = [];
  private successfulMirror: string | null = null;
  private flaresolverrUrl?: string;

  constructor(mirrors: string[] = [], flaresolverrUrl?: string) {
    this.mirrors = mirrors;
    this.flaresolverrUrl = flaresolverrUrl;
  }

  /**
   * Search Welib for ebooks
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
        logger?.warn(`Welib mirror ${mirror} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return [];
  }

  /**
   * Search a specific Welib mirror
   */
  private async searchMirror(
    mirror: string,
    params: EbookSearchParams,
    logger?: RMABLogger
  ): Promise<EbookSearchResult[]> {
    const query = encodeURIComponent(`${params.title} ${params.author}`);
    const searchUrl = `${trimTrailingSlashes(mirror)}/search?q=${query}`;

    logger?.debug(`Welib search URL: ${searchUrl}`);

    const html = await this.fetchHtml(searchUrl, logger);
    const $ = cheerio.load(html);
    const results: EbookSearchResult[] = [];

    // Parse Welib search results (similar to Anna's Archive)
    $('a[href*="/md5/"]').each((i, elem) => {
      const $link = $(elem);
      const href = $link.attr('href');
      if (!href) return;

      const md5Match = href.match(/\/md5\/([a-f0-9]+)/);
      const md5 = md5Match ? md5Match[1] : undefined;
      if (!md5) return;

      const title = $link.text().trim();
      const author = ''; // Welib may not have separate author field
      const format = 'epub'; // Default format

      results.push({
        sourceId: this.id,
        sourceName: this.name,
        title,
        author,
        format,
        downloadUrl: `${trimTrailingSlashes(mirror)}${href}`,
        md5,
      });
    });

    logger?.debug(`Welib found ${results.length} results on mirror ${mirror}`);
    return results;
  }

  /**
   * Download from Welib
   */
  async download(result: EbookSearchResult, targetDir: string, logger?: RMABLogger): Promise<EbookDownloadResult> {
    try {
      logger?.info(`Downloading from Welib: ${result.title}`);

      // Get slow download links from MD5 page
      const slowLinks = await this.getSlowDownloadLinks(result.md5!, result.downloadUrl, logger);

      if (slowLinks.length === 0) {
        return {
          success: false,
          error: 'No download links available',
        };
      }

      // Try first slow download link
      const slowLink = slowLinks[0];
      const extracted = await this.extractDownloadUrl(slowLink, logger);

      if (!extracted) {
        return {
          success: false,
          error: 'Failed to extract download URL',
        };
      }

      // Download file
      const response = await axios.get(extracted.url, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { 'User-Agent': RMAB_USER_AGENT },
        maxRedirects: 5,
      });

      const filename = `${result.title} - ${result.author}.${extracted.format}`;
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
            format: extracted.format,
          });
        });

        writer.on('error', (error: Error) => {
          writer.close();
          reject(error);
        });
      });
    } catch (error) {
      logger?.error(`Welib download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  }

  /**
   * Get slow download links from MD5 page
   */
  private async getSlowDownloadLinks(md5: string, baseUrl: string, logger?: RMABLogger): Promise<string[]> {
    const html = await this.fetchHtml(baseUrl, logger);
    const $ = cheerio.load(html);
    const slowLinks: string[] = [];

    $('a[href*="/slow_download/"]').each((i, elem) => {
      const $link = $(elem);
      const href = $link.attr('href');
      const linkText = $link.text().toLowerCase();
      const parentText = $link.parent().text().toLowerCase();

      // Check for "no waitlist"
      if (linkText.includes('no waitlist') || parentText.includes('no waitlist')) {
        if (href) {
          const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          slowLinks.push(fullUrl);
        }
      }
    });

    return slowLinks;
  }

  /**
   * Extract actual download URL from slow download page
   */
  private async extractDownloadUrl(slowDownloadUrl: string, logger?: RMABLogger): Promise<{ url: string; format: string } | null> {
    const html = await this.fetchHtml(slowDownloadUrl, logger);
    const $ = cheerio.load(html);

    // Look for download URL in pre/code blocks
    const pattern = /(https?:\/\/[^\s]+\.(epub|pdf|mobi|azw3|djvu|fb2))/i;
    const match = html.match(pattern);

    if (match) {
      const url = match[1];
      const formatMatch = url.match(/\.(epub|pdf|mobi|azw3|djvu|fb2)$/i);
      const format = formatMatch ? formatMatch[1].toLowerCase() : 'epub';
      return { url, format };
    }

    return null;
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
   * Get mirrors to try
   */
  private getMirrorsToTry(): string[] {
    if (this.successfulMirror && this.mirrors.includes(this.successfulMirror)) {
      return [this.successfulMirror, ...this.mirrors.filter(m => m !== this.successfulMirror)];
    }
    return this.mirrors;
  }

  /**
   * Test Welib connection
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
