/**
 * Component: Plex Integration Service Tests
 * Documentation: documentation/integrations/plex.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlexService } from '@/lib/integrations/plex.service';

const clientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

const axiosMock = vi.hoisted(() => ({
  create: vi.fn(() => clientMock),
}));

const parseStringPromiseMock = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: axiosMock,
  ...axiosMock,
}));

vi.mock('xml2js', () => ({
  parseStringPromise: parseStringPromiseMock,
}));

describe('PlexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests a PIN for OAuth', async () => {
    clientMock.post.mockResolvedValue({ data: { id: 123, code: 'CODE' } });

    const service = new PlexService();
    const pin = await service.requestPin();

    expect(pin).toEqual({ id: 123, code: 'CODE' });
  });

  it('throws when PIN request fails', async () => {
    clientMock.post.mockRejectedValue(new Error('fail'));

    const service = new PlexService();

    await expect(service.requestPin()).rejects.toThrow('Failed to request authentication PIN from Plex');
  });

  it('returns null when PIN check fails', async () => {
    clientMock.get.mockRejectedValue(new Error('fail'));

    const service = new PlexService();
    const token = await service.checkPin(123);

    expect(token).toBeNull();
  });

  it('returns auth token when PIN is authorized', async () => {
    clientMock.get.mockResolvedValue({ data: { authToken: 'plex-token' } });

    const service = new PlexService();
    const token = await service.checkPin(456);

    expect(token).toBe('plex-token');
  });

  it('parses user info from XML responses', async () => {
    clientMock.get.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({
      user: {
        $: { id: '1', username: 'user', email: 'e@example.com', thumb: '/t' },
      },
    });

    const service = new PlexService();
    const user = await service.getUserInfo('token');

    expect(user).toEqual({
      id: 1,
      username: 'user',
      email: 'e@example.com',
      thumb: '/t',
      authToken: 'token',
    });
  });

  it('parses user info from JSON responses and falls back to title', async () => {
    clientMock.get.mockResolvedValue({
      data: { id: '2', title: 'TitleUser', email: 't@example.com', thumb: '/t' },
    });

    const service = new PlexService();
    const user = await service.getUserInfo('token');

    expect(user.username).toBe('TitleUser');
    expect(user.id).toBe(2);
  });

  it('throws for unexpected XML user structure', async () => {
    clientMock.get.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({ notUser: {} });

    const service = new PlexService();

    await expect(service.getUserInfo('token')).rejects.toThrow('Unexpected XML structure');
  });

  it('throws for unexpected response formats', async () => {
    clientMock.get.mockResolvedValue({ data: 42 });

    const service = new PlexService();

    await expect(service.getUserInfo('token')).rejects.toThrow('Unexpected response format from Plex');
  });

  it('throws when user info is missing required fields', async () => {
    clientMock.get.mockResolvedValue({ data: { username: 'user' } });

    const service = new PlexService();

    await expect(service.getUserInfo('token')).rejects.toThrow('User ID missing');
  });

  it('throws when username is missing from user info', async () => {
    clientMock.get.mockResolvedValue({ data: { id: '3' } });

    const service = new PlexService();

    await expect(service.getUserInfo('token')).rejects.toThrow('Username missing');
  });

  it('returns OAuth URLs with pinId', () => {
    const service = new PlexService();
    const url = service.getOAuthUrl('CODE', 42, 'http://app/callback');

    expect(url).toContain('CODE');
    expect(url).toContain('pinId%3D42');
  });

  it('tests connections and parses MediaContainer responses', async () => {
    clientMock.get.mockResolvedValue({
      data: {
        MediaContainer: {
          machineIdentifier: 'machine',
          version: '1.0.0',
          platform: 'Plex',
        },
      },
    });

    const service = new PlexService();
    const result = await service.testConnection('http://plex', 'token');

    expect(result.success).toBe(true);
    expect(result.info?.machineIdentifier).toBe('machine');
  });

  it('tests connections from XML identity responses', async () => {
    clientMock.get.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({
      MediaContainer: { $: { machineIdentifier: 'm1', version: '1.2.3', platform: 'Linux', platformVersion: '5' } },
    });

    const service = new PlexService();
    const result = await service.testConnection('http://plex', 'token');

    expect(result.success).toBe(true);
    expect(result.info?.platform).toBe('Linux');
  });

  it('finds server access tokens in plex resources', async () => {
    clientMock.get.mockResolvedValue({
      data: [
        { clientIdentifier: 'machine', accessToken: 'server-token' },
      ],
    });

    const service = new PlexService();
    const token = await service.getServerAccessToken('machine', 'user-token');

    expect(token).toBe('server-token');
  });

  it('returns null when server resource is missing', async () => {
    clientMock.get.mockResolvedValue({ data: [{ clientIdentifier: 'other', accessToken: 'x' }] });

    const service = new PlexService();
    const token = await service.getServerAccessToken('machine', 'user-token');

    expect(token).toBeNull();
  });

  it('returns null when server access token is missing', async () => {
    clientMock.get.mockResolvedValue({
      data: [{ clientIdentifier: 'machine', accessToken: null }],
    });

    const service = new PlexService();
    const token = await service.getServerAccessToken('machine', 'user-token');

    expect(token).toBeNull();
  });

  it('verifies server access for matching resources', async () => {
    clientMock.get.mockResolvedValue({
      data: [
        { clientIdentifier: 'machine', provides: 'server', name: 'Plex' },
      ],
    });

    const service = new PlexService();
    const hasAccess = await service.verifyServerAccess('http://plex', 'machine', 'user-token');

    expect(hasAccess).toBe(true);
  });

  it('returns false when server access is not available', async () => {
    clientMock.get.mockResolvedValue({
      data: [{ clientIdentifier: 'other', provides: 'client', name: 'Plex' }],
    });

    const service = new PlexService();
    const hasAccess = await service.verifyServerAccess('http://plex', 'machine', 'user-token');

    expect(hasAccess).toBe(false);
  });

  it('returns false when verifying server access errors', async () => {
    clientMock.get.mockRejectedValue({ response: { status: 500, data: 'oops' }, message: 'boom' });

    const service = new PlexService();
    const hasAccess = await service.verifyServerAccess('http://plex', 'machine', 'user-token');

    expect(hasAccess).toBe(false);
  });

  it('parses libraries from XML responses', async () => {
    clientMock.get.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({
      MediaContainer: {
        Directory: [
          {
            $: {
              key: '1',
              title: 'Books',
              type: 'artist',
              language: 'en',
              scanner: 'scanner',
              agent: 'agent',
            },
            Location: [{ $: { path: '/data' } }],
          },
        ],
      },
    });

    const service = new PlexService();
    const libs = await service.getLibraries('http://plex', 'token');

    expect(libs).toEqual([
      {
        id: '1',
        title: 'Books',
        type: 'artist',
        language: 'en',
        scanner: 'scanner',
        agent: 'agent',
        locations: ['/data'],
      },
    ]);
  });

  it('parses libraries from JSON responses', async () => {
    clientMock.get.mockResolvedValue({
      data: {
        MediaContainer: {
          Directory: [
            {
              key: '2',
              title: 'Library',
              type: 'artist',
              language: 'en',
              scanner: 'scanner',
              agent: 'agent',
              Location: [{ path: '/media' }],
            },
          ],
        },
      },
    });

    const service = new PlexService();
    const libs = await service.getLibraries('http://plex', 'token');

    expect(libs).toEqual([
      {
        id: '2',
        title: 'Library',
        type: 'artist',
        language: 'en',
        scanner: 'scanner',
        agent: 'agent',
        locations: ['/media'],
      },
    ]);
  });

  it('returns null metadata for unauthorized users', async () => {
    clientMock.get.mockRejectedValue({ response: { status: 401 } });

    const service = new PlexService();
    const meta = await service.getItemMetadata('http://plex', 'token', 'rk-1');

    expect(meta).toBeNull();
  });

  it('returns null metadata when item is missing', async () => {
    clientMock.get.mockRejectedValue({ response: { status: 404 } });

    const service = new PlexService();
    const meta = await service.getItemMetadata('http://plex', 'token', 'rk-2');

    expect(meta).toBeNull();
  });

  it('parses metadata from XML responses', async () => {
    clientMock.get.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({
      MediaContainer: {
        Metadata: [{ $: { userRating: '9' } }],
      },
    });

    const service = new PlexService();
    const meta = await service.getItemMetadata('http://plex', 'token', 'rk-3');

    expect(meta?.userRating).toBe(9);
  });

  it('returns user ratings when metadata exists', async () => {
    clientMock.get.mockResolvedValue({
      data: { MediaContainer: { Metadata: [{ userRating: '7.5' }] } },
    });

    const service = new PlexService();
    const meta = await service.getItemMetadata('http://plex', 'token', 'rk-1');

    expect(meta?.userRating).toBe(7.5);
  });

  it('searches library content from XML responses', async () => {
    clientMock.get.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({
      MediaContainer: {
        Metadata: [
          {
            $: {
              ratingKey: 'rk-1',
              guid: 'guid-1',
              title: 'Title',
              grandparentTitle: 'Author',
              summary: 'Summary',
              thumb: '/thumb',
              addedAt: '1',
              updatedAt: '2',
              duration: '1000',
            },
          },
        ],
      },
    });

    const service = new PlexService();
    const results = await service.searchLibrary('http://plex', 'token', 'lib-1', 'Title');

    expect(results[0].ratingKey).toBe('rk-1');
    expect(results[0].author).toBe('Author');
  });

  it('returns empty arrays when search fails', async () => {
    clientMock.get.mockRejectedValue(new Error('search fail'));

    const service = new PlexService();
    const results = await service.searchLibrary('http://plex', 'token', 'lib-1', 'Title');

    expect(results).toEqual([]);
  });

  it('returns empty arrays when recently added data is not a list', async () => {
    clientMock.get.mockResolvedValue({
      data: { MediaContainer: { Metadata: {} } },
    });

    const service = new PlexService();
    const results = await service.getRecentlyAdded('http://plex', 'token', 'lib-1', 10);

    expect(results).toEqual([]);
  });

  it('returns empty arrays when library content data is not a list', async () => {
    clientMock.get.mockResolvedValue({
      data: { MediaContainer: { Metadata: {} } },
    });

    const service = new PlexService();
    const results = await service.getLibraryContent('http://plex', 'token', 'lib-1');

    expect(results).toEqual([]);
  });

  it('parses library content from XML responses', async () => {
    clientMock.get.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({
      MediaContainer: {
        Metadata: [
          {
            ratingKey: 'rk-1',
            guid: 'guid-1',
            title: 'Title',
            parentTitle: 'Author',
            writer: 'Narr',
            duration: '1000',
            year: '2020',
            summary: 'Summary',
            thumb: '/thumb',
            addedAt: '1',
            updatedAt: '2',
            userRating: '7',
          },
        ],
      },
    });

    const service = new PlexService();
    const results = await service.getLibraryContent('http://plex', 'token', 'lib-1');

    expect(results).toEqual([
      {
        ratingKey: 'rk-1',
        guid: 'guid-1',
        title: 'Title',
        author: 'Author',
        narrator: 'Narr',
        duration: 1000,
        year: 2020,
        summary: 'Summary',
        thumb: '/thumb',
        addedAt: 1,
        updatedAt: 2,
        userRating: 7,
      },
    ]);
  });

  it('throws when fetching library content fails with 401', async () => {
    clientMock.get.mockRejectedValue({ response: { status: 401 } });

    const service = new PlexService();

    await expect(service.getLibraryContent('http://plex', 'token', 'lib-1')).rejects.toThrow(
      'Failed to retrieve content from Plex library'
    );
  });

  it('returns recently added items from JSON responses', async () => {
    clientMock.get.mockResolvedValue({
      data: {
        MediaContainer: {
          Metadata: [
            {
              ratingKey: 'rk-2',
              guid: 'guid-2',
              title: 'New Title',
              parentTitle: 'Author',
              writer: 'Narrator',
              duration: '2000',
              year: '2021',
              summary: 'Summary',
              thumb: '/thumb2',
              addedAt: '3',
              updatedAt: '4',
              userRating: '8',
            },
          ],
        },
      },
    });

    const service = new PlexService();
    const results = await service.getRecentlyAdded('http://plex', 'token', 'lib-1', 5);

    expect(results).toEqual([
      {
        ratingKey: 'rk-2',
        guid: 'guid-2',
        title: 'New Title',
        author: 'Author',
        narrator: 'Narrator',
        duration: 2000,
        year: 2021,
        summary: 'Summary',
        thumb: '/thumb2',
        addedAt: 3,
        updatedAt: 4,
        userRating: 8,
      },
    ]);
  });

  it('triggers Plex library scans', async () => {
    clientMock.get.mockResolvedValue({ data: {} });

    const service = new PlexService();
    await expect(service.scanLibrary('http://plex', 'token', 'lib-1')).resolves.toBeUndefined();

    expect(clientMock.get).toHaveBeenCalledWith(
      'http://plex/library/sections/lib-1/refresh',
      expect.objectContaining({
        headers: { 'X-Plex-Token': 'token' },
      })
    );
  });

  it('throws when scan triggers fail', async () => {
    clientMock.get.mockRejectedValue(new Error('scan failed'));

    const service = new PlexService();

    await expect(service.scanLibrary('http://plex', 'token', 'lib-1')).rejects.toThrow(
      'Failed to trigger Plex library scan'
    );
  });

  it('collects ratings in batch and skips failures', async () => {
    const service = new PlexService();
    const getItemSpy = vi.spyOn(service, 'getItemMetadata')
      .mockResolvedValueOnce({ userRating: 4 })
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ userRating: 3 });

    const ratings = await service.batchGetUserRatings('http://plex', 'token', ['a', 'b', 'c']);

    expect(getItemSpy).toHaveBeenCalledTimes(3);
    expect(ratings.get('a')).toBe(4);
    expect(ratings.get('c')).toBe(3);
    expect(ratings.has('b')).toBe(false);
  });

  it('extracts home users from API responses', async () => {
    clientMock.get.mockResolvedValue({
      data: {
        MediaContainer: {
          User: [
            {
              $: {
                id: '1',
                uuid: 'uuid',
                title: 'User',
                username: 'user',
                email: 'user@example.com',
                thumb: '/thumb',
                hasPassword: '1',
                restricted: '0',
                admin: '1',
                guest: '0',
                protected: '0',
              },
            },
          ],
        },
      },
    });

    const service = new PlexService();
    const users = await service.getHomeUsers('token');

    expect(users).toHaveLength(1);
    expect(users[0].friendlyName).toBe('User');
    expect(users[0].admin).toBe(true);
  });

  it('extracts home users from home.users responses', async () => {
    clientMock.get.mockResolvedValue({
      data: {
        home: {
          users: [
            {
              user: {
                id: '2',
                uuid: 'uuid-2',
                title: 'Kid',
                username: 'kid',
                email: 'kid@example.com',
                thumb: '/thumb',
                hasPassword: 'true',
                restricted: 'true',
                admin: 'false',
                guest: 'false',
                protected: 'true',
              },
            },
          ],
        },
      },
    });

    const service = new PlexService();
    const users = await service.getHomeUsers('token');

    expect(users).toHaveLength(1);
    expect(users[0].friendlyName).toBe('Kid');
    expect(users[0].restricted).toBe(true);
    expect(users[0].protected).toBe(true);
  });

  it('returns empty list when no home users are available', async () => {
    clientMock.get.mockResolvedValue({ data: {} });

    const service = new PlexService();
    const users = await service.getHomeUsers('token');

    expect(users).toEqual([]);
  });

  it('returns empty list when fetching home users fails', async () => {
    clientMock.get.mockRejectedValue(new Error('home users down'));

    const service = new PlexService();
    const users = await service.getHomeUsers('token');

    expect(users).toEqual([]);
  });

  it('switches home users and returns profile token', async () => {
    clientMock.post.mockResolvedValue({ data: '<xml />' });
    parseStringPromiseMock.mockResolvedValue({
      user: { $: { authenticationToken: 'profile-token' } },
    });

    const service = new PlexService();
    const token = await service.switchHomeUser('user-1', 'token');

    expect(token).toBe('profile-token');
  });

  it('returns null when switch response has no auth token', async () => {
    clientMock.post.mockResolvedValue({ data: { user: { name: 'NoToken' } } });

    const service = new PlexService();
    const token = await service.switchHomeUser('user-2', 'token');

    expect(token).toBeNull();
  });

  it('returns token from direct switch responses', async () => {
    clientMock.post.mockResolvedValue({ data: { authenticationToken: 'token-1' } });

    const service = new PlexService();
    const token = await service.switchHomeUser('user-4', 'token');

    expect(token).toBe('token-1');
  });

  it('returns token when authenticationToken is nested under user', async () => {
    clientMock.post.mockResolvedValue({ data: { user: { authenticationToken: 'token-2' } } });

    const service = new PlexService();
    const token = await service.switchHomeUser('user-5', 'token');

    expect(token).toBe('token-2');
  });

  it('returns token when authenticationToken is on root attributes', async () => {
    clientMock.post.mockResolvedValue({ data: { $: { authenticationToken: 'token-3' } } });

    const service = new PlexService();
    const token = await service.switchHomeUser('user-6', 'token');

    expect(token).toBe('token-3');
  });

  it('throws when switching home user with invalid PIN', async () => {
    clientMock.post.mockRejectedValue({ response: { status: 401 } });

    const service = new PlexService();

    await expect(service.switchHomeUser('user-3', 'token', '1234')).rejects.toThrow('Invalid PIN');
  });

  it('throws when switching home user fails for non-auth errors', async () => {
    clientMock.post.mockRejectedValue({ response: { status: 500 }, message: 'boom' });

    const service = new PlexService();

    await expect(service.switchHomeUser('user-9', 'token')).rejects.toThrow(
      'Failed to switch to selected profile'
    );
  });

  it('returns a singleton instance from getPlexService', async () => {
    const { getPlexService } = await import('@/lib/integrations/plex.service');
    const serviceA = getPlexService();
    const serviceB = getPlexService();

    expect(serviceA).toBe(serviceB);
  });
});
