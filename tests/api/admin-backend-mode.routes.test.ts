/**
 * Component: Admin Backend Mode API Route Tests
 * Documentation: documentation/testing.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let authRequest: any;

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const configServiceMock = vi.hoisted(() => ({
  getBackendMode: vi.fn(),
  setMany: vi.fn(),
}));
const clearLibraryServiceCacheMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/services/config.service', () => ({
  ConfigurationService: class {
    getBackendMode = configServiceMock.getBackendMode;
    setMany = configServiceMock.setMany;
  },
}));

vi.mock('@/lib/services/library', () => ({
  clearLibraryServiceCache: clearLibraryServiceCacheMock,
}));

describe('Admin backend mode route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRequest = { user: { id: 'admin-1', role: 'admin' } };
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler(authRequest));
    requireAdminMock.mockImplementation((_req: any, handler: any) => handler());
  });

  it('returns backend mode', async () => {
    configServiceMock.getBackendMode.mockResolvedValue('plex');

    const { GET } = await import('@/app/api/admin/backend-mode/route');
    const response = await GET({} as any);
    const payload = await response.json();

    expect(payload.backendMode).toBe('plex');
  });

  it('updates backend mode and clears cache', async () => {
    const { PUT } = await import('@/app/api/admin/backend-mode/route');
    const response = await PUT({ json: vi.fn().mockResolvedValue({ mode: 'audiobookshelf' }) } as any);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(clearLibraryServiceCacheMock).toHaveBeenCalled();
  });
});


