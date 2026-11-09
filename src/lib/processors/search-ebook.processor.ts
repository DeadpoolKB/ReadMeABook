/**
 * Component: Search Ebook Job Processor
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * Searches for ebook downloads using multiple sources:
 * 1. Anna's Archive (if enabled) - direct HTTP downloads
 * 2. LibGen (if enabled) - direct HTTP downloads
 * 3. Z-Library (if enabled) - direct HTTP downloads
 * 4. OceanofPDF (if enabled) - direct HTTP downloads
 * 5. Welib (if enabled) - direct HTTP downloads
 * 6. Indexer Search (if enabled) - via Prowlarr with ebook categories
 */

import { SearchEbookPayload, EbookSearchResult, getJobQueueService } from '../services/job-queue.service';
import { prisma } from '../db';
import { getConfigService } from '../services/config.service';
import { RMABLogger } from '../utils/logger';
import { buildEbookDownloadName } from '../utils/ebook-download-name';
import { getProwlarrService } from '../integrations/prowlarr.service';
import { EBOOK_MAX_SIZE_MB, rankEbookTorrents, RankedEbookTorrent } from '../utils/ranking-algorithm';
import { groupIndexersByCategories, getGroupDescription } from '../utils/indexer-grouping';
import { getLanguageForRegion } from '../constants/language-config';
import { filterBlockedResults } from '../utils/filter-blocked-results';
import { addGroupSearch, logSearchSummary, newSearchStats, noResultsMessage, recordFailure, type SearchStats } from '../utils/indexer-search-failures';
import type { AudibleRegion } from '../types/audible';

// Import ebook scraper functions for Anna's Archive
import {
  searchByAsin,
  searchByTitle,
  getSlowDownloadLinks,
} from '../services/ebook-scraper';

// Import new source registry and sources
import { ebookSourceRegistry } from '../services/ebook-sources/registry';
import { LibGenSource } from '../services/ebook-sources/libgen';
import { ZLibrarySource } from '../services/ebook-sources/zlib';
import { OceanofPDFSource } from '../services/ebook-sources/oceanofpdf';
import { WelibSource } from '../services/ebook-sources/welib';
import type { EbookSearchParams, EbookSearchResult as SourceSearchResult } from '../services/ebook-sources/base';

/**
 * Process search ebook job
 * Searches Anna's Archive first (if enabled), then falls back to indexer search (if enabled)
 */
