/**
 * Component: Standalone Ebook Catalog Search
 * Documentation: documentation/integrations/ebook-sidecar.md
 */

import * as cheerio from 'cheerio';

export interface EbookCatalogBook {
  catalogId: string;
  title: string;
  author: string;
  isbn?: string;
  coverArtUrl?: string;
  description?: string;
  year?: number;
}

export interface EbookCatalogSearchResult {
  results: EbookCatalogBook[];
  page: number;
  totalResults: number;
  hasMore: boolean;
}

interface OpenLibrarySearchResponse {
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    isbn?: string[];
    cover_i?: number;
    first_publish_year?: number;
  }>;
  numFound?: number;
  start?: number;
}

const PAGE_SIZE = 24;
const SEARCH_TIMEOUT_MS = 10_000;
const LIBGEN_TIMEOUT_MS = 12_000;

export interface LibgenRelease {
  guid: string;
  title: string;
  size: number;
  seeders: number;
  indexer: string;
  publishDate: Date;
  downloadUrl: string;
  infoUrl: string;
  score: number;
  finalScore: number;
  source: 'libgen';
  format: string;
  md5: string;
}

function parseLibgenSize(value: string): number {
  const match = value.trim().match(/^([\d.]+)\s*(b|kb|kib|mb|mib|gb|gib)?$/i);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] ?? 'b').toLowerCase();
  const multiplier = unit.startsWith('g') ? 1024 ** 3
    : unit.startsWith('m') ? 1024 ** 2
      : unit.startsWith('k') ? 1024 : 1;
  return Number.isFinite(amount) ? Math.round(amount * multiplier) : 0;
}

export async function searchLibgen(
  query: string,
  mirrorUrls: string[],
): Promise<LibgenRelease[]> {
  const normalizedQuery = query.trim().slice(0, 200);
  for (const rawMirror of mirrorUrls) {
    let mirror: URL;
    try {
      mirror = new URL(rawMirror);
    } catch {
      continue;
    }
    if (!['https:', 'http:'].includes(mirror.protocol)) continue;
    mirror.pathname = `${mirror.pathname.replace(/\/+$/, '')}/index.php`;
    mirror.search = new URLSearchParams({ req: normalizedQuery, res: '25' }).toString();

    let response: Response;
    try {
      response = await fetch(mirror, {
        headers: { Accept: 'text/html', 'User-Agent': 'ReadMeABook/1.0' },
        signal: AbortSignal.timeout(LIBGEN_TIMEOUT_MS),
      });
    } catch {
      continue;
    }
    if (!response.ok) continue;

    const html = await response.text();
    const $ = cheerio.load(html);
    const table = $('table#tablelibgen');
    if (table.length === 0) continue;

    const releases: LibgenRelease[] = [];
    table.find('tr').slice(1).each((_index, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const lastCell = cells.last().html() ?? '';
      const md5 = lastCell.match(/md5=([0-9a-f]{32})/i)?.[1]?.toLowerCase();
      const title = $(cells[0]).text().replace(/\s+/g, ' ').trim();
      if (!md5 || !title) return;
      const format = $(cells[cells.length - 2]).text().trim().toLowerCase();
      const size = parseLibgenSize($(cells[cells.length - 3]).text());
      const info = new URL('/ads.php', mirror);
      info.searchParams.set('md5', md5);
      releases.push({
        guid: `libgen-${md5}`,
        title,
        size,
        seeders: 0,
        indexer: 'LibGen',
        publishDate: new Date(),
        downloadUrl: info.toString(),
        infoUrl: info.toString(),
        score: 100,
        finalScore: 100,
        source: 'libgen',
        format,
        md5,
      });
    });
    return releases;
  }
  return [];
}

export async function resolveLibgenDownloadUrl(
  md5: string,
  mirrorUrls: string[],
): Promise<{ downloadUrl: string; referer: string } | null> {
  if (!/^[0-9a-f]{32}$/i.test(md5)) return null;
  for (const rawMirror of mirrorUrls) {
    let mirror: URL;
    try {
      mirror = new URL(rawMirror);
    } catch {
      continue;
    }
    if (!['https:', 'http:'].includes(mirror.protocol)) continue;
    const referer = new URL('/ads.php', mirror);
    referer.searchParams.set('md5', md5);
    let response: Response;
    try {
      response = await fetch(referer, {
        headers: { Accept: 'text/html', Referer: `${mirror.origin}/`, 'User-Agent': 'ReadMeABook/1.0' },
        signal: AbortSignal.timeout(LIBGEN_TIMEOUT_MS),
      });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const html = await response.text();
    const $ = cheerio.load(html);
    const href = $('a[href*="get.php"]').toArray()
      .map((anchor) => $(anchor).attr('href') ?? '')
      .find((value) => /get\.php\?[^"'<>]*md5=[^"'<>]*key=/i.test(value));
    if (!href) continue;
    const downloadUrl = new URL(href.replace(/&amp;/g, '&'), mirror).toString();
    if (new URL(downloadUrl).origin !== mirror.origin) continue;
    return { downloadUrl, referer: referer.toString() };
  }
  return null;
}

export function normalizeOpenLibraryBook(
  record: OpenLibrarySearchResponse['docs'] extends (infer T)[] | undefined ? T : never,
): EbookCatalogBook | null {
  if (!record || typeof record !== 'object') return null;
  const item = record as NonNullable<OpenLibrarySearchResponse['docs']>[number];
  const catalogId = typeof item.key === 'string' ? item.key.replace(/^\/works\//, '') : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const author = Array.isArray(item.author_name)
    ? item.author_name.find((name) => typeof name === 'string' && name.trim())?.trim() ?? ''
    : '';

  if (!catalogId || !title) return null;

  const isbn = Array.isArray(item.isbn)
    ? item.isbn.find((value) => typeof value === 'string' && value.trim())?.trim()
    : undefined;
  const coverArtUrl =
    typeof item.cover_i === 'number' && Number.isSafeInteger(item.cover_i)
      ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
      : undefined;

  return {
    catalogId,
    title,
    author,
    ...(isbn ? { isbn } : {}),
    ...(coverArtUrl ? { coverArtUrl } : {}),
    ...(Number.isInteger(item.first_publish_year) ? { year: item.first_publish_year } : {}),
  };
}

export async function searchOpenLibrary(
  query: string,
  page = 1,
): Promise<EbookCatalogSearchResult> {
  const normalizedQuery = query.trim().slice(0, 200);
  const normalizedPage = Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
  if (!normalizedQuery) {
    return { results: [], page: normalizedPage, totalResults: 0, hasMore: false };
  }

  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', normalizedQuery);
  url.searchParams.set('fields', 'key,title,author_name,isbn,cover_i,first_publish_year');
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('page', String(normalizedPage));

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ReadMeABook/1.0' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Open Library search failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as OpenLibrarySearchResponse;
  const rawResults = Array.isArray(data.docs) ? data.docs : [];
  const results = rawResults
    .map((record) => normalizeOpenLibraryBook(record))
    .filter((book): book is EbookCatalogBook => book !== null);
  const totalResults = Number.isSafeInteger(data.numFound) ? Math.max(0, data.numFound ?? 0) : 0;

  return {
    results,
    page: normalizedPage,
    totalResults,
    hasMore: (data.start ?? (normalizedPage - 1) * PAGE_SIZE) + rawResults.length < totalResults,
  };
}
