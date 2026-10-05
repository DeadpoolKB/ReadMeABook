async function fetchViaFlareSolverr(
  targetUrl: string,
  flaresolverrUrl: string,
  timeout: number = FLARESOLVERR_TIMEOUT_MS
): Promise<string> {
  moduleLogger.info(`[FlareSolverr] Requesting: ${targetUrl}`);
  moduleLogger.info(`[FlareSolverr] Server: ${flaresolverrUrl}`);
  moduleLogger.info(`[FlareSolverr] Timeout: ${timeout}ms`);

  const requestBody: FlareSolverrRequest = {
    cmd: 'request.get',
    url: targetUrl,
    maxTimeout: timeout,
  };

  const startTime = Date.now();

  try {
    const response = await axios.post<FlareSolverrResponse>(
      `${flaresolverrUrl}/v1`,
      requestBody,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: timeout + 5000,
      }
    );

    const elapsed = Date.now() - startTime;

    moduleLogger.info(`[FlareSolverr] Response received in ${elapsed}ms`);
    moduleLogger.info(`[FlareSolverr] Status: ${response.data.status}`);
    moduleLogger.info(
      `[FlareSolverr] Message: ${response.data.message || '(none)'}`
    );

    if (!response.data.solution) {
      moduleLogger.error('[FlareSolverr] No solution returned');
      throw new Error(`FlareSolverr error: ${response.data.message}`);
    }

    moduleLogger.info(
      `[FlareSolverr] HTTP status: ${response.data.solution.status}`
    );
    moduleLogger.info(
      `[FlareSolverr] Final URL: ${response.data.solution.url}`
    );
    moduleLogger.info(
      `[FlareSolverr] User-Agent: ${response.data.solution.userAgent}`
    );
    moduleLogger.info(
      `[FlareSolverr] Cookies returned: ${response.data.solution.cookies?.length ?? 0}`
    );
    moduleLogger.info(
      `[FlareSolverr] HTML length: ${response.data.solution.response?.length ?? 0}`
    );

    if (response.data.status !== 'ok') {
      throw new Error(`FlareSolverr error: ${response.data.message}`);
    }

    if (response.data.solution.status >= 400) {
      throw new Error(
        `FlareSolverr returned HTTP ${response.data.solution.status}`
      );
    }

    return response.data.solution.response;
  } catch (error) {
    const elapsed = Date.now() - startTime;

    moduleLogger.error(
      `[FlareSolverr] FAILED after ${elapsed}ms: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    throw error;
  }
}

async function fetchHtml(
  url: string,
  flaresolverrUrl?: string,
  logger?: RMABLogger
): Promise<string> {
  moduleLogger.info('========================================');
  moduleLogger.info(`[HTTP] Fetching URL: ${url}`);
  moduleLogger.info(
    `[HTTP] FlareSolverr configured: ${flaresolverrUrl ? 'YES' : 'NO'}`
  );

  if (flaresolverrUrl) {
    try {
      moduleLogger.info('[HTTP] Attempting FlareSolverr');

      const html = await fetchViaFlareSolverr(url, flaresolverrUrl);

      moduleLogger.info(
        `[HTTP] FlareSolverr SUCCESS - HTML length: ${html.length}`
      );

      const challengeDetected =
        html.includes('challenge-running') ||
        html.includes('cf-browser-verification') ||
        html.includes('Just a moment') ||
        html.includes('Cloudflare');

      moduleLogger.info(
        `[HTTP] Cloudflare/challenge indicators: ${
          challengeDetected ? 'YES' : 'NO'
        }`
      );

      return html;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      moduleLogger.error(`[HTTP] FlareSolverr FAILED: ${message}`);

      await logger?.warn(
        `FlareSolverr failed, falling back to direct request: ${message}`
      );
    }
  }

  moduleLogger.info('[HTTP] Attempting direct Axios request');

  try {
    const startTime = Date.now();

    const response = await retryRequest(() =>
      axios.get(url, {
        headers: {
          'User-Agent': RMAB_USER_AGENT,
        },
        timeout: 30000,
      })
    );

    const elapsed = Date.now() - startTime;

    moduleLogger.info(`[HTTP] Direct request SUCCESS in ${elapsed}ms`);
    moduleLogger.info(`[HTTP] HTTP status: ${response.status}`);
    moduleLogger.info(
      `[HTTP] Final URL: ${response.request?.res?.responseUrl ?? url}`
    );
    moduleLogger.info(
      `[HTTP] Response content type: ${
        response.headers?.['content-type'] ?? '(unknown)'
      }`
    );
    moduleLogger.info(
      `[HTTP] Response length: ${response.data?.length ?? 0}`
    );

    const html = response.data;

    const challengeDetected =
      typeof html === 'string' &&
      (
        html.includes('challenge-running') ||
        html.includes('cf-browser-verification') ||
        html.includes('Just a moment') ||
        html.includes('Cloudflare')
      );

    moduleLogger.info(
      `[HTTP] Cloudflare/challenge indicators: ${
        challengeDetected ? 'YES' : 'NO'
      }`
    );

    return html;
  } catch (error) {
    moduleLogger.error(
      `[HTTP] Direct request FAILED: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    throw error;
  }
}

