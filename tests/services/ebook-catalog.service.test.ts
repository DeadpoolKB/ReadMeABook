import {
  normalizeOpenLibraryBook,
  resolveLibgenDownloadUrl,
  searchLibgen,
  searchOpenLibrary,
} from '@/lib/services/ebook-catalog.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ebook catalog service', () => {
  it('normalizes Open Library work records and skips records without an identity or title', () => {
    expect(normalizeOpenLibraryBook({
      key: '/works/OL123W',
      title: '  Example Book  ',
      author_name: ['   ', 'A. Writer'],
      isbn: ['9780000000000'],
      cover_i: 42,
      first_publish_year: 2020,
    })).toEqual({
      catalogId: 'OL123W',
      title: 'Example Book',
      author: 'A. Writer',
      isbn: '9780000000000',
      coverArtUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg',
      year: 2020,
    });
    expect(normalizeOpenLibraryBook({ key: '/works/OL123W', title: ' ' })).toBeNull();
    expect(normalizeOpenLibraryBook({ title: 'Untitled identity' })).toBeNull();
  });

  it('requests a page of catalog results and reports whether more results exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      docs: [
        { key: '/works/OL123W', title: 'Example Book', author_name: ['A. Writer'] },
      ],
      numFound: 30,
      start: 24,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchOpenLibrary('  Example Book  ', 2)).resolves.toEqual({
      results: [{ catalogId: 'OL123W', title: 'Example Book', author: 'A. Writer' }],
      page: 2,
      totalResults: 30,
      hasMore: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=Example+Book');
    expect(String(fetchMock.mock.calls[0][0])).toContain('page=2');
  });

  it('does not make a catalog request for a blank query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchOpenLibrary('   ')).resolves.toEqual({
      results: [],
      page: 1,
      totalResults: 0,
      hasMore: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches configured LibGen mirrors and parses ebook release metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`
      <table id="tablelibgen">
        <tr><th>Title</th></tr>
        <tr>
          <td>Example Book</td><td>A. Writer</td><td>Pub</td><td>2020</td>
          <td>English</td><td>300</td><td>1.5 MB</td><td>epub</td>
          <td><a href="get.php?md5=0123456789abcdef0123456789abcdef">mirror</a></td>
        </tr>
      </table>`, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchLibgen('Example Book', ['https://libgen.example'])).resolves.toMatchObject([
      {
        guid: 'libgen-0123456789abcdef0123456789abcdef',
        title: 'Example Book',
        size: Math.round(1.5 * 1024 * 1024),
        source: 'libgen',
        format: 'epub',
        md5: '0123456789abcdef0123456789abcdef',
      },
    ]);
  });

  it('resolves a keyed LibGen GET link and uses the record page as referer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      '<a href="get.php?md5=0123456789abcdef0123456789abcdef&amp;key=abc"><h2>GET</h2></a>',
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(resolveLibgenDownloadUrl(
      '0123456789abcdef0123456789abcdef',
      ['https://libgen.example'],
    )).resolves.toEqual({
      downloadUrl: 'https://libgen.example/get.php?md5=0123456789abcdef0123456789abcdef&key=abc',
      referer: 'https://libgen.example/ads.php?md5=0123456789abcdef0123456789abcdef',
    });
  });
});
