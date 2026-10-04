/**
 * Component: Standalone Ebook Catalog Search API
 * Documentation: documentation/integrations/ebook-sidecar.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { searchOpenLibrary } from '@/lib/services/ebook-catalog.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Ebooks.Search');

export async function GET(request: NextRequest) {
  return requireAuth(request, async () => {
    const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const requestedPage = Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    try {
      const result = await searchOpenLibrary(query, page);
      return NextResponse.json({ success: true, query, ...result });
    } catch (error) {
      logger.error('Failed to search Open Library', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'SearchError', message: 'Failed to search the ebook catalog' },
        { status: 502 }
      );
    }
  });
}