export async function searchByAsin(
  asin: string,
  format: string,
  baseUrl: string,
  logger?: RMABLogger,
  flaresolverrUrl?: string,
  languageCode: string = 'en'
): Promise<string | null> {
  const cacheKey = `${asin}-${format}-${languageCode}`;

  moduleLogger.info('========================================');
  moduleLogger.info('[ASIN SEARCH] START');
  moduleLogger.info(`[ASIN SEARCH] ASIN: ${asin}`);
  moduleLogger.info(`[ASIN SEARCH] Format: ${format}`);
  moduleLogger.info(`[ASIN SEARCH] Language: ${languageCode}`);
  moduleLogger.info(`[ASIN SEARCH] Base URL: ${baseUrl}`);
  moduleLogger.info(`[ASIN SEARCH] Cache key: ${cacheKey}`);

  if (md5Cache.has(cacheKey)) {
    const cached = md5Cache.get(cacheKey);

    moduleLogger.info(
      `[ASIN SEARCH] CACHE HIT: ${cached ?? 'NULL'}`
    );

    if (cached) {
      await logger?.info(`Using cached MD5 for ASIN ${asin}`);
    }

    return cached ?? null;
  }

  moduleLogger.info('[ASIN SEARCH] CACHE MISS');

  try {
    const formatParam =
      format && format !== 'any' ? `ext=${format}&` : '';

    const searchUrl =
      `${baseUrl}/search?${formatParam}` +
      `lang=${languageCode}&q=%22asin:${asin}%22`;

    moduleLogger.info(`[ASIN SEARCH] Search URL: ${searchUrl}`);
    moduleLogger.info(
      `[ASIN SEARCH] Format filter applied: ${
        format && format !== 'any' ? format : 'NONE'
      }`
    );

    const html = await fetchHtml(
      searchUrl,
      flaresolverrUrl,
      logger
    );

    moduleLogger.info(
      `[ASIN SEARCH] HTML length: ${html.length}`
    );

    const $ = cheerio.load(html);

    const pageTitle = $('title').text().trim();

    moduleLogger.info(
      `[ASIN SEARCH] Page title: "${pageTitle}"`
    );

    moduleLogger.info(
      `[ASIN SEARCH] HTML contains ASIN: ${
        html.toLowerCase().includes(asin.toLowerCase())
          ? 'YES'
          : 'NO'
      }`
    );

    moduleLogger.info(
      `[ASIN SEARCH] HTML contains "/md5/": ${
        html.includes('/md5/') ? 'YES' : 'NO'
      }`
    );

    const allMd5Links = $('a[href*="/md5/"]');

    moduleLogger.info(
      `[ASIN SEARCH] Total /md5/ links: ${allMd5Links.length}`
    );

    allMd5Links.each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim().replace(/\s+/g, ' ');

      const inRecentDownloads =
        $(elem).closest('.js-recent-downloads-container').length > 0;

      const inPartialMatches =
        $(elem).closest('.js-partial-matches-show').length > 0;

      moduleLogger.info(
        `[ASIN SEARCH] MD5 LINK #${i + 1}: ` +
        `href="${href}" ` +
        `text="${text.substring(0, 150)}" ` +
        `recentDownloads=${inRecentDownloads} ` +
        `partialMatches=${inPartialMatches}`
      );
    });

    const searchResultLinks = allMd5Links.filter((i, elem) => {
      if (
        $(elem).closest('.js-recent-downloads-container').length > 0
      ) {
        return false;
      }

      if (
        $(elem).closest('.js-partial-matches-show').length > 0
      ) {
        return false;
      }

      return true;
    });

    moduleLogger.info(
      `[ASIN SEARCH] Valid search result links: ${searchResultLinks.length}`
    );

    if (searchResultLinks.length === 0) {
      moduleLogger.warn(
        '[ASIN SEARCH] NO VALID SEARCH RESULTS'
      );

      moduleLogger.warn(
        `[ASIN SEARCH] Search URL was: ${searchUrl}`
      );

      moduleLogger.warn(
        `[ASIN SEARCH] Page title was: "${pageTitle}"`
      );

      const bodyText = $('body')
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      moduleLogger.warn(
        `[ASIN SEARCH] Body text preview: ${bodyText.substring(0, 1000)}`
      );

      md5Cache.set(cacheKey, null);

      return null;
    }

    const firstResult = searchResultLinks.first();
    const href = firstResult.attr('href');

    const resultText = firstResult
      .text()
      .trim()
      .replace(/\s+/g, ' ');

    const parentText = firstResult
      .parent()
      .text()
      .trim()
      .replace(/\s+/g, ' ');

    moduleLogger.info(
      `[ASIN SEARCH] SELECTED RESULT`
    );
    moduleLogger.info(
      `[ASIN SEARCH] href: ${href ?? '(none)'}`
    );
    moduleLogger.info(
      `[ASIN SEARCH] text: ${resultText.substring(0, 500)}`
    );
    moduleLogger.info(
      `[ASIN SEARCH] parent: ${parentText.substring(0, 500)}`
    );

    if (!href) {
      moduleLogger.warn(
        '[ASIN SEARCH] Selected result has no href'
      );

      md5Cache.set(cacheKey, null);
      return null;
    }

    const md5Match = href.match(/\/md5\/([a-f0-9]+)/i);

    if (!md5Match) {
      moduleLogger.warn(
        `[ASIN SEARCH] Could not extract MD5 from href: ${href}`
      );

      md5Cache.set(cacheKey, null);
      return null;
    }

    const md5 = md5Match[1];

    moduleLogger.info(
      `[ASIN SEARCH] SUCCESS - MD5: ${md5}`
    );

    md5Cache.set(cacheKey, md5);

    await delay(REQUEST_DELAY_MS);

    return md5;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    moduleLogger.error(
      `[ASIN SEARCH] EXCEPTION: ${message}`
    );

    await logger?.error(
      `Search failed: ${message}`
    );

    md5Cache.set(cacheKey, null);

    return null;
  }
}

