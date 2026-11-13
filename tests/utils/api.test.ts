/**
 * Component: API Utility Functions Tests
 * Documentation: documentation/frontend/utilities.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jwtState = vi.hoisted(() => ({
  isTokenExpired: vi.fn(),
}));

vi.mock('@/lib/utils/jwt-client', () => ({
  isTokenExpired: jwtState.isTokenExpired,
}));

describe('api utilities', () => {
  const originalWindow = globalThis.window;
  const storage = new Map<string, string>();
  let fetchMock: ReturnType<typeof vi.fn>;

  const localStorageMock = {
    getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  };

  const createResponse = (status: number, body: unknown, ok = status >= 200 && status < 300) => ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  });

  beforeEach(() => {
    vi.resetModules();
    storage.clear();
    fetchMock = vi.fn();

    (globalThis as any).localStorage = localStorageMock;
    (globalThis as any).fetch = fetchMock;

    jwtState.isTokenExpired.mockReset();
    jwtState.isTokenExpired.mockReturnValue(false);
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it('adds authorization headers when access token exists', async () => {
    const { fetchWithAuth } = await import('@/lib/utils/api');

    localStorageMock.setItem('accessToken', 'token-1');
    fetchMock.mockResolvedValue(createResponse(200, {}));

    await fetchWithAuth('/api/data', { headers: { 'X-Test': '1' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({
      'X-Test': '1',
      'Authorization': 'Bearer token-1',
    });
  });

  it('refreshes tokens on 401 and retries the request', async () => {
    const { fetchWithAuth } = await import('@/lib/utils/api');

    localStorageMock.setItem('accessToken', 'token-old');
    localStorageMock.setItem('refreshToken', 'refresh-1');

    let call = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return createResponse(200, { accessToken: 'token-new' }, true);
      }

      call += 1;
      if (call === 1) {
        return createResponse(401, {}, false);
      }
      return createResponse(200, { ok: true }, true);
    });

    const response = await fetchWithAuth('/api/data');

    expect(response.status).toBe(200);
    expect(localStorageMock.getItem('accessToken')).toBe('token-new');

    const retryCall = fetchMock.mock.calls.find((entry: any[]) => entry[0] === '/api/data' && entry[1]?.headers?.Authorization === 'Bearer token-new');
    expect(retryCall).toBeDefined();
  });

  it('logs out when refresh token is expired', async () => {
    const { fetchWithAuth } = await import('@/lib/utils/api');

    jwtState.isTokenExpired.mockReturnValue(true);
    localStorageMock.setItem('accessToken', 'token-old');
    localStorageMock.setItem('refreshToken', 'refresh-1');
    localStorageMock.setItem('user', 'user');

    globalThis.window = { location: { pathname: '/requests', href: '' } } as any;

    fetchMock.mockResolvedValue(createResponse(401, {}, false));

    await fetchWithAuth('/api/data');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorageMock.getItem('accessToken')).toBeNull();
    expect(localStorageMock.getItem('refreshToken')).toBeNull();
    expect(globalThis.window.location.href).toBe('/login?redirect=%2Frequests');
  });

  it('logs out when refreshed token still yields 401', async () => {
    const { fetchWithAuth } = await import('@/lib/utils/api');

    localStorageMock.setItem('accessToken', 'token-old');
    localStorageMock.setItem('refreshToken', 'refresh-1');
    localStorageMock.setItem('user', 'user');

    globalThis.window = { location: { pathname: '/requests', href: '' } } as any;

    let call = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return createResponse(200, { accessToken: 'token-new' }, true);
      }
      call += 1;
      if (call === 1) {
        return createResponse(401, {}, false);
      }
      return createResponse(401, {}, false);
    });

    await fetchWithAuth('/api/data');

    expect(localStorageMock.getItem('accessToken')).toBeNull();
    expect(localStorageMock.getItem('refreshToken')).toBeNull();
    expect(globalThis.window.location.href).toBe('/login?redirect=%2Frequests');
  });

  it('fetches JSON data successfully', async () => {
    const { fetchJSON } = await import('@/lib/utils/api');

    fetchMock.mockResolvedValue(createResponse(200, { ok: true }, true));

    const result = await fetchJSON('/api/data');

    expect(result).toEqual({ ok: true });
  });

  it('throws a useful error when JSON request fails', async () => {
    const { fetchJSON } = await import('@/lib/utils/api');

    fetchMock.mockResolvedValue(createResponse(500, { message: 'bad' }, false));

    await expect(fetchJSON('/api/data')).rejects.toThrow('bad');
  });
});
