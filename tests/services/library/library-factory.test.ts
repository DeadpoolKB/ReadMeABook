/**
 * Component: Library Service Factory Tests
 * Documentation: documentation/features/audiobookshelf-integration.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLibraryServiceCache, getLibraryService } from '@/lib/services/library';

const MockPlexService = vi.hoisted(() => class MockPlexService {});
const MockAbsService = vi.hoisted(() => class MockAbsService {});

const configServiceMock = vi.hoisted(() => ({
  getBackendMode: vi.fn(),
}));

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => configServiceMock,
}));

vi.mock('@/lib/services/library/PlexLibraryService', () => ({
  PlexLibraryService: MockPlexService,
}));

vi.mock('@/lib/services/library/AudiobookshelfLibraryService', () => ({
  AudiobookshelfLibraryService: MockAbsService,
}));

describe('Library service factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLibraryServiceCache();
  });

  it('returns Plex service when backend mode is plex', async () => {
    configServiceMock.getBackendMode.mockResolvedValue('plex');

    const service = await getLibraryService();

    expect(service).toBeInstanceOf(MockPlexService);
  });

  it('returns cached service when mode is unchanged', async () => {
    configServiceMock.getBackendMode.mockResolvedValue('plex');

    const first = await getLibraryService();
    const second = await getLibraryService();

    expect(first).toBe(second);
  });

  it('switches to Audiobookshelf service when mode changes', async () => {
    configServiceMock.getBackendMode
      .mockResolvedValueOnce('plex')
      .mockResolvedValueOnce('audiobookshelf');

    const first = await getLibraryService();
    const second = await getLibraryService();

    expect(first).toBeInstanceOf(MockPlexService);
    expect(second).toBeInstanceOf(MockAbsService);
  });
});
