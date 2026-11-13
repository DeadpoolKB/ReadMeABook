import type { Config } from '../config.js';
import type { QobuzProvider, QobuzStream, QobuzTrack, Quality } from '../types.js';
import { UpstreamError } from './http.js';
import { getRemoteBitrate, estimateBitrate } from './bitrate.js';

type JsonRecord = Record<string, unknown>;

/**
 * Track durations cached by track ID.
 *
 * We use this when calculating the average FLAC bitrate
 * without downloading the audio file.
 */
const trackDurationCache = new Map<string, number>();

export class ArchiveProvider implements QobuzProvider {
  constructor(private readonly config: Config) {}

  async search(query: string, _quality: Quality, _atmos: string): Promise<QobuzTrack[]> {
    // Search Internet Archive for FLAC audio files
    const searchQuery = `format:(Flac OR "24bit Flac") AND mediatype:audio AND (${query})`;
    const body = await this.request('/advancedsearch.php', {
      q: searchQuery,
      fl: ['identifier', 'title', 'creator', 'year'],
      output: 'json',
      rows: '10',
    });

    const docs = isRecord(body) && isRecord(body.response) && Array.isArray(body.response.docs)
      ? body.response.docs
      : [];

    const tracks: QobuzTrack[] = [];

    for (const doc of docs.filter(isRecord)) {
      const identifier = stringValue(doc.identifier);
      if (!identifier) continue;

      // Get item metadata to find FLAC files and durations
      try {
        const metadata = await this.request(`/metadata/${identifier}`, {});
        if (isRecord(metadata) && Array.isArray(metadata.files)) {
          const flacFiles = metadata.files.filter(isRecord).filter(f => stringValue(f.format) === 'Flac');
          for (const file of flacFiles) {
            const filename = stringValue(file.name);
            const title = stringValue(file.title) || stringValue(doc.title);
            const artist = Array.isArray(doc.creator) ? stringValue(doc.creator[0]) : stringValue(doc.creator);
            const duration = typeof file.duration === 'number' ? file.duration : undefined;

            if (filename && title) {
              const upstreamId = `${identifier}|${filename}`;
              tracks.push({
                upstreamId,
                title: title.trim(),
                artist: artist?.trim(),
                album: identifier,
                duration,
                format: 'flac',
                audioQuality: 'LOSSLESS',
              });

              // Cache duration for bitrate calculation
              if (duration && duration > 0) {
                trackDurationCache.set(upstreamId, duration);
              }
            }
          }
        }
      } catch (error) {
        // Skip items where metadata fetch fails
        continue;
      }
    }

    return tracks;
  }

  async getStream(trackId: string, _quality: Quality, _atmos: string): Promise<QobuzStream | null> {
    const separator = trackId.indexOf('|');
    if (separator <= 0) return null;

    const identifier = trackId.slice(0, separator);
    const filename = trackId.slice(separator + 1);

    const streamUrl = new URL(`/download/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`, this.baseUrl()).toString();

    // Retrieve cached duration for bitrate calculation
    const duration = trackDurationCache.get(trackId);

    // Calculate bitrate if enabled and we have duration
    let bitrate: number | undefined;
    if (this.config.enableBitrate !== false && duration && duration > 0) {
      const bitrateKbps = await getRemoteBitrate(streamUrl, duration);
      if (bitrateKbps !== undefined) {
        bitrate = bitrateKbps * 1000; // Convert to bits per second
      }
    }

    // Fallback to estimated bitrate if remote calculation failed and bitrate is enabled
    if (this.config.enableBitrate !== false && !bitrate) {
      bitrate = estimateBitrate(undefined, undefined, _quality);
    }

    return {
      url: streamUrl,
      format: 'flac',
      quality: 'LOSSLESS',
      manifest: 'none',
      encrypted: false,
      bitrate,
    };
  }

  private baseUrl(): string {
    return this.config.archiveBaseUrl ?? 'https://archive.org';
  }

  private async request(path: string, params: Record<string, string | string[]>): Promise<unknown> {
    const url = new URL(path, this.baseUrl());
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, value);
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.upstreamRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(this.config.requestTimeoutMs, 10000));
      try {
        const response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new UpstreamError(502, 'Archive returned invalid JSON');
        }
        if (!response.ok) {
          const error = new UpstreamError(
            retryableStatus(response.status) ? 502 : response.status === 404 ? 404 : 400,
            'Archive request failed'
          );
          if (!retryableStatus(response.status) || attempt >= this.config.upstreamRetries) throw error;
          lastError = error;
        } else {
          return body;
        }
      } catch (error) {
        if (error instanceof UpstreamError) {
          if (error.status !== 502 || attempt >= this.config.upstreamRetries) throw error;
        }
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
      await delay(200 * 2 ** attempt);
    }
    throw lastError instanceof UpstreamError ? lastError : new UpstreamError(502, 'Archive request failed');
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
