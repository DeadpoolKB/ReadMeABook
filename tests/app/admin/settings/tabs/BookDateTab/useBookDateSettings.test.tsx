/**
 * Component: BookDate Settings Hook Tests
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

const makeResponse = (body: any, ok = true) => ({
  ok,
  json: async () => body,
});

const renderHook = <T,>(hook: () => T) => {
  const result = { current: undefined as T };
  function Probe() {
    result.current = hook();
    return null;
  }
  render(<Probe />);
  return result;
};

describe('useBookDateSettings', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('loads BookDate config on mount', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({
      config: {
        provider: 'claude',
        model: 'claude-3',
        baseUrl: 'http://custom',
        isEnabled: false,
        isVerified: true,
      },
    }));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(result.current.provider).toBe('claude'));

    expect(result.current.model).toBe('claude-3');
    expect(result.current.baseUrl).toBe('http://custom');
    expect(result.current.enabled).toBe(false);
    expect(result.current.configured).toBe(true);
  });

  it('validates missing API key for non-custom providers', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ config: {} }));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    const onSuccess = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      await result.current.testConnection(onSuccess, onError);
    });

    expect(onError).toHaveBeenCalledWith('Please enter an API key');
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
  });

  it('validates missing base URL for custom providers', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ config: {} }));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setProvider('custom');
    });

    const onError = vi.fn();

    await act(async () => {
      await result.current.testConnection(vi.fn(), onError);
    });

    expect(onError).toHaveBeenCalledWith('Please enter a base URL for custom provider');
  });

  it('tests connection with saved key and auto-selects the first model', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeResponse({
        config: {
          provider: 'openai',
          model: '',
          baseUrl: '',
          isEnabled: true,
          isVerified: true,
        },
      }))
      .mockResolvedValueOnce(makeResponse({
        models: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }],
      }));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(result.current.configured).toBe(true));

    const onSuccess = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      await result.current.testConnection(onSuccess, onError);
    });

    const requestBody = JSON.parse((fetchWithAuthMock.mock.calls[1][1] as RequestInit).body as string);
    expect(requestBody.useSavedKey).toBe(true);
    expect(requestBody.provider).toBe('openai');
    expect(result.current.models).toHaveLength(2);
    expect(result.current.model).toBe('gpt-4');
    expect(onSuccess).toHaveBeenCalledWith('Connection successful! Please select a model.');
  });

  it('surfaces connection test errors', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeResponse({ config: {} }))
      .mockResolvedValueOnce(makeResponse({ error: 'Bad key' }, false));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setApiKey('key');
    });

    const onError = vi.fn();

    await act(async () => {
      await result.current.testConnection(vi.fn(), onError);
    });

    expect(onError).toHaveBeenCalledWith('Bad key');
  });

  it('validates missing model before saving', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ config: {} }));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    const onError = vi.fn();

    await act(async () => {
      await result.current.saveConfig(vi.fn(), onError);
    });

    expect(onError).toHaveBeenCalledWith('Please select a model');
  });

  it('validates custom base URL before saving', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ config: {} }));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setProvider('custom');
      result.current.setModel('custom-model');
    });

    const onError = vi.fn();

    await act(async () => {
      await result.current.saveConfig(vi.fn(), onError);
    });

    expect(onError).toHaveBeenCalledWith('Please enter a base URL for custom provider');
  });

  it('validates API key for initial setup before saving', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ config: {} }));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setModel('gpt-4');
    });

    const onError = vi.fn();

    await act(async () => {
      await result.current.saveConfig(vi.fn(), onError);
    });

    expect(onError).toHaveBeenCalledWith('Please enter an API key for initial setup');
  });

  it('saves configuration and clears API key', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeResponse({ config: {} }))
      .mockResolvedValueOnce(makeResponse({}));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setModel('gpt-4');
      result.current.setApiKey('secret');
      result.current.setEnabled(false);
    });

    const onSuccess = vi.fn();

    await act(async () => {
      await result.current.saveConfig(onSuccess, vi.fn());
    });

    expect(onSuccess).toHaveBeenCalledWith('BookDate configuration saved successfully!');
    expect(result.current.configured).toBe(true);
    expect(result.current.apiKey).toBe('');
  });

  it('surfaces save errors', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeResponse({ config: {} }))
      .mockResolvedValueOnce(makeResponse({ error: 'Save failed' }, false));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setModel('gpt-4');
      result.current.setApiKey('secret');
    });

    const onError = vi.fn();

    await act(async () => {
      await result.current.saveConfig(vi.fn(), onError);
    });

    expect(onError).toHaveBeenCalledWith('Save failed');
  });

  it('skips clearing swipes when confirmation is canceled', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ config: {} }));
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.clearSwipes(vi.fn(), vi.fn());
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
  });

  it('clears swipes after confirmation', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeResponse({ config: {} }))
      .mockResolvedValueOnce(makeResponse({}));
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    const onSuccess = vi.fn();

    await act(async () => {
      await result.current.clearSwipes(onSuccess, vi.fn());
    });

    expect(onSuccess).toHaveBeenCalledWith('Swipe history cleared successfully!');
  });

  it('reports errors when clearing swipes fails', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeResponse({ config: {} }))
      .mockResolvedValueOnce(makeResponse({ error: 'Clear failed' }, false));
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    const { useBookDateSettings } = await import('@/app/admin/settings/tabs/BookDateTab/useBookDateSettings');
    const result = renderHook(() => useBookDateSettings());

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));

    const onError = vi.fn();

    await act(async () => {
      await result.current.clearSwipes(vi.fn(), onError);
    });

    expect(onError).toHaveBeenCalledWith('Clear failed');
  });
});
