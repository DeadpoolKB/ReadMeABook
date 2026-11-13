/**
 * Component: Download Settings Hook Tests
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

const downloadClient = {
  type: 'qbittorrent',
  url: 'http://host',
  username: 'user',
  password: 'pass',
  disableSSLVerify: false,
  remotePathMappingEnabled: false,
  remotePath: '',
  localPath: '',
};

describe('useDownloadSettings', () => {
  const onChange = vi.fn();
  const onValidationChange = vi.fn();

  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    onChange.mockReset();
    onValidationChange.mockReset();
  });

  it('updates fields and resets validation', async () => {
    const { useDownloadSettings } = await import('@/app/admin/settings/tabs/DownloadTab/useDownloadSettings');
    const result = renderHook(() => useDownloadSettings({ downloadClient, onChange, onValidationChange }));

    act(() => {
      result.current.updateField('url', 'http://new');
    });

    expect(onChange).toHaveBeenCalledWith({ ...downloadClient, url: 'http://new' });
    expect(onValidationChange).toHaveBeenCalledWith(false);
  });

  it('resets credentials when changing download client type', async () => {
    const { useDownloadSettings } = await import('@/app/admin/settings/tabs/DownloadTab/useDownloadSettings');
    const result = renderHook(() => useDownloadSettings({ downloadClient, onChange, onValidationChange }));

    act(() => {
      result.current.handleTypeChange('sabnzbd');
    });

    expect(onChange).toHaveBeenCalledWith({
      ...downloadClient,
      type: 'sabnzbd',
      username: '',
      password: '',
    });
    expect(onValidationChange).toHaveBeenCalledWith(false);
  });

  it('tests the download client connection successfully', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, version: '1.2.3' }),
    });

    const { useDownloadSettings } = await import('@/app/admin/settings/tabs/DownloadTab/useDownloadSettings');
    const result = renderHook(() => useDownloadSettings({ downloadClient, onChange, onValidationChange }));

    await act(async () => {
      const response = await result.current.testConnection();
      expect(response?.success).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.testResult?.message).toContain('qbittorrent');
    });
    expect(onValidationChange).toHaveBeenCalledWith(true);
  });

  it('handles download client test failures', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: 'Bad credentials' }),
    });

    const { useDownloadSettings } = await import('@/app/admin/settings/tabs/DownloadTab/useDownloadSettings');
    const result = renderHook(() => useDownloadSettings({ downloadClient, onChange, onValidationChange }));

    await act(async () => {
      const response = await result.current.testConnection();
      expect(response?.success).toBe(false);
    });

    expect(result.current.testResult?.message).toBe('Bad credentials');
    expect(onValidationChange).toHaveBeenCalledWith(false);
  });

  it('handles download client test exceptions', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('network down'));

    const { useDownloadSettings } = await import('@/app/admin/settings/tabs/DownloadTab/useDownloadSettings');
    const result = renderHook(() => useDownloadSettings({ downloadClient, onChange, onValidationChange }));

    await act(async () => {
      const response = await result.current.testConnection();
      expect(response?.success).toBe(false);
    });

    expect(result.current.testResult?.message).toBe('network down');
    expect(onValidationChange).toHaveBeenCalledWith(false);
  });
});
