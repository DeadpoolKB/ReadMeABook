/**
 * Component: Admin Plex API Route Tests
 * Documentation: documentation/testing.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let authRequest: any;

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const scanPlexMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/processors/scan-plex.processor', () => ({
  processScanPlex: scanPlexMock,
}));

describe('Admin Plex scan route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRequest = { user: { id: 'admin-1', role: 'admin' } };
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler(authRequest));
    requireAdminMock.mockImplementation((_req: any, handler: any) => handler());
  });

  it('triggers a Plex scan', async () => {
    scanPlexMock.mockResolvedValue({ scanned: 10 });

    const { POST } = await import('@/app/api/admin/plex/scan/route');
    const response = await POST({} as any);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(scanPlexMock).toHaveBeenCalled();
  });
});


