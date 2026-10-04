/**
 * Component: Standalone Ebook Request API
 * Documentation: documentation/integrations/ebook-sidecar.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/db';
import { getJobQueueService } from '@/lib/services/job-queue.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Ebooks.Requests');
const CreateEbookRequestSchema = z.object({
  catalogId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().max(500).default('Unknown author'),
  isbn: z.string().trim().max(32).optional(),
  coverArtUrl: z.string().url().max(2000).optional(),
  description: z.string().max(20_000).optional(),
  year: z.number().int().min(1000).max(3000).optional(),
});

const RETRYABLE_STATUSES = new Set(['failed', 'warn', 'cancelled']);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    if (!req.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }
    const parsed = CreateEbookRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ValidationError', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const metadata = parsed.data;
    const author = metadata.author || 'Unknown author';
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, role: true, autoApproveRequests: true, plexUsername: true },
      });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      let needsApproval = false;
      if (user.role !== 'admin') {
        if (user.autoApproveRequests === false) {
          needsApproval = true;
        } else if (user.autoApproveRequests !== true) {
          const globalAutoApprove = await prisma.configuration.findUnique({
            where: { key: 'auto_approve_requests' },
          });
          needsApproval = globalAutoApprove !== null && globalAutoApprove.value !== 'true';
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const audiobook = await tx.audiobook.upsert({
          where: {
            catalogProvider_catalogId: {
              catalogProvider: 'openlibrary',
              catalogId: metadata.catalogId,
            },
          },
          create: {
            catalogProvider: 'openlibrary',
            catalogId: metadata.catalogId,
            isbn: metadata.isbn,
            title: metadata.title,
            author,
            description: metadata.description,
            coverArtUrl: metadata.coverArtUrl,
            year: metadata.year,
            status: 'requested',
          },
          update: {
            title: metadata.title,
            author,
            ...(metadata.isbn ? { isbn: metadata.isbn } : {}),
            ...(metadata.description ? { description: metadata.description } : {}),
            ...(metadata.coverArtUrl ? { coverArtUrl: metadata.coverArtUrl } : {}),
            ...(metadata.year ? { year: metadata.year } : {}),
          },
        });

        const existing = await tx.request.findFirst({
          where: {
            userId: user.id,
            audiobookId: audiobook.id,
            type: 'ebook',
            parentRequestId: null,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing && !RETRYABLE_STATUSES.has(existing.status)) {
          return { request: existing, reused: true };
        }

        const status = needsApproval ? 'awaiting_approval' : 'pending';
        const ebookRequest = existing
          ? await tx.request.update({
              where: { id: existing.id },
              data: {
                status,
                progress: 0,
                errorMessage: null,
                completedAt: null,
                updatedAt: new Date(),
              },
            })
          : await tx.request.create({
              data: {
                userId: user.id,
                audiobookId: audiobook.id,
                type: 'ebook',
                status,
                progress: 0,
              },
            });

        return { request: ebookRequest, reused: false };
      });

      if (!result.reused) {
        const queue = getJobQueueService();
        await queue.addNotificationJob(
          needsApproval ? 'request_pending_approval' : 'request_approved',
          result.request.id,
          metadata.title,
          author,
          user.plexUsername || 'Unknown User',
          undefined,
          'ebook',
        ).catch((error) => {
          logger.error('Failed to queue ebook request notification', {
            requestId: result.request.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      return NextResponse.json(
        { success: true, requestId: result.request.id, status: result.request.status },
        { status: result.reused ? 200 : 201 }
      );
    } catch (error) {
      logger.error('Failed to create standalone ebook request', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'RequestError', message: 'Failed to create ebook request' },
        { status: 500 }
      );
    }
  });
}
