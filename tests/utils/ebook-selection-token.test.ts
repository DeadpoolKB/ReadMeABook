import {
  generateEbookSelectionToken,
  verifyEbookSelectionToken,
} from '@/lib/utils/jwt';

describe('ebook selection tokens', () => {
  it('binds a selected release to its user and request', () => {
    const release = {
      guid: 'release-123',
      source: 'prowlarr',
      downloadUrl: 'magnet:?xt=urn:btih:abc',
    };
    const token = generateEbookSelectionToken('user-1', 'request-1', release);

    expect(verifyEbookSelectionToken(token)).toMatchObject({
      sub: 'user-1',
      requestId: 'request-1',
      type: 'ebook_selection',
      ebook: release,
    });
  });

  it('rejects modified selection tokens', () => {
    const token = generateEbookSelectionToken('user-1', 'request-1', {
      guid: 'release-123',
    });

    expect(verifyEbookSelectionToken(`${token}tampered`)).toBeNull();
  });
});
