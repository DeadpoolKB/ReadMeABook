/**
 * Component: Cache API Route Tests
 * Documentation: documentation/testing.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({ default: fsMock, ...fsMock, constants: { R_OK: 4 } }));

describe('Thumbnail cache route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid filenames', async () => {
    const { GET } = await import('@/app/api/cache/thumbnails/[filename]/route');

    const response = await GET({} as any, { params: Promise.resolve({ filename: '../bad' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid filename');
  });

  it('returns 404 when file is missing', async () => {
    fsMock.access.mockRejectedValueOnce(new Error('missing'));
    const { GET } = await import('@/app/api/cache/thumbnails/[filename]/route');

    const response = await GET({} as any, { params: Promise.resolve({ filename: 'file.jpg' }) });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('File not found');
  });

  it('serves cached image with content type', async () => {
    fsMock.access.mockResolvedValueOnce(undefined);
    fsMock.readFile.mockResolvedValueOnce(Buffer.from('data'));
    const { GET } = await import('@/app/api/cache/thumbnails/[filename]/route');

    const response = await GET({} as any, { params: Promise.resolve({ filename: 'file.png' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });
});