export async function searchByTitle(
  title: string,
  author: string,
  format: string,
  baseUrl: string,
  logger?: RMABLogger,
  flaresolverrUrl?: string,
  languageCode: string = 'en'
): Promise<string | null> {
  const cacheKey =
    `title-${title}-${author}-${format}-${languageCode}`.toLowerCase();

  moduleLogger.info('========================================');
  moduleLogger.info('[TITLE SEARCH] START');
  moduleLogger.info(`[TITLE SEARCH] Title: "${title}"`);
  moduleLogger.info(`[TITLE SEARCH] Author: "${author}"`);
  moduleLogger.info(`[TITLE SEARCH] Format: ${format}`);
  moduleLogger.info(`[TITLE SEARCH] Language: ${languageCode}`);
  moduleLogger.info(`[TITLE SEARCH] Base URL: ${baseUrl}`);
  moduleLogger.info(`[TITLE SEARCH] Cache key: ${cacheKey}`);

  if (md5Cache.has(cacheKey)) {
    const cached = md5Cache.get(cacheKey);

    moduleLogger.info(
      `[TITLE SEARCH] CACHE HIT: ${cached ?? 'NULL'}`
    );

    if (cached) {
      await logger?.info(
        'Using cached MD5 for title search'
      );
    }

    return cached ?? null;
  }

  moduleLogger.info('[TITLE SEARCH] CACHE MISS');

  try {
    const encodedAuthor = encodeURIComponent(author);
    const encodedTitle = encodeURIComponent(title);

    let searchUrl =
      `${baseUrl}/search?` +
      `termtype_1=author&termval_1=${encodedAuthor}` +
      `&termtype_2=title&termval_2=${encodedTitle}`;

    if (format && format !== 'any') {
      searchUrl += `&ext=${format}`;
    }

    searchUrl +=
      '&content=book_nonfiction' +
      '&content=book_fiction' +
      '&content=book_unknown';

    if (languageCode) {
      searchUrl += `&lang=${languageCode}`;
    }

    searchUrl += '&q=';

    moduleLogger.info(
      `[TITLE SEARCH] Encoded title: ${encodedTitle}`
    );
    moduleLogger.info(
      `[TITLE SEARCH] Encoded author: ${encodedAuthor}`
    );
    moduleLogger.info(
      `[TITLE SEARCH] Search URL: ${searchUrl}`
    );

    const html = await fetchHtml(
      searchUrl,
      flaresolverrUrl,
      logger
    );

    moduleLogger.info(
      `[TITLE SEARCH] HTML length: ${html.length}`
    );

    const $ = cheerio.load(html);

    const pageTitle = $('title').text().trim();

    moduleLogger.info(
      `[TITLE SEARCH] Page title: "${pageTitle}"`
    );

    moduleLogger.info(
      `[TITLE SEARCH] HTML contains title: ${
        html.toLowerCase().includes(title.toLowerCase())
          ? 'YES'
          : 'NO'
      }`
    );

    moduleLogger.info(
      `[TITLE SEARCH] HTML contains author: ${
        html.toLowerCase().includes(author.toLowerCase())
          ? 'YES'
          : 'NO'
      }`
    );

    moduleLogger.info(
      `[TITLE SEARCH] HTML contains "/md5/": ${
        html.includes('/md5/') ? 'YES' : 'NO'
      }`
    );

    const allMd5Links = $('a[href*="/md5/"]');

    moduleLogger.info(
      `[TITLE SEARCH] Total /md5/ links: ${allMd5Links.length}`
    );

    allMd5Links.each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim().replace(/\s+/g, ' ');

      const inRecentDownloads =
        $(elem).closest('.js-recent-downloads-container').length > 0;

      const inPartialMatches =
        $(elem).closest('.js-partial-matches-show').length > 0;

      moduleLogger.info(
        `[TITLE SEARCH] MD5 LINK #${i + 1}: ` +
        `href="${href}" ` +
        `text="${text.substring(0, 150)}" ` +
        `recentDownloads=${inRecentDownloads} ` +
        `partialMatches=${inPartialMatches}`
      );
    });

    const searchResultLinks = allMd5Links.filter((i, elem) => {
      if (
        $(elem).closest('.js-recent-downloads-container').length > 0
      ) {
        return false;
      }

      if (
        $(elem).closest('.js-partial-matches-show').length > 0
      ) {
        return false;
      }

      return true;
    });

    moduleLogger.info(
      `[TITLE SEARCH] Valid search result links: ${searchResultLinks.length}`
    );

    if (searchResultLinks.length === 0) {
      const bodyText = $('body')
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      moduleLogger.warn(
        '[TITLE SEARCH] NO VALID SEARCH RESULTS'
      );

      moduleLogger.warn(
        `[TITLE SEARCH] Body text preview: ${bodyText.substring(0, 1500)}`
      );

      md5Cache.set(cacheKey, null);

      return null;
    }

    searchResultLinks.each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem)
        .text()
        .trim()
        .replace(/\s+/g, ' ');

      moduleLogger.info(
        `[TITLE SEARCH] CANDIDATE #${i + 1}: ` +
        `href="${href}" ` +
        `text="${text.substring(0, 500)}"`
      );
    });

    const firstResult = searchResultLinks.first();
    const href = firstResult.attr('href');

    moduleLogger.info(
      `[TITLE SEARCH] SELECTING FIRST RESULT: ${href ?? '(none)'}`
    );

    if (!href) {
      moduleLogger.warn(
        '[TITLE SEARCH] First result has no href'
      );

      md5Cache.set(cacheKey, null);
      return null;
    }

    const md5Match = href.match(/\/md5\/([a-f0-9]+)/i);

    if (!md5Match) {
      moduleLogger.warn(
        `[TITLE SEARCH] Could not extract MD5 from: ${href}`
      );

      md5Cache.set(cacheKey, null);
      return null;
    }

    const md5 = md5Match[1];

    moduleLogger.info(
      `[TITLE SEARCH] SUCCESS - MD5: ${md5}`
    );

    md5Cache.set(cacheKey, md5);

    await delay(REQUEST_DELAY_MS);

    return md5;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    moduleLogger.error(
      `[TITLE SEARCH] EXCEPTION: ${message}`
    );

    await logger?.error(
      `Title search failed: ${message}`
    );

    md5Cache.set(cacheKey, null);

    return null;
  }
}