export async function processSearchEbook(payload: SearchEbookPayload): Promise<any> {
  const { requestId, audiobook, preferredFormat: payloadFormat, jobId } = payload;

  const logger = RMABLogger.forJob(jobId, 'SearchEbook');

  logger.info(`Processing ebook request ${requestId} for "${audiobook.title}"`);

  try {
    // Update request status to searching and fetch custom search terms
    const requestRecord = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: 'searching',
        searchAttempts: { increment: 1 },
        updatedAt: new Date(),
      },
      select: { customSearchTerms: true },
    });

    // Use custom search terms if set, otherwise use audiobook title
    const effectiveSearchTitle = requestRecord?.customSearchTerms || audiobook.title;
    const searchAudiobook = { ...audiobook, title: effectiveSearchTitle };

    if (requestRecord?.customSearchTerms) {
      logger.info(`Using custom search terms: "${effectiveSearchTitle}" (original: "${audiobook.title}")`);
    }

    // Get ebook configuration
    const configService = getConfigService();
    const preferredFormat = payloadFormat || await configService.get('ebook_sidecar_preferred_format') || 'epub';
    const annasArchiveEnabled = await configService.get('ebook_annas_archive_enabled') === 'true';
    const indexerSearchEnabled = await configService.get('ebook_indexer_search_enabled') === 'true';
    const libgenEnabled = await configService.get('ebook_libgen_enabled') === 'true';
    const zlibEnabled = await configService.get('ebook_zlib_enabled') === 'true';
    const oceanofpdfEnabled = await configService.get('ebook_oceanofpdf_enabled') === 'true';
    const welibEnabled = await configService.get('ebook_welib_enabled') === 'true';

    // Get language code
    const region = await configService.getAudibleRegion() as AudibleRegion;
    const langConfig = getLanguageForRegion(region);
    const languageCode = langConfig.annasArchiveLang;

    // Get FlareSolverr URL
    const flaresolverrUrl = await configService.get('ebook_sidecar_flaresolverr_url') || undefined;

    // Get mirror configurations
    const annasArchiveMirrors = (await configService.get('ebook_annas_archive_mirrors') || '').split(',').map(m => m.trim()).filter(m => m);
    const libgenMirrors = (await configService.get('ebook_libgen_mirrors') || '').split(',').map(m => m.trim()).filter(m => m);
    const zlibMirrors = (await configService.get('ebook_zlib_mirrors') || '').split(',').map(m => m.trim()).filter(m => m);
    const oceanofpdfMirrors = (await configService.get('ebook_oceanofpdf_mirrors') || '').split(',').map(m => m.trim()).filter(m => m);
    const welibMirrors = (await configService.get('ebook_welib_mirrors') || '').split(',').map(m => m.trim()).filter(m => m);

    logger.info(`Sources: Anna's Archive=${annasArchiveEnabled}, LibGen=${libgenEnabled}, Z-Library=${zlibEnabled}, OceanofPDF=${oceanofpdfEnabled}, Welib=${welibEnabled}, Indexer Search=${indexerSearchEnabled}`);
    logger.info(`Preferred format: ${preferredFormat}`);

    // Initialize and register sources
    initializeSources(
      annasArchiveEnabled,
      libgenEnabled,
      zlibEnabled,
      oceanofpdfEnabled,
      welibEnabled,
      annasArchiveMirrors,
      libgenMirrors,
      zlibMirrors,
      oceanofpdfMirrors,
      welibMirrors,
      flaresolverrUrl
    );

    // Track results
    let annasArchiveResult: EbookSearchResult | null = null;
    let additionalSourceResults: SourceSearchResult[] = [];
    let indexerResult: RankedEbookTorrent | null = null;
    const indexerSearchStats = newSearchStats();

    // ========== STEP 1: Try Anna's Archive (if enabled) ==========
    if (annasArchiveEnabled) {
      logger.info(`Searching Anna's Archive...`);
      annasArchiveResult = await searchAnnasArchive(searchAudiobook, preferredFormat, logger, languageCode, flaresolverrUrl);

      if (annasArchiveResult) {
        logger.info(`Found ebook via Anna's Archive (score: ${annasArchiveResult.score})`);
      } else {
        logger.info(`No results from Anna's Archive`);
      }
    }

    // ========== STEP 2: Search additional direct download sources in parallel ==========
    const enabledDirectSources = libgenEnabled || zlibEnabled || oceanofpdfEnabled || welibEnabled;
    if (enabledDirectSources) {
      logger.info(`Searching additional direct download sources in parallel...`);
      additionalSourceResults = await ebookSourceRegistry.searchAll(
        {
          title: searchAudiobook.title,
          author: searchAudiobook.author,
          asin: searchAudiobook.asin,
          format: preferredFormat,
          language: languageCode,
        },
        logger
      );

      logger.info(`Found ${additionalSourceResults.length} results from additional sources`);
    }

    // ========== STEP 3: Try Indexer Search (if enabled) ==========
    if (indexerSearchEnabled) {
      logger.info(`Searching indexers...`);
      indexerResult = await searchIndexers(requestId, searchAudiobook, preferredFormat, logger, indexerSearchStats);

      if (indexerResult) {
        logger.info(`Found ebook via indexer search (score: ${indexerResult.finalScore.toFixed(1)})`);
      } else {
        logger.info(`No results from indexer search`);
      }
    }

    // ========== STEP 4: Handle Results ==========
    // Combine all results and select best
    const allResults = [];

    if (annasArchiveResult) {
      allResults.push({ ...annasArchiveResult, source: 'annas_archive' });
    }

    additionalSourceResults.forEach(result => {
      allResults.push({ ...result, source: result.sourceId });
    });

    if (indexerResult) {
      allResults.push({ ...indexerResult, source: 'prowlarr' });
    }

    if (allResults.length === 0) {
      // No results found from any source
      const enabledSources = [];
      if (annasArchiveEnabled) enabledSources.push("Anna's Archive");
      if (libgenEnabled) enabledSources.push("LibGen");
      if (zlibEnabled) enabledSources.push("Z-Library");
      if (oceanofpdfEnabled) enabledSources.push("OceanofPDF");
      if (welibEnabled) enabledSources.push("Welib");
      if (indexerSearchEnabled) enabledSources.push("Indexer Search");

      const message = enabledSources.length > 0
        ? noResultsMessage(`No ebook found on ${enabledSources.join(' or ')}`, indexerSearchStats,
          annasArchiveEnabled ? "No ebook found on Anna's Archive. " : '')
        : 'No ebook sources enabled. Enable ebook sources in settings.';

      logger.warn(`No ebook found for request ${requestId}, marking as awaiting_search`);

      await prisma.request.update({
        where: { id: requestId },
        data: {
          status: 'awaiting_search',
          errorMessage: message,
          lastSearchAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        success: false,
        message: 'No ebook found, queued for re-search',
        requestId,
      };
    }

    // Select best result (simple implementation - first result)
    // TODO: Implement unified ranking algorithm
    const bestResult = allResults[0];

    logger.info(`Selected best result from source: ${bestResult.source}`);

    // ========== STEP 5: Route to Appropriate Download ==========
    if (bestResult.source === 'annas_archive') {
      return await handleAnnasArchiveDownload(requestId, audiobook, bestResult as EbookSearchResult, preferredFormat, logger);
    } else if (bestResult.source === 'prowlarr') {
      return await handleIndexerDownload(requestId, audiobook, bestResult as RankedEbookTorrent, preferredFormat, logger);
    } else {
      // Handle additional direct download sources
      return await handleDirectSourceDownload(requestId, audiobook, bestResult as SourceSearchResult, preferredFormat, logger);
    }

  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    await prisma.request.update({
      where: { id: requestId },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error during ebook search',
        updatedAt: new Date(),
      },
    });

    throw error;
  }
}

