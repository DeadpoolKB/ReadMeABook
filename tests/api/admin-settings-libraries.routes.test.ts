/**
 * Component: Admin Settings Libraries API Route Tests
 * Documentation: documentation/testing.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let authRequest: any;

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const plexServiceMock = vi.hoisted(() => ({ getLibraries: vi.fn() }));
const configServiceMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/integrations/plex.service', () => ({
  getPlexService: async () => plexServiceMock,
}));

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => configServiceMock,
}));

describe('Admin settings libraries routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRequest = { user: { id: 'admin-1', role: 'admin' } };
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler(authRequest));
    requireAdminMock.mockImplementation((_req: any, handler: any) => handler());
  });

  it('returns Plex libraries', async () => {
    configServiceMock.get
      .mockResolvedValueOnce('http://plex')
      .mockResolvedValueOnce('token');
    plexServiceMock.getLibraries.mockResolvedValueOnce([
      { key: '1', title: 'Audiobooks', type: 'artist' },
      { key: '2', title: 'Movies', type: 'movie' },
    ]);

    const { GET } = await import('@/app/api/admin/settings/plex/libraries/route');
    const response = await GET({} as any);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.libraries).toHaveLength(1);
  });

  it('returns Audiobookshelf libraries', async () => {
    configServiceMock.get
      .mockResolvedValueOnce('http://abs')
      .mockResolvedValueOnce('token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        libraries: [
          { id: '1', name: 'Books', mediaType: 'book', stats: { totalItems: 10 } },
          { id: '2', name: 'Music', mediaType: 'music' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import('@/app/api/admin/settings/audiobookshelf/libraries/route');
    const response = await GET({} as any);
    const payload = await response.json();

    expect(payload.libraries).toHaveLength(1);
    expect(payload.libraries[0].id).toBe('1');
  });
});


