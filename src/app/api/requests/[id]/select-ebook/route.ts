/**
 * Component: Select Ebook API
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * Creates an ebook request with a user-selected source (Anna's Archive or indexer)
 * Routes to appropriate download processor based on source type
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticatedRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/db';
import { getJobQueueService } from '@/lib/services/job-queue.service';
import { getConfigService } from '@/lib/services/config.service';
import { RMABLogger } from '@/lib/utils/logger';
import { verifyEbookSelectionToken } from '@/lib/utils/jwt';
import { resolveLibgenDownloadUrl } from '@/lib/services/ebook-catalog.service';

const logger = RMABLogger.create('API.SelectEbook');

interface SelectedEbook {
  guid: string;
  title: string;
  size: number;
  seeders: number;
  indexer: string;
  indexerId?: number;
  downloadUrl: string;
  infoUrl?: string;
  score: number;
  finalScore: number;
  source: 'annas_archive' | 'prowlarr' | 'libgen' | 'irc';
  format?: string;
  md5?: string;
  downloadUrls?: string[];
  protocol?: string; // 'torrent' or 'usenet' - determines download client
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
      try {
        const { id: requestId } = await params;
        const body = await request.json();
        let selectedEbook = body.ebook as (SelectedEbook & { selectionToken?: string }) | undefined;

        if (!selectedEbook) {
          return NextResponse.json({ error: 'No ebook selected' }, { status: 400 });
        }

        if (!selectedEbook.source) {
          return NextResponse.json({ error: 'Ebook source not specified' }, { status: 400 });
        }

        // Get the request - could be an audiobook request or an existing ebook request
        const foundRequest = await prisma.request.findUnique({
          where: { id: requestId },
          include: { audiobook: true },
        });

        if (!foundRequest) {
          return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        const isStandaloneEbook = foundRequest.type === 'ebook' && !foundRequest.parentRequestId;
        if (isStandaloneEbook) {
          if (!req.user || foundRequest.userId !== req.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
          const verifiedSelection = selectedEbook.selectionToken
            ? verifyEbookSelectionToken(selectedEbook.selectionToken)
            : null;
          if (
            !verifiedSelection ||
            verifiedSelection.sub !== req.user.id ||
            verifiedSelection.requestId !== requestId ||
            !isSelectedEbook(verifiedSelection.ebook)
          ) {
            return NextResponse.json({ error: 'Ebook selection is invalid or expired; search again' }, { status: 400 });
          }
          selectedEbook = verifiedSelection.ebook;
        } else if (req.user?.role !== 'admin') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Resolve the metadata request used by the shared ebook download pipeline.
        let parentRequest;
        if (foundRequest.type === 'ebook') {
          if (isStandaloneEbook) {
            parentRequest = foundRequest;
          } else {
            if (!foundRequest.parentRequestId) {
              return NextResponse.json({ error: 'Ebook request has no parent audiobook request' }, { status: 400 });
            }
            parentRequest = await prisma.request.findUnique({
              where: { id: foundRequest.parentRequestId },
              include: { audiobook: true },
            });
            if (!parentRequest) {
              return NextResponse.json({ error: 'Parent audiobook request not found' }, { status: 404 });
            }
          }
        } else if (foundRequest.type === 'audiobook') {
          parentRequest = foundRequest;
        } else {
          return NextResponse.json({ error: 'Can only select ebooks for audiobook requests' }, { status: 400 });
        }

        const allowedStatuses = isStandaloneEbook
          ? ['pending', 'failed', 'awaiting_search']
          : ['downloaded', 'available'];
        if (!allowedStatuses.includes(parentRequest.status)) {
          return NextResponse.json(
            { error: `Cannot select ebook for request in ${parentRequest.status} status` },
            { status: 400 }
          );
        }

        // Check for existing ebook request
        // If we were given an ebook request ID directly, use that; otherwise search by parent
        let ebookRequest = foundRequest.type === 'ebook'
          ? foundRequest
          : await prisma.request.findFirst({
              where: {
                parentRequestId: parentRequest.id,
                type: 'ebook',
                deletedAt: null,
              },
            });

        if (ebookRequest && !['failed', 'awaiting_search', 'pending'].includes(ebookRequest.status)) {
          return NextResponse.json({
            error: `E-book request already exists (status: ${ebookRequest.status})`,
            existingRequestId: ebookRequest.id,
          }, { status: 400 });
        }

        // Create or update ebook request
        if (ebookRequest) {
          // Reset existing failed/pending request
          ebookRequest = await prisma.request.update({
            where: { id: ebookRequest.id },
            data: {
              status: 'searching',
              progress: 0,
              errorMessage: null,
              updatedAt: new Date(),
            },
          });
          logger.info(`Reusing existing ebook request ${ebookRequest.id}`);
        } else if (!isStandaloneEbook) {
          // Create new ebook request
          ebookRequest = await prisma.request.create({
            data: {
              userId: parentRequest.userId,
              audiobookId: parentRequest.audiobookId,
              type: 'ebook',
              parentRequestId: parentRequest.id,
              status: 'searching',
              progress: 0,
              customSearchTerms: parentRequest.customSearchTerms,
            },
          });
          logger.info(`Created new ebook request ${ebookRequest.id}`);
        }

        if (!ebookRequest) {
          return NextResponse.json({ error: 'Ebook request could not be resolved' }, { status: 500 });
        }

        const audiobook = parentRequest.audiobook;
        const jobQueue = getJobQueueService();

        // Route to appropriate download based on source
        if (selectedEbook.source === 'annas_archive') {
          // Anna's Archive: Direct HTTP download
          await handleAnnasArchiveDownload(
            ebookRequest.id,
            audiobook,
            selectedEbook,
            jobQueue
          );
        } else if (selectedEbook.source === 'libgen') {
          await handleLibgenDownload(ebookRequest.id, audiobook, selectedEbook, jobQueue);
        } else if (selectedEbook.source === 'irc') {
          await handleIrcDownload(ebookRequest.id, audiobook, selectedEbook, jobQueue);
        } else {
          // Indexer: Torrent/NZB download
          await handleIndexerDownload(
            ebookRequest.id,
            audiobook,
            selectedEbook,
            jobQueue
          );
        }

        return NextResponse.json({
          success: true,
          message: `E-book download started from ${selectedEbook.source === 'annas_archive' ? "Anna's Archive" : selectedEbook.indexer}`,
          requestId: ebookRequest.id,
        });

      } catch (error) {
        logger.error('Unexpected error', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Internal server error' },
          { status: 500 }
        );
      }
  });
}

function isSelectedEbook(value: unknown): value is SelectedEbook {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ebook = value as Record<string, unknown>;
  const source = ebook.source;
  const supportedSource = source === 'annas_archive' || source === 'prowlarr' || source === 'libgen' || source === 'irc';
  if (
    !supportedSource ||
    typeof ebook.guid !== 'string' ||
    typeof ebook.title !== 'string' ||
    typeof ebook.downloadUrl !== 'string'
  ) {
    return false;
  }

  if (source === 'irc') {
    return /^!\S+\s+\S/.test(ebook.downloadUrl) &&
      !/[\r\n]/.test(ebook.downloadUrl) &&
      typeof ebook.format === 'string' &&
      /^[a-z0-9]{1,8}$/i.test(ebook.format);
  }

  try {
    const downloadUrl = new URL(ebook.downloadUrl);
    return source === 'prowlarr'
      ? ['https:', 'http:', 'magnet:'].includes(downloadUrl.protocol)
      : source === 'libgen'
        ? ['https:', 'http:'].includes(downloadUrl.protocol) && typeof ebook.md5 === 'string'
        : downloadUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

async function handleIrcDownload(
  requestId: string,
  audiobook: { id: string; title: string; author: string },
  selectedEbook: SelectedEbook,
  jobQueue: ReturnType<typeof getJobQueueService>
) {
  const format = selectedEbook.format?.toLowerCase();
  if (!format || !/^[a-z0-9]{1,8}$/.test(format)) {
    throw new Error('IRC result does not specify a valid ebook format');
  }
  const downloadHistory = await prisma.downloadHistory.create({
    data: {
      requestId,
      indexerName: selectedEbook.indexer,
      torrentName: selectedEbook.title,
      torrentSizeBytes: selectedEbook.size || null,
      qualityScore: selectedEbook.score,
      selected: true,
      downloadClient: 'direct',
      downloadStatus: 'queued',
      torrentUrl: selectedEbook.downloadUrl,
    },
  });
  await jobQueue.addStartDirectDownloadJob(
    requestId,
    downloadHistory.id,
    selectedEbook.downloadUrl,
    `${audiobook.title} - ${audiobook.author}.${format}`,
    selectedEbook.size || undefined,
    { skipUrlExtraction: true }
  );
}

async function handleLibgenDownload(
  requestId: string,
  audiobook: { id: string; title: string; author: string },
  selectedEbook: SelectedEbook,
  jobQueue: ReturnType<typeof getJobQueueService>
) {
  const configService = getConfigService();
  const mirrors = (await configService.get('ebook_libgen_mirrors') || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (!selectedEbook.md5) throw new Error('LibGen result is missing its record ID');

  const resolved = await resolveLibgenDownloadUrl(selectedEbook.md5, mirrors);
  if (!resolved) throw new Error('LibGen could not resolve a direct download link');

  const downloadHistory = await prisma.downloadHistory.create({
    data: {
      requestId,
      indexerName: 'LibGen',
      torrentName: `${audiobook.title} - ${audiobook.author}.${selectedEbook.format || 'epub'}`,
      torrentSizeBytes: selectedEbook.size || null,
      qualityScore: selectedEbook.score,
      selected: true,
      downloadClient: 'direct',
      downloadStatus: 'queued',
      torrentUrl: resolved.downloadUrl,
    },
  });

  await jobQueue.addStartDirectDownloadJob(
    requestId,
    downloadHistory.id,
    resolved.downloadUrl,
    `${audiobook.title} - ${audiobook.author}.${selectedEbook.format || 'epub'}`,
    selectedEbook.size || undefined,
    { skipUrlExtraction: true, referer: resolved.referer }
  );
}

/**
 * Handle Anna's Archive download (direct HTTP)
 */