/**
 * Initialize and register ebook sources
 */
function initializeSources(
  annasArchiveEnabled: boolean,
  libgenEnabled: boolean,
  zlibEnabled: boolean,
  oceanofpdfEnabled: boolean,
  welibEnabled: boolean,
  annasArchiveMirrors: string[],
  libgenMirrors: string[],
  zlibMirrors: string[],
  oceanofpdfMirrors: string[],
  welibMirrors: string[],
  flaresolverrUrl?: string
): void {
  // Clear existing sources
  const allSources = ebookSourceRegistry.getAllSources();
  allSources.forEach(source => ebookSourceRegistry.unregister(source.id));

  // Register LibGen
  if (libgenEnabled && libgenMirrors.length > 0) {
    const libgen = new LibGenSource(libgenMirrors);
    libgen.enabled = true;
    ebookSourceRegistry.register(libgen);
  }

  // Register Z-Library
  if (zlibEnabled && zlibMirrors.length > 0) {
    const zlib = new ZLibrarySource(zlibMirrors, flaresolverrUrl);
    zlib.enabled = true;
    ebookSourceRegistry.register(zlib);
  }

  // Register OceanofPDF
  if (oceanofpdfEnabled && oceanofpdfMirrors.length > 0) {
    const oceanofpdf = new OceanofPDFSource(oceanofpdfMirrors);
    oceanofpdf.enabled = true;
    ebookSourceRegistry.register(oceanofpdf);
  }

  // Register Welib
  if (welibEnabled && welibMirrors.length > 0) {
    const welib = new WelibSource(welibMirrors, flaresolverrUrl);
    welib.enabled = true;
    ebookSourceRegistry.register(welib);
  }
}

/**
 * Search Anna's Archive for ebook
 */
