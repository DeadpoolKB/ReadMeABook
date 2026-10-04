/**
 * Component: Standalone Ebook Search Page
 * Documentation: documentation/frontend/components.md
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { InteractiveTorrentSearchModal } from '@/components/requests/InteractiveTorrentSearchModal';
import type { EbookCatalogBook } from '@/lib/services/ebook-catalog.service';
import { fetchWithAuth } from '@/lib/utils/api';

interface CatalogSearchResponse {
  results: EbookCatalogBook[];
  page: number;
  totalResults: number;
  hasMore: boolean;
}

export default function EbookSearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<EbookCatalogBook[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<{ id: string; book: EbookCatalogBook } | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const searchPage = useCallback(async (searchQuery: string, nextPage: number, append: boolean) => {
    const sequence = ++requestSequence.current;
    if (append) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setResults([]);
      setPage(1);
    }
    setError(null);

    try {
      const response = await fetchWithAuth(
        `/api/ebooks/search?q=${encodeURIComponent(searchQuery)}&page=${nextPage}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Catalog search failed');
      if (sequence !== requestSequence.current) return;

      const result = data as CatalogSearchResponse;
      setResults((current) => append ? [...current, ...result.results] : result.results);
      setPage(result.page);
      setTotalResults(result.totalResults);
      setHasMore(result.hasMore);
    } catch (searchError) {
      if (sequence === requestSequence.current) {
        setError(searchError instanceof Error ? searchError.message : 'Catalog search failed');
      }
    } finally {
      if (sequence === requestSequence.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      ++requestSequence.current;
      setResults([]);
      setPage(1);
      setTotalResults(0);
      setHasMore(false);
      setError(null);
      setIsLoading(false);
      return;
    }
    void searchPage(debouncedQuery, 1, false);
  }, [debouncedQuery, searchPage]);

  const handleRequest = async (book: EbookCatalogBook) => {
    setRequestingId(book.catalogId);
    setError(null);
    try {
      const response = await fetchWithAuth('/api/ebooks/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(book),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Could not create ebook request');
      if (data.status === 'awaiting_approval') {
        setError('Your ebook request was sent for admin approval.');
        return;
      }
      if (!['pending', 'failed', 'awaiting_search'].includes(data.status) || typeof data.requestId !== 'string') {
        setError(`This ebook request is already ${data.status}. You can manage it from My Requests.`);
        return;
      }
      setActiveRequest({ id: data.requestId, book });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create ebook request');
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen">
        <Header />
        <main className="container mx-auto max-w-7xl space-y-8 px-4 py-8">
          <header className="space-y-3 text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Search Ebooks</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Find a book in the catalog, then search configured ebook sources for a download.
            </p>
          </header>

          <form onSubmit={(event) => event.preventDefault()} className="mx-auto max-w-3xl">
            <label htmlFor="ebook-search" className="sr-only">Search ebooks</label>
            <input
              id="ebook-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, author, or ISBN..."
              autoFocus
              className="w-full rounded-xl border-2 border-gray-300 bg-white px-5 py-4 text-lg text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </form>

          {error && (
            <p role="status" className="mx-auto max-w-3xl rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
              {error}
            </p>
          )}

          {debouncedQuery.length < 2 ? (
            <p className="py-16 text-center text-gray-500 dark:text-gray-400">
              Enter at least two characters to search the ebook catalog.
            </p>
          ) : isLoading ? (
            <p className="py-16 text-center text-gray-500 dark:text-gray-400">Searching catalog...</p>
          ) : results.length === 0 ? (
            <p className="py-16 text-center text-gray-500 dark:text-gray-400">
              No books found for “{debouncedQuery}”.
            </p>
          ) : (
            <section aria-label="Ebook catalog results">
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Showing {results.length.toLocaleString()} of {totalResults.toLocaleString()} catalog results
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((book) => (
                  <article
                    key={book.catalogId}
                    className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
                      {book.coverArtUrl ? (
                        <img src={book.coverArtUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-xs text-gray-500">
                          No cover
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h2 className="line-clamp-3 font-semibold text-gray-900 dark:text-gray-100">{book.title}</h2>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                        {book.author || 'Unknown author'}
                      </p>
                      {book.year && <p className="mt-1 text-xs text-gray-500">{book.year}</p>}
                      {book.isbn && <p className="mt-1 truncate text-xs text-gray-500">ISBN {book.isbn}</p>}
                      <button
                        type="button"
                        onClick={() => void handleRequest(book)}
                        disabled={requestingId !== null}
                        className="mt-auto self-start rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {requestingId === book.catalogId ? 'Preparing…' : 'Find ebook'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {hasMore && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => void searchPage(debouncedQuery, page + 1, true)}
                    disabled={isLoadingMore}
                    className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {isLoadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </section>
          )}
        </main>

        {activeRequest && (
          <InteractiveTorrentSearchModal
            isOpen
            onClose={() => setActiveRequest(null)}
            onSuccess={() => setActiveRequest(null)}
            requestId={activeRequest.id}
            audiobook={{ title: activeRequest.book.title, author: activeRequest.book.author || 'Unknown author' }}
            searchMode="ebook"
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