export async function getSlowDownloadLinks(
  md5: string,
  baseUrl: string,
  logger?: RMABLogger,
  flaresolverrUrl?: string
): Promise<string[]> {
  moduleLogger.info('========================================');
  moduleLogger.info('[SLOW LINKS] START');
  moduleLogger.info(`[SLOW LINKS] MD5: ${md5}`);

  try {
    const md5Url = `${baseUrl}/md5/${md5}`;

    moduleLogger.info(
      `[SLOW LINKS] MD5 URL: ${md5Url}`
    );

    const html = await fetchHtml(
      md5Url,
      flaresolverrUrl,
      logger
    );

    moduleLogger.info(
      `[SLOW LINKS] HTML length: ${html.length}`
    );

    const $ = cheerio.load(html);

    moduleLogger.info(
      `[SLOW LINKS] Page title: "${$('title').text().trim()}"`
    );

    const challengeDetected =
      html.includes('challenge-running') ||
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment');

    moduleLogger.info(
      `[SLOW LINKS] Challenge detected: ${
        challengeDetected ? 'YES' : 'NO'
      }`
    );

    const allLinks = $('a');

    moduleLogger.info(
      `[SLOW LINKS] Total <a> elements: ${allLinks.length}`
    );

    const slowDownloadLinks = $('a[href*="/slow_download/"]');

    moduleLogger.info(
      `[SLOW LINKS] /slow_download/ links: ${slowDownloadLinks.length}`
    );

    const slowLinks: string[] = [];

    slowDownloadLinks.each((i, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem)
        .text()
        .trim()
        .replace(/\s+/g, ' ');

      const parentText = $(elem)
        .parent()
        .text()
        .trim()
        .replace(/\s+/g, ' ');

      const grandparentText = $(elem)
        .parent()
        .parent()
        .text()
        .trim()
        .replace(/\s+/g, ' ');

      moduleLogger.info(
        `[SLOW LINKS] CANDIDATE #${i + 1}`
      );
      moduleLogger.info(
        `[SLOW LINKS] href: ${href ?? '(none)'}`
      );
      moduleLogger.info(
        `[SLOW LINKS] text: "${linkText.substring(0, 300)}"`
      );
      moduleLogger.info(
        `[SLOW LINKS] parent: "${parentText.substring(0, 500)}"`
      );
      moduleLogger.info(
        `[SLOW LINKS] grandparent: "${grandparentText.substring(0, 500)}"`
      );

      const combinedText =
        `${linkText} ${parentText} ${grandparentText}`.toLowerCase();

      const noWaitlist = combinedText.includes('no waitlist');

      moduleLogger.info(
        `[SLOW LINKS] "no waitlist": ${noWaitlist ? 'YES' : 'NO'}`
      );

      if (href && noWaitlist) {
        const fullUrl =
          href.startsWith('http')
            ? href
            : `${baseUrl}${href}`;

        slowLinks.push(fullUrl);

        moduleLogger.info(
          `[SLOW LINKS] ACCEPTED: ${fullUrl}`
        );
      } else {
        moduleLogger.info(
          `[SLOW LINKS] REJECTED`
        );
      }
    });

    moduleLogger.info(
      `[SLOW LINKS] FINAL COUNT: ${slowLinks.length}`
    );

    slowLinks.forEach((link, index) => {
      moduleLogger.info(
        `[SLOW LINKS] FINAL #${index + 1}: ${link}`
      );
    });

    await delay(REQUEST_DELAY_MS);

    return slowLinks;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    moduleLogger.error(
      `[SLOW LINKS] EXCEPTION: ${message}`
    );

    await logger?.error(
      `Failed to get slow links: ${message}`
    );

    return [];
  }
}

