/**
 * Component: Client-Side JWT Utilities Tests
 * Documentation: documentation/frontend/routing-auth.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerState = vi.hoisted(() => ({
  error: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  RMABLogger: {
    create: loggerState.create,
  },
}));

const base64Url = (value: unknown) =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const createToken = (payload: Record<string, unknown>) => {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url(payload);
  return `${header}.${body}.signature`;
};

describe('jwt client utilities', () => {
  const originalAtob = globalThis.atob;

  beforeEach(() => {
    vi.resetModules();
    loggerState.error.mockClear();
    loggerState.create.mockReturnValue({ error: loggerState.error });

    globalThis.atob = (input: string) => Buffer.from(input, 'base64').toString('binary');
  });

  it('decodes a valid JWT payload', async () => {
    const { decodeJWT } = await import('@/lib/utils/jwt-client');

    const token = createToken({ sub: 'user', exp: 2000, role: 'user' });
    const decoded = decodeJWT(token);

    expect(decoded?.sub).toBe('user');
    expect(decoded?.exp).toBe(2000);
  });

  it('returns null for invalid tokens', async () => {
    const { decodeJWT } = await import('@/lib/utils/jwt-client');

    expect(decodeJWT('not-a-token')).toBeNull();
  });

  it('logs an error when decoding fails', async () => {
    const { decodeJWT } = await import('@/lib/utils/jwt-client');

    const decoded = decodeJWT('header.badbase64.signature');

    expect(decoded).toBeNull();
    expect(loggerState.error).toHaveBeenCalled();
  });

  it('checks token expiry correctly', async () => {
    const { isTokenExpired } = await import('@/lib/utils/jwt-client');
    const now = 1700000000;

    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);

    const fresh = createToken({ exp: now + 60 });
    const expired = createToken({ exp: now - 60 });

    expect(isTokenExpired(fresh)).toBe(false);
    expect(isTokenExpired(expired)).toBe(true);
    expect(isTokenExpired('invalid')).toBe(true);
  });

  it('returns expiry and refresh windows', async () => {
    const { getRefreshTimeMs, getTokenExpiryMs } = await import('@/lib/utils/jwt-client');
    const now = 1700000000;

    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);

    const token = createToken({ exp: now + 600 });
    const expiryMs = getTokenExpiryMs(token);
    const refreshMs = getRefreshTimeMs(token);

    expect(expiryMs).toBe(600 * 1000);
    expect(refreshMs).toBe(300 * 1000);

    const shortToken = createToken({ exp: now + 60 });
    expect(getRefreshTimeMs(shortToken)).toBe(0);
    expect(getTokenExpiryMs('invalid')).toBeNull();
  });

  afterEach(() => {
    if (originalAtob) {
      globalThis.atob = originalAtob;
    } else {
      delete (globalThis as any).atob;
    }
  });
});