async function handleAnnasArchiveDownload(
  requestId: string,
  audiobook: { id: string; title: string; author: string },
  selectedEbook: SelectedEbook,
  jobQueue: ReturnType<typeof getJobQueueService>
) {
  const configService = getConfigService();
  const preferredFormat = await configService.get('ebook_sidecar_preferred_format') || 'epub';

  logger.info(`Starting Anna's Archive download for "${audiobook.title}"`);
  logger.info(`MD5: ${selectedEbook.md5}, Format: ${selectedEbook.format || preferredFormat}`);

  // Create download history record
  const downloadHistory = await prisma.downloadHistory.create({
    data: {
      requestId,
      indexerName: "Anna's Archive",
      torrentName: `${audiobook.title} - ${audiobook.author}.${selectedEbook.format || preferredFormat}`,
      torrentSizeBytes: null, // Unknown until download starts
      qualityScore: selectedEbook.score,
      selected: true,
      downloadClient: 'direct',
      downloadStatus: 'queued',
    },
  });

  // Store all download URLs for retry purposes
  if (selectedEbook.downloadUrls && selectedEbook.downloadUrls.length > 0) {
    await prisma.downloadHistory.update({
      where: { id: downloadHistory.id },
      data: {
        torrentUrl: JSON.stringify(selectedEbook.downloadUrls),
      },
    });
  }

  // Trigger direct download job
  await jobQueue.addStartDirectDownloadJob(
    requestId,
    downloadHistory.id,
    selectedEbook.downloadUrl,
    `${audiobook.title} - ${audiobook.author}.${selectedEbook.format || preferredFormat}`,
    undefined // Size unknown
  );

  logger.info(`Queued direct download job for request ${requestId}`);
}