async function searchAnnasArchive(
  audiobook: { title: string; author: string; asin?: string },
  preferredFormat: string,
  logger: RMABLogger,
  languageCode: string = 'en',
  flaresolverrUrl?: string
): Promise<EbookSearchResult | null> {
  const configService = getConfigService();
  const baseUrl = await configService.get('ebook_sidecar_base_url') || 'https://annas-archive.gl';

  if (flaresolverrUrl) {
    logger.info(`Using FlareSolverr at ${flaresolverrUrl}`);
  }

  let md5: string | null = null;
  let searchMethod: 'asin' | 'title' = 'title';

  // Try ASIN search first (exact match - best)
  if (audiobook.asin) {
    logger.info(`Searching Anna's Archive by ASIN: ${audiobook.asin} (format: ${preferredFormat})...`);
    md5 = await searchByAsin(audiobook.asin, preferredFormat, baseUrl, logger, flaresolverrUrl, languageCode);

    if (md5) {
      logger.info(`Found via ASIN: ${md5}`);
      searchMethod = 'asin';
    } else {
      logger.info(`No ASIN results, trying title + author...`);
    }
  }

  // Fallback to title + author search
  if (!md5) {
    logger.info(`Searching Anna's Archive by title + author: "${audiobook.title}" by ${audiobook.author}...`);
    md5 = await searchByTitle(audiobook.title, audiobook.author, preferredFormat, baseUrl, logger, flaresolverrUrl, languageCode);

    if (md5) {
      logger.info(`Found via title search: ${md5}`);
      searchMethod = 'title';
    }
  }

  if (!md5) {
    return null;
  }

  // Get slow download links
  const slowLinks = await getSlowDownloadLinks(md5, baseUrl, logger, flaresolverrUrl);

  if (slowLinks.length === 0) {
    logger.warn(`Found MD5 ${md5} but no download links available`);
    return null;
  }

  logger.info(`Found ${slowLinks.length} download link(s) for MD5 ${md5}`);

  return {
    md5,
    title: audiobook.title,
    author: audiobook.author,
    format: preferredFormat,
    downloadUrls: slowLinks,
    source: 'annas_archive',
    score: searchMethod === 'asin' ? 100 : 80,
  };
}

/**
 * Search indexers for ebook torrents/NZBs
 */
