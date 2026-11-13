/**
 * Component: Is Local Admin API Route Tests
 * Documentation: documentation/backend/services/auth.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuthMock = vi.fn();
const isLocalAdminMock = vi.fn();

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
  isLocalAdmin: isLocalAdminMock,
}));

describe('Is local admin route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when request has no user', async () => {
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler({}));
    const { GET } = await import('@/app/api/auth/is-local-admin/route');

    const response = await GET({} as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isLocalAdmin).toBe(false);
    expect(isLocalAdminMock).not.toHaveBeenCalled();
  });

  it('returns local admin status for user', async () => {
    requireAuthMock.mockImplementation((_req: any, handler: any) =>
      handler({ user: { id: 'user-1' } })
    );
    isLocalAdminMock.mockResolvedValue(true);
    const { GET } = await import('@/app/api/auth/is-local-admin/route');

    const response = await GET({} as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isLocalAdmin).toBe(true);
    expect(isLocalAdminMock).toHaveBeenCalledWith('user-1');
  });
});
