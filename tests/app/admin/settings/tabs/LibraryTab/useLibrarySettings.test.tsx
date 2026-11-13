/**
 * Component: Library Settings Hook Tests
 * Documentation: documentation/settings-pages.md
 */

// @vitest-environment jsdom

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithAuthMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/api', () => ({
  fetchWithAuth: fetchWithAuthMock,
}));

const renderHook = <T,>(hook: () => T) => {
  const result = { current: undefined as T };
  function Probe() {
    result.current = hook();
    return null;
  }
  render(<Probe />);
  return result;
};

const makeResponse = (body: any) => ({
  ok: true,
  json: async () => body,
});

describe('useLibrarySettings', () => {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const onValidationChange = vi.fn();

  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    onSuccess.mockReset();
    onError.mockReset();
    onValidationChange.mockReset();
  });

  it('tests Plex connection successfully and stores libraries', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        success: true,
        serverName: 'Plex Server',
        libraries: [{ id: 'lib-1', title: 'Main' }],
      })
    );

    const { useLibrarySettings } = await import('@/app/admin/settings/tabs/LibraryTab/useLibrarySettings');
    const result = renderHook(() => useLibrarySettings(onSuccess, onError, onValidationChange));

    await act(async () => {
      const ok = await result.current.testPlexConnection('http://plex', 'token');
      expect(ok).toBe(true);
    });

    expect(result.current.plexLibraries).toHaveLength(1);
    expect(result.current.plexTestResult?.success).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith('Connected to Plex Server. You can now save.');
    expect(onValidationChange).toHaveBeenCalledWith('plex', true);
  });

  it('surfaces Plex connection errors', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        success: false,
        error: 'Bad token',
      })
    );

    const { useLibrarySettings } = await import('@/app/admin/settings/tabs/LibraryTab/useLibrarySettings');
    const result = renderHook(() => useLibrarySettings(onSuccess, onError, onValidationChange));

    await act(async () => {
      const ok = await result.current.testPlexConnection('http://plex', 'token');
      expect(ok).toBe(false);
    });

    expect(result.current.plexTestResult?.message).toBe('Bad token');
    expect(onError).toHaveBeenCalledWith('Bad token');
    expect(onValidationChange).toHaveBeenCalledWith('plex', false);
  });

  it('tests Audiobookshelf connection successfully and stores libraries', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        success: true,
        libraries: [{ id: 'abs-1', name: 'ABS Main' }],
      })
    );

    const { useLibrarySettings } = await import('@/app/admin/settings/tabs/LibraryTab/useLibrarySettings');
    const result = renderHook(() => useLibrarySettings(onSuccess, onError, onValidationChange));

    await act(async () => {
      const ok = await result.current.testABSConnection('http://abs', 'token');
      expect(ok).toBe(true);
    });

    expect(result.current.absLibraries).toHaveLength(1);
    expect(result.current.absTestResult?.success).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith('Connected to Audiobookshelf. You can now save.');
    expect(onValidationChange).toHaveBeenCalledWith('audiobookshelf', true);
  });

  it('surfaces Audiobookshelf connection failures', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        success: false,
        error: 'ABS down',
      })
    );

    const { useLibrarySettings } = await import('@/app/admin/settings/tabs/LibraryTab/useLibrarySettings');
    const result = renderHook(() => useLibrarySettings(onSuccess, onError, onValidationChange));

    await act(async () => {
      const ok = await result.current.testABSConnection('http://abs', 'token');
      expect(ok).toBe(false);
    });

    expect(result.current.absTestResult?.message).toBe('ABS down');
    expect(onError).toHaveBeenCalledWith('ABS down');
    expect(onValidationChange).toHaveBeenCalledWith('audiobookshelf', false);
  });

  it('handles exceptions while testing connections', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('network down'));

    const { useLibrarySettings } = await import('@/app/admin/settings/tabs/LibraryTab/useLibrarySettings');
    const result = renderHook(() => useLibrarySettings(onSuccess, onError, onValidationChange));

    await act(async () => {
      const ok = await result.current.testPlexConnection('http://plex', 'token');
      expect(ok).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.plexTestResult?.message).toBe('network down');
    });
    expect(onValidationChange).toHaveBeenCalledWith('plex', false);
  });
});