async function searchIndexers(
  requestId: string,
  audiobook: { title: string; author: string },
  preferredFormat: string,
  logger: RMABLogger,
  searchStats: SearchStats
): Promise<RankedEbookTorrent | null> {
  const configService = getConfigService();

  // Get enabled indexers from configuration
  const indexersConfigStr = await configService.get('prowlarr_indexers');

  if (!indexersConfigStr) {
    logger.warn('No indexers configured');
    return null;
  }

  const indexersConfig = JSON.parse(indexersConfigStr);

  if (indexersConfig.length === 0) {
    logger.warn('No indexers enabled');
    return null;
  }

  // Build indexer priorities map (indexerId -> priority 1-25, default 10)
  const indexerPriorities = new Map<number, number>(
    indexersConfig.map((indexer: any) => [indexer.id, indexer.priority ?? 10])
  );

  // Get flag configurations
  const flagConfigStr = await configService.get('indexer_flag_config');
  const flagConfigs = flagConfigStr ? JSON.parse(flagConfigStr) : [];

  // Group indexers by their EBOOK category configuration
  const { groups, skippedIndexers } = groupIndexersByCategories(indexersConfig, 'ebook');

  if (skippedIndexers.length > 0) {
    const skippedNames = skippedIndexers.map(idx => idx.name).join(', ');
    logger.info(`Skipping ${skippedIndexers.length} indexer(s) with no ebook categories: ${skippedNames}`);
  }

  logger.info(`Searching ${indexersConfig.length - skippedIndexers.length} enabled indexers in ${groups.length} group${groups.length > 1 ? 's' : ''}`);

  // Log each group for transparency
  groups.forEach((group, index) => {
    logger.info(`Group ${index + 1}: ${getGroupDescription(group)}`);
  });

  // Get Prowlarr service
  const prowlarr = await getProwlarrService();

  logger.info(`Searching for: "${audiobook.title}" by "${audiobook.author}"`);

  // Search Prowlarr for each group and combine results
  const allResults = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    logger.info(`Searching group ${i + 1}/${groups.length}: ${getGroupDescription(group)}`);
    const groupStats = newSearchStats();

    try {
      // "title author" then "title", deduped (same as audiobooks): a title-only
      // query on a short or common title can fill maxResults before the right book
      const groupResults = await prowlarr.searchWithVariations(audiobook.title, audiobook.author, {
        categories: group.categories,
        indexerIds: group.indexerIds,
        minSeeders: 0, // Ebooks may have fewer seeders
        maxResults: 100,
      }, undefined, groupStats);

      logger.info(`Group ${i + 1} returned ${groupResults.length} results`);
      allResults.push(...groupResults);
    } catch (error) {
      logger.error(`Group ${i + 1} search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      recordFailure(groupStats, '(whole group)', error);
      // Continue with other groups even if one fails
    }
    addGroupSearch(searchStats, groupStats, getGroupDescription(group), logger);
  }
  logSearchSummary(logger, searchStats);

  logger.info(`Found ${allResults.length} total results from ${groups.length} group${groups.length > 1 ? 's' : ''}`);

  if (allResults.length === 0) {
    return null;
  }

  // Strip blocklisted releases before ranking.
  const { kept: nonBlockedResults, blockedCount } = await filterBlockedResults(requestId, allResults);
  if (blockedCount > 0) {
    logger.debug(`Filtered out ${blockedCount} blocklisted release(s) before ranking`);
  }

  if (nonBlockedResults.length === 0) {
    logger.warn(`All ${allResults.length} ebook candidates were blocklisted`);
    return null;
  }

  // Log filter info (automatic search skips ebooks over EBOOK_MAX_SIZE_MB)
  const preFilterCount = nonBlockedResults.length;
  const aboveThreshold = nonBlockedResults.filter(r => (r.size / (1024 * 1024)) > EBOOK_MAX_SIZE_MB);
  if (aboveThreshold.length > 0) {
    logger.info(`Will filter ${aboveThreshold.length} results > ${EBOOK_MAX_SIZE_MB} MB (too large for ebooks)`);
  }

  // Get language-specific stop words for ranking
  const ebookRegion = await configService.getAudibleRegion() as AudibleRegion;
  const ebookLangConfig = getLanguageForRegion(ebookRegion);

  // Rank results with ebook-specific scoring
  // This filters out > EBOOK_MAX_SIZE_MB and uses inverted size scoring
  const rankedResults = rankEbookTorrents(nonBlockedResults, {
    title: audiobook.title,
    author: audiobook.author,
    preferredFormat,
  }, {
    indexerPriorities,
    flagConfigs,
    requireAuthor: true, // Automatic mode - prevent wrong authors
    enforceSizeCap: true, // Automatic mode - skip oversized ebooks (#323)
    stopWords: ebookLangConfig.stopWords,
    characterReplacements: ebookLangConfig.characterReplacements,
  });

  // Log filter results
  const postFilterCount = rankedResults.length;
  if (postFilterCount < preFilterCount) {
    logger.info(`Filtered out ${preFilterCount - postFilterCount} results > ${EBOOK_MAX_SIZE_MB} MB`);
  }

  // Dual threshold filtering (same as audiobooks)
  const filteredResults = rankedResults.filter(result =>
    result.score >= 50 && result.finalScore >= 50
  );

  const disqualifiedByNegativeBonus = rankedResults.filter(result =>
    result.score >= 50 && result.finalScore < 50
  ).length;

  logger.info(`Ranked ${rankedResults.length} results, ${filteredResults.length} above threshold (50/100 base + final)`);
  if (disqualifiedByNegativeBonus > 0) {
    logger.info(`${disqualifiedByNegativeBonus} ebooks disqualified by negative flag bonuses`);
  }

  if (filteredResults.length === 0) {
    logger.warn(`No quality matches found (all below 50/100)`);
    return null;
  }

  // Select best result
  const bestResult = filteredResults[0];

  // Log top 3 results with detailed breakdown
  const top3 = filteredResults.slice(0, 3);
  logger.info(`==================== EBOOK RANKING DEBUG ====================`);
  logger.info(`Requested Title: "${audiobook.title}"`);
  logger.info(`Requested Author: "${audiobook.author}"`);
  logger.info(`Preferred Format: ${preferredFormat}`);
  logger.info(`Top ${top3.length} results (out of ${filteredResults.length} above threshold):`);
  logger.info(`--------------------------------------------------------------`);
  for (let i = 0; i < top3.length; i++) {
    const result = top3[i];
    const sizeMB = (result.size / (1024 * 1024)).toFixed(1);

    logger.info(`${i + 1}. "${result.title}"`);
    logger.info(`   Indexer: ${result.indexer}${result.indexerId ? ` (ID: ${result.indexerId})` : ''}`);
    logger.info(``);
    logger.info(`   Base Score: ${result.score.toFixed(1)}/100`);
    logger.info(`   - Title/Author Match: ${result.breakdown.matchScore.toFixed(1)}/60`);
    logger.info(`   - Format Match: ${result.breakdown.formatScore.toFixed(1)}/10`);
    logger.info(`   - Size Quality: ${result.breakdown.sizeScore.toFixed(1)}/15 (${sizeMB} MB)`);
    logger.info(`   - Seeder Count: ${result.breakdown.seederScore.toFixed(1)}/15 (${result.seeders !== undefined ? result.seeders + ' seeders' : 'N/A for Usenet'})`);
    logger.info(``);
    logger.info(`   Bonus Points: +${result.bonusPoints.toFixed(1)}`);
    if (result.bonusModifiers.length > 0) {
      for (const mod of result.bonusModifiers) {
        logger.info(`   - ${mod.reason}: +${mod.points.toFixed(1)}`);
      }
    }
    logger.info(``);
    logger.info(`   Final Score: ${result.finalScore.toFixed(1)}`);
    if (result.breakdown.notes.length > 0) {
      logger.info(`   Notes: ${result.breakdown.notes.join(', ')}`);
    }
    if (i < top3.length - 1) {
      logger.info(`--------------------------------------------------------------`);
    }
  }
  logger.info(`==============================================================`);
  logger.info(`Selected best result: ${bestResult.title} (final score: ${bestResult.finalScore.toFixed(1)})`);

  return bestResult;
}

/**
 * Handle Anna's Archive download (direct HTTP)
 */
async function handleAnnasArchiveDownload(
  requestId: string,
  audiobook: { title: string; author: string },
  result: EbookSearchResult,
  preferredFormat: string,
  logger: RMABLogger
): Promise<any> {
  logger.info(`==================== EBOOK SEARCH RESULT ====================`);
  logger.info(`Source: Anna's Archive`);
  logger.info(`Title: "${audiobook.title}"`);
  logger.info(`Author: "${audiobook.author}"`);
  logger.info(`Format: ${preferredFormat}`);
  logger.info(`MD5: ${result.md5}`);
  logger.info(`Download Links: ${result.downloadUrls.length}`);
  logger.info(`Score: ${result.score}/100`);
  logger.info(`==============================================================`);

  // Create download history record
  const downloadHistory = await prisma.downloadHistory.create({
    data: {
      requestId,
      indexerName: "Anna's Archive",
      torrentName: `${audiobook.title} - ${audiobook.author}.${preferredFormat}`,
      torrentSizeBytes: null, // Unknown until download starts
      qualityScore: result.score,
      selected: true,
      downloadClient: 'direct', // Direct HTTP download
      downloadStatus: 'queued',
    },
  });

  // Trigger direct download job
  const jobQueue = getJobQueueService();
  await jobQueue.addStartDirectDownloadJob(
    requestId,
    downloadHistory.id,
    result.downloadUrls[0], // Start with first link
    buildEbookDownloadName(audiobook.title, audiobook.author, preferredFormat),
    undefined // Size unknown
  );

  // Store all download URLs for retry purposes
  await prisma.downloadHistory.update({
    where: { id: downloadHistory.id },
    data: {
      torrentUrl: JSON.stringify(result.downloadUrls),
    },
  });

  return {
    success: true,
    message: `Found ebook via Anna's Archive, starting download`,
    requestId,
    source: 'annas_archive',
    searchResult: {
      md5: result.md5,
      format: result.format,
      score: result.score,
      downloadLinksCount: result.downloadUrls.length,
    },
  };
}

/**
 * Handle indexer download (torrent/NZB via download-torrent processor)
 */
async function handleIndexerDownload(
  requestId: string,
  audiobook: { title: string; author: string },
  result: RankedEbookTorrent,
  preferredFormat: string,
  logger: RMABLogger
): Promise<any> {
  logger.info(`==================== EBOOK SEARCH RESULT ====================`);
  logger.info(`Source: Indexer (${result.indexer})`);
  logger.info(`Title: "${audiobook.title}"`);
  logger.info(`Author: "${audiobook.author}"`);
  logger.info(`Torrent: "${result.title}"`);
  logger.info(`Size: ${(result.size / (1024 * 1024)).toFixed(1)} MB`);
  logger.info(`Seeders: ${result.seeders !== undefined ? result.seeders : 'N/A'}`);
  logger.info(`Final Score: ${result.finalScore.toFixed(1)}/100`);
  logger.info(`==============================================================`);

  // Trigger download job using the SAME processor as audiobooks
  // The download-torrent processor is already generic and handles both torrent and NZB
  const jobQueue = getJobQueueService();

  // Fetch the request to get the parent audiobook ID for the download job
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { parentRequest: true },
  });

  if (!request) {
    throw new Error(`Request ${requestId} not found`);
  }

  // Use the parent audiobook's ID for the download job, or fall back to request ID
  const audiobookId = request.parentRequest?.id || request.id;

  await jobQueue.addDownloadJob(requestId, {
    id: audiobookId,
    title: audiobook.title,
    author: audiobook.author,
  }, result);

  return {
    success: true,
    message: `Found ebook via indexer search, starting download`,
    requestId,
    source: 'prowlarr',
    resultsCount: 1,
    selectedTorrent: {
      title: result.title,
      score: result.score,
      finalScore: result.finalScore,
      seeders: result.seeders || 0,
      size: result.size,
    },
  };
}