/**
 * Handle indexer download (torrent/NZB)
 */
async function handleIndexerDownload(
  requestId: string,
  audiobook: { id: string; title: string; author: string },
  selectedEbook: SelectedEbook,
  jobQueue: ReturnType<typeof getJobQueueService>
) {
  logger.info(`Starting indexer download for "${audiobook.title}"`);
  logger.info(`Torrent: "${selectedEbook.title}", Indexer: ${selectedEbook.indexer}`);

  // Convert to RankedTorrent shape expected by download job
  // Note: format is omitted as ebook formats (epub, pdf) differ from audiobook formats (M4B, M4A, MP3)
  const torrentForJob = {
    guid: selectedEbook.guid,
    title: selectedEbook.title,
    size: selectedEbook.size,
    seeders: selectedEbook.seeders || 0,
    indexer: selectedEbook.indexer,
    indexerId: selectedEbook.indexerId,
    downloadUrl: selectedEbook.downloadUrl,
    infoUrl: selectedEbook.infoUrl,
    publishDate: new Date(),
    score: selectedEbook.score,
    finalScore: selectedEbook.finalScore,
    bonusPoints: 0,
    bonusModifiers: [],
    rank: 1,
    breakdown: {
      formatScore: 0,
      sizeScore: 0,
      seederScore: 0,
      matchScore: 0,
      totalScore: selectedEbook.score,
      notes: [],
    },
    protocol: selectedEbook.protocol, // Pass through protocol for torrent vs usenet routing
  };

  // Use the download job (same as audiobooks)
  await jobQueue.addDownloadJob(requestId, {
    id: audiobook.id,
    title: audiobook.title,
    author: audiobook.author,
  }, torrentForJob);

  logger.info(`Queued download job for request ${requestId}`);
}