export async function extractDownloadUrl(
  slowDownloadUrl: string,
  baseUrl: string,
  format: string,
  logger?: RMABLogger,
  flaresolverrUrl?: string
): Promise<ExtractedDownload | null> {
  moduleLogger.info('========================================');
  moduleLogger.info('[EXTRACT] START');
  moduleLogger.info(
    `[EXTRACT] Slow download URL: ${slowDownloadUrl}`
  );
  moduleLogger.info(
    `[EXTRACT] Requested format: ${format}`
  );

  try {
    const html = await fetchHtml(
      slowDownloadUrl,
      flaresolverrUrl,
      logger
    );

    moduleLogger.info(
      `[EXTRACT] HTML length: ${html.length}`
    );

    const $ = cheerio.load(html);

    moduleLogger.info(
      `[EXTRACT] Page title: "${$('title').text().trim()}"`
    );

    let pattern: RegExp;

    if (format === 'any') {
      pattern =
        /(https?:\/\/[^\s"'<>]+\.(epub|pdf|mobi|azw3|djvu|fb2))(?:[?#][^\s"'<>]*)?/i;
    } else {
      pattern =
        new RegExp(
          `(https?:\\/\\/[^\\s"'<>]+\\.${format})(?:[?#][^\\s"'<>]*)?`,
          'i'
        );
    }

    moduleLogger.info(
      `[EXTRACT] Regex: ${pattern.toString()}`
    );

    let downloadUrl: string | null = null;
    let detectedFormat: string | null = null;

    $('pre, code').each((i, elem) => {
      const text = $(elem).text();

      moduleLogger.info(
        `[EXTRACT] Searching pre/code block #${i + 1}, length=${text.length}`
      );

      const match = text.match(pattern);

      if (match) {
        downloadUrl = match[1];

        moduleLogger.info(
          `[EXTRACT] MATCH FOUND in pre/code: ${downloadUrl}`
        );

        const formatMatch =
          downloadUrl.match(
            /\.(epub|pdf|mobi|azw3|djvu|fb2)(?:[?#]|$)/i
          );

        detectedFormat =
          formatMatch
            ? formatMatch[1].toLowerCase()
            : null;

        moduleLogger.info(
          `[EXTRACT] Detected format: ${detectedFormat ?? '(none)'}`
        );

        return false;
      }
    });

    if (!downloadUrl) {
      const bodyText = $('body').text();

      moduleLogger.info(
        `[EXTRACT] No pre/code match; searching body text length=${bodyText.length}`
      );

      const match = bodyText.match(pattern);

      if (match) {
        downloadUrl = match[1];

        moduleLogger.info(
          `[EXTRACT] MATCH FOUND in body: ${downloadUrl}`
        );

        const formatMatch =
          downloadUrl.match(
            /\.(epub|pdf|mobi|azw3|djvu|fb2)(?:[?#]|$)/i
          );

        detectedFormat =
          formatMatch
            ? formatMatch[1].toLowerCase()
            : null;

        moduleLogger.info(
          `[EXTRACT] Detected format: ${detectedFormat ?? '(none)'}`
        );
      }
    }

    if (!downloadUrl) {
      moduleLogger.warn(
        '[EXTRACT] NO DOWNLOAD URL FOUND'
      );

      const bodyText = $('body')
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      moduleLogger.warn(
        `[EXTRACT] Body preview: ${bodyText.substring(0, 2000)}`
      );
    }

    if (!detectedFormat) {
      moduleLogger.warn(
        '[EXTRACT] Could not determine file format'
      );
    }

    await delay(REQUEST_DELAY_MS);

    if (!downloadUrl || !detectedFormat) {
      return null;
    }

    moduleLogger.info(
      `[EXTRACT] SUCCESS: ${downloadUrl} (${detectedFormat})`
    );

    return {
      url: downloadUrl,
      format: detectedFormat,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    moduleLogger.error(
      `[EXTRACT] EXCEPTION: ${message}`
    );

    await logger?.error(
      `Failed to extract download URL: ${message}`
    );

    return null;
  }
}

export async function downloadEbook(
  asin: string,
  title: string,
  author: string,
  targetDir: string,
  preferredFormat: string = 'epub',
  baseUrl: string = 'https://annas-archive.gl',
  logger?: RMABLogger,
  flaresolverrUrl?: string,
  languageCode: string = 'en'
): Promise<EbookDownloadResult> {
  moduleLogger.info('########################################');
  moduleLogger.info('### EBOOK DOWNLOAD START');
  moduleLogger.info('########################################');

  moduleLogger.info(`[MAIN] ASIN: ${asin || '(none)'}`);
  moduleLogger.info(`[MAIN] Title: "${title}"`);
  moduleLogger.info(`[MAIN] Author: "${author}"`);
  moduleLogger.info(`[MAIN] Target directory: ${targetDir}`);
  moduleLogger.info(`[MAIN] Preferred format: ${preferredFormat}`);
  moduleLogger.info(`[MAIN] Base URL: ${baseUrl}`);
  moduleLogger.info(`[MAIN] Language: ${languageCode}`);
  moduleLogger.info(
    `[MAIN] FlareSolverr: ${
      flaresolverrUrl || '(not configured)'
    }`
  );

  try {
    let md5: string | null = null;

    if (asin) {
      await logger?.info(
        `Searching by ASIN: ${asin} (format: ${preferredFormat})...`
      );

      md5 = await searchByAsin(
        asin,
        preferredFormat,
        baseUrl,
        logger,
        flaresolverrUrl,
        languageCode
      );

      moduleLogger.info(
        `[MAIN] ASIN search result: ${md5 ?? 'NOT FOUND'}`
      );
    }

    if (!md5) {
      moduleLogger.info(
        '[MAIN] Falling back to title + author search'
      );

      await logger?.info(
        `Searching by title + author: "${title}" by ${author}...`
      );

      md5 = await searchByTitle(
        title,
        author,
        preferredFormat,
        baseUrl,
        logger,
        flaresolverrUrl,
        languageCode
      );

      moduleLogger.info(
        `[MAIN] Title search result: ${md5 ?? 'NOT FOUND'}`
      );
    }

    if (!md5) {
      moduleLogger.error(
        '[MAIN] BOOK NOT FOUND - both searches returned null'
      );

      return {
        success: false,
        error:
          'No search results found (tried ASIN and title+author)',
      };
    }

    moduleLogger.info(
      `[MAIN] Using MD5: ${md5}`
    );

    const slowLinks = await getSlowDownloadLinks(
      md5,
      baseUrl,
      logger,
      flaresolverrUrl
    );

    moduleLogger.info(
      `[MAIN] Slow links found: ${slowLinks.length}`
    );

    if (slowLinks.length === 0) {
      moduleLogger.error(
        '[MAIN] No download links available'
      );

      return {
        success: false,
        error: 'No download links available',
      };
    }

    const attemptsLimit = Math.min(
      slowLinks.length,
      MAX_SLOW_LINK_ATTEMPTS
    );

    moduleLogger.info(
      `[MAIN] Will attempt ${attemptsLimit} download link(s)`
    );

    for (let i = 0; i < attemptsLimit; i++) {
      const slowLink = slowLinks[i];

      moduleLogger.info('----------------------------------------');
      moduleLogger.info(
        `[MAIN] DOWNLOAD ATTEMPT ${i + 1}/${attemptsLimit}`
      );
      moduleLogger.info(
        `[MAIN] Slow link: ${slowLink}`
      );

      try {
        const extracted = await extractDownloadUrl(
          slowLink,
          baseUrl,
          preferredFormat,
          logger,
          flaresolverrUrl
        );

        if (!extracted) {
          moduleLogger.warn(
            `[MAIN] No download URL extracted from attempt ${i + 1}`
          );

          await delay(REQUEST_DELAY_MS);
          continue;
        }

        moduleLogger.info(
          `[MAIN] Extracted URL: ${extracted.url}`
        );
        moduleLogger.info(
          `[MAIN] Detected format: ${extracted.format}`
        );

        const actualFormat = extracted.format;

        const sanitizedFilename =
          sanitizeEbookFilename(
            title,
            author,
            actualFormat
          );

        const targetPath =
          path.join(
            targetDir,
            sanitizedFilename
          );

        moduleLogger.info(
          `[MAIN] Target filename: ${sanitizedFilename}`
        );
        moduleLogger.info(
          `[MAIN] Target path: ${targetPath}`
        );

        try {
          await fs.access(targetPath);

          moduleLogger.info(
            '[MAIN] File already exists - skipping download'
          );

          return {
            success: true,
            filePath: targetPath,
            format: actualFormat,
          };
        } catch {
          moduleLogger.info(
            '[MAIN] Target file does not exist - downloading'
          );
        }

        const parsedUrl = new URL(extracted.url);

        moduleLogger.info(
          `[MAIN] Download host: ${parsedUrl.host}`
        );

        const success =
          await downloadFile(
            extracted.url,
            targetPath,
            logger
          );

        moduleLogger.info(
          `[MAIN] Download result: ${
            success ? 'SUCCESS' : 'FAILED'
          }`
        );

        if (success) {
          moduleLogger.info(
            `[MAIN] E-book successfully downloaded: ${targetPath}`
          );

          return {
            success: true,
            filePath: targetPath,
            format: actualFormat,
          };
        }

        await delay(REQUEST_DELAY_MS);
      } catch (error) {
        moduleLogger.error(
          `[MAIN] Attempt ${i + 1} exception: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`
        );

        await delay(REQUEST_DELAY_MS);
      }
    }

    moduleLogger.error(
      `[MAIN] ALL ${attemptsLimit} DOWNLOAD ATTEMPTS FAILED`
    );

    return {
      success: false,
      error:
        `All ${attemptsLimit} download attempts failed`,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    moduleLogger.error(
      `[MAIN] FATAL ERROR: ${errorMsg}`
    );

    await logger?.error(
      `E-book download error: ${errorMsg}`
    );

    return {
      success: false,
      error: errorMsg,
    };
  } finally {
    moduleLogger.info('########################################');
    moduleLogger.info('### EBOOK DOWNLOAD END');
    moduleLogger.info('########################################');
  }
}
