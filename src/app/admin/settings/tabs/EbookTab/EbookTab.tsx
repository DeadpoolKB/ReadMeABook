/**
 * Component: E-book Settings Tab
 * Documentation: documentation/settings-pages.md
 *
 * Three-section layout:
 * 1. Anna's Archive - Direct HTTP downloads from Anna's Archive
 * 2. Indexer Search - Search via Prowlarr indexers
 * 3. LibGen - Search configured LibGen mirrors
 * 3. General Settings - Shared settings like preferred format
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useEbookSettings } from './useEbookSettings';
import type { EbookSettings } from '../../lib/types';

interface EbookTabProps {
  ebook: EbookSettings;
  onChange: (ebook: EbookSettings) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  markAsSaved: () => void;
}

export function EbookTab({ ebook, onChange, onSuccess, onError, markAsSaved }: EbookTabProps) {
  const {
    saving,
    testingFlaresolverr,
    flaresolverrTestResult,
    updateEbook,
    testFlaresolverrConnection,
    saveSettings,
    isAnySourceEnabled,
    isAutoGrabSupported,
  } = useEbookSettings({ ebook, onChange, onSuccess, onError, markAsSaved });

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          E-book Sidecar
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Automatically download e-books to accompany your audiobooks.
          E-books are placed in the same folder as the audiobook files.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1: ANNA'S ARCHIVE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            Anna&apos;s Archive
          </h3>
        </div>
        <div className="p-4 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-start gap-4">
            <input
              type="checkbox"
              id="annas-archive-enabled"
              checked={ebook.annasArchiveEnabled || false}
              onChange={(e) => updateEbook('annasArchiveEnabled', e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label
                htmlFor="annas-archive-enabled"
                className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Enable Anna&apos;s Archive downloads
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Download e-books directly from Anna&apos;s Archive using ASIN or title matching.
              </p>
            </div>
          </div>

          {/* Anna&apos;s Archive specific settings - only shown when enabled */}
          {ebook.annasArchiveEnabled && (
            <>
              {/* Base URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Base URL
                </label>
                <Input
                  type="text"
                  value={ebook.baseUrl || 'https://annas-archive.gl'}
                  onChange={(e) => updateEbook('baseUrl', e.target.value)}
                  placeholder="https://annas-archive.gl"
                  className="font-mono"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Change this if the primary Anna&apos;s Archive mirror is unavailable.
                </p>
              </div>

              {/* FlareSolverr URL */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    FlareSolverr URL (Optional)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={ebook.flaresolverrUrl || ''}
                      onChange={(e) => updateEbook('flaresolverrUrl', e.target.value)}
                      placeholder="http://localhost:8191"
                      className="font-mono flex-1"
                    />
                    <Button
                      onClick={testFlaresolverrConnection}
                      loading={testingFlaresolverr}
                      variant="secondary"
                      className="whitespace-nowrap"
                    >
                      Test
                    </Button>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    FlareSolverr helps bypass Cloudflare protection.
                  </p>
                  {flaresolverrTestResult && (
                    <div
                      className={`mt-2 p-3 rounded-lg text-sm ${
                        flaresolverrTestResult.success
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      {flaresolverrTestResult.success ? '✓ ' : '✗ '}
                      {flaresolverrTestResult.message}
                    </div>
                  )}
                </div>
                {!ebook.flaresolverrUrl && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Note:</strong> Without FlareSolverr, e-book downloads may fail if Anna&apos;s Archive
                      has Cloudflare protection enabled.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: INDEXER SEARCH
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            Indexer Search
          </h3>
        </div>
        <div className="p-4 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-start gap-4">
            <input
              type="checkbox"
              id="indexer-search-enabled"
              checked={ebook.indexerSearchEnabled || false}
              onChange={(e) => updateEbook('indexerSearchEnabled', e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label
                htmlFor="indexer-search-enabled"
                className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Enable Indexer Search
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Search for e-books via Prowlarr indexers (torrent/NZB sources).
              </p>
            </div>
          </div>

          {/* Info hint about indexer settings */}
          {ebook.indexerSearchEnabled && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Configure Categories:</strong> E-book category settings are configured per-indexer
                in the <span className="font-medium">Indexers</span> tab. Look for the &quot;EBook&quot; tab when
                editing an indexer.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            LibGen
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-4">
            <input
              type="checkbox"
              id="libgen-enabled"
              checked={ebook.libgenEnabled || false}
              onChange={(event) => updateEbook('libgenEnabled', event.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="libgen-enabled" className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                Enable LibGen catalog search
              </label>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Searches the configured LibGen mirrors directly and downloads selected files over HTTP.
              </p>
            </div>
          </div>
          {ebook.libgenEnabled && (
            <div>
              <label htmlFor="libgen-mirrors" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Mirror URLs (comma-separated)
              </label>
              <Input
                id="libgen-mirrors"
                type="text"
                value={ebook.libgenMirrors || ''}
                onChange={(event) => updateEbook('libgenMirrors', event.target.value)}
                placeholder="https://libgen.li"
                className="font-mono"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Enter one or more mirror base URLs. No mirror is assumed or contacted until configured.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            IRC (DCC)
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-4">
            <input
              type="checkbox"
              id="irc-enabled"
              checked={ebook.ircEnabled || false}
              onChange={(event) => updateEbook('ircEnabled', event.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="irc-enabled" className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                Enable IRC ebook search and DCC downloads
              </label>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                IRC search and DCC file transfers require outbound connections to the server and public DCC endpoints.
              </p>
            </div>
          </div>
          {ebook.ircEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="irc-server" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Server</label>
                <Input id="irc-server" value={ebook.ircServer || ''} onChange={(event) => updateEbook('ircServer', event.target.value)} placeholder="irc.example.net" />
              </div>
              <div>
                <label htmlFor="irc-port" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Port</label>
                <Input id="irc-port" type="number" min="1" max="65535" value={ebook.ircPort || '6697'} onChange={(event) => updateEbook('ircPort', event.target.value)} />
              </div>
              <div>
                <label htmlFor="irc-channel" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Channel</label>
                <Input id="irc-channel" value={ebook.ircChannel || ''} onChange={(event) => updateEbook('ircChannel', event.target.value)} placeholder="ebooks" />
              </div>
              <div>
                <label htmlFor="irc-nick" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nickname</label>
                <Input id="irc-nick" value={ebook.ircNick || ''} onChange={(event) => updateEbook('ircNick', event.target.value)} placeholder="readmeabook" />
              </div>
              <div>
                <label htmlFor="irc-search-bot" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Search bot</label>
                <Input id="irc-search-bot" value={ebook.ircSearchBot || ''} onChange={(event) => updateEbook('ircSearchBot', event.target.value)} placeholder="search" />
              </div>
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={ebook.ircTls ?? true}
                  onChange={(event) => updateEbook('ircTls', event.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Use TLS
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3: GENERAL SETTINGS
          ═══════════════════════════════════════════════════════════════════════ */}
      {isAnySourceEnabled && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
              General Settings
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {/* Preferred Format */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Preferred Format
              </label>
              <select
                value={ebook.preferredFormat || 'epub'}
                onChange={(e) => updateEbook('preferredFormat', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="epub">EPUB (Recommended)</option>
                <option value="pdf">PDF</option>
                <option value="mobi">MOBI</option>
                <option value="azw3">AZW3</option>
                <option value="any">Any format</option>
              </select>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                EPUB is recommended for most e-readers. &quot;Any format&quot; accepts the first available.
              </p>
            </div>

            {/* Auto Grab Toggle */}
            <div className="flex items-start gap-4 pt-2">
              <input
                type="checkbox"
                id="auto-grab-enabled"
                checked={ebook.autoGrabEnabled ?? true}
                disabled={!isAutoGrabSupported}
                onChange={(e) => updateEbook('autoGrabEnabled', e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <label
                  htmlFor="auto-grab-enabled"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  Automatically fetch ebooks
                </label>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  When enabled, ebook requests are created automatically after audiobook downloads complete.
                  When disabled, use the &quot;Fetch Ebook&quot; button on completed requests.
                </p>
                {!isAutoGrabSupported && (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    Automatic sidecar searches currently use Anna&apos;s Archive and Prowlarr only. LibGen and IRC remain available for interactive searches.
                  </p>
                )}
              </div>
            </div>

            {/* Kindle Fix Toggle - Only shown when EPUB is selected */}
            {(ebook.preferredFormat === 'epub' || !ebook.preferredFormat) && (
              <div className="flex items-start gap-4 pt-2 border-t border-gray-200 dark:border-gray-700 mt-4">
                <input
                  type="checkbox"
                  id="kindle-fix-enabled"
                  checked={ebook.kindleFixEnabled ?? false}
                  onChange={(e) => updateEbook('kindleFixEnabled', e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <label
                    htmlFor="kindle-fix-enabled"
                    className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                  >
                    Fix EPUB for Kindle import
                  </label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Apply compatibility fixes before organizing EPUB files. Fixes encoding declarations,
                    broken hyperlinks, invalid language tags, and orphaned image elements that can
                    cause Kindle import failures.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* How it works - only show when Anna's Archive is enabled */}
      {ebook.annasArchiveEnabled && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            How Anna&apos;s Archive works
          </h3>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>• Searches by ASIN first (exact match), then title + author</li>
            <li>• Downloads matching e-book in your preferred format</li>
            <li>• Places e-book file in the same folder as the audiobook</li>
            <li>• If no match is found, audiobook download continues normally</li>
          </ul>
        </div>
      )}

      {/* Save Button */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <Button
          onClick={saveSettings}
          loading={saving}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          Save E-book Sidecar Settings
        </Button>
      </div>
    </div>
  );
}
