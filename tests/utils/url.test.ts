/**
 * Component: URL Utilities Tests
 * Documentation: documentation/backend/services/environment.md
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBaseUrl, getCallbackUrl } from '@/lib/utils/url';

const envBackup = { ...process.env };

describe('URL utilities', () => {
  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('prefers PUBLIC_URL and trims trailing slashes', () => {
    process.env.PUBLIC_URL = 'https://example.com/';
    process.env.NEXTAUTH_URL = 'https://next.example.com';
    process.env.BASE_URL = 'https://base.example.com';

    const url = getBaseUrl();

    expect(url).toBe('https://example.com');
  });

  it('falls back to NEXTAUTH_URL when PUBLIC_URL is not set', () => {
    delete process.env.PUBLIC_URL;
    process.env.NEXTAUTH_URL = 'https://next.example.com/';

    const url = getBaseUrl();

    expect(url).toBe('https://next.example.com');
  });

  it('uses BASE_URL and keeps invalid scheme values', () => {
    delete process.env.PUBLIC_URL;
    delete process.env.NEXTAUTH_URL;
    process.env.BASE_URL = 'example.com/';

    const url = getBaseUrl();

    expect(url).toBe('example.com');
  });

  it('defaults to localhost in production when no env vars are set', () => {
    delete process.env.PUBLIC_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.BASE_URL;
    process.env.NODE_ENV = 'production';

    const url = getBaseUrl();

    expect(url).toBe('http://localhost:3030');
  });

  it('builds callback URLs with normalized paths', () => {
    process.env.PUBLIC_URL = 'https://example.com';

    const url = getCallbackUrl('api/auth/oidc/callback');

    expect(url).toBe('https://example.com/api/auth/oidc/callback');
  });
});