/**
 * Handle direct download from additional sources (LibGen, Z-Library, etc.)
 */
async function handleDirectSourceDownload(
  requestId: string,
  audiobook: { title: string; author: string },
  result: SourceSearchResult,
  preferredFormat: string,
  logger: RMABLogger
): Promise<any> {
  logger.info(`==================== EBOOK SEARCH RESULT ====================`);
  logger.info(`Source: ${result.sourceName}`);
  logger.info(`Title: "${audiobook.title}"`);
  logger.info(`Author: "${audiobook.author}"`);
  logger.info(`Format: ${result.format}`);
  logger.info(`Download URL: ${result.downloadUrl.substring(0, 100)}...`);
  logger.info(`==============================================================`);

  // Create download history record
  const downloadHistory = await prisma.downloadHistory.create({
    data: {
      requestId,
      indexerName: result.sourceName,
      torrentName: `${audiobook.title} - ${audiobook.author}.${result.format}`,
      torrentSizeBytes: result.size || null,
      qualityScore: 80, // Default score for direct sources
      selected: true,
      downloadClient: 'direct',
      downloadStatus: 'queued',
    },
  });

  // Trigger direct download job
  const jobQueue = getJobQueueService();
  await jobQueue.addStartDirectDownloadJob(
    requestId,
    downloadHistory.id,
    result.downloadUrl,
    buildEbookDownloadName(audiobook.title, audiobook.author, result.format),
    result.size
  );

  return {
    success: true,
    message: `Found ebook via ${result.sourceName}, starting download`,
    requestId,
    source: result.sourceId,
    searchResult: {
      format: result.format,
      score: 80,
    },
  };
}
