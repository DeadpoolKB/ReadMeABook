/**
 * Component: Auth Settings Hook Tests
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

const makeResponse = (body: any, ok = true) => ({
  ok,
  json: async () => body,
});

describe('useAuthSettings', () => {
  const onSuccess = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    onSuccess.mockReset();
    onError.mockReset();
  });

  it('fetches pending users successfully', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({ users: [{ id: 'u1', plexUsername: 'Pending' }] })
    );

    const { useAuthSettings } = await import('@/app/admin/settings/tabs/AuthTab/useAuthSettings');
    const result = renderHook(() => useAuthSettings({ onSuccess, onError }));

    await act(async () => {
      await result.current.fetchPendingUsers();
    });

    expect(result.current.pendingUsers).toHaveLength(1);
    expect(result.current.loadingPendingUsers).toBe(false);
  });

  it('tests OIDC configuration successfully', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ success: true }));

    const { useAuthSettings } = await import('@/app/admin/settings/tabs/AuthTab/useAuthSettings');
    const result = renderHook(() => useAuthSettings({ onSuccess, onError }));

    await act(async () => {
      const ok = await result.current.testOIDCConnection('issuer', 'client', 'secret');
      expect(ok).toBe(true);
    });

    expect(result.current.oidcTestResult?.success).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith('OIDC configuration is valid. You can now save.');
  });

  it('surfaces OIDC validation errors', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ success: false, error: 'Bad issuer' }));

    const { useAuthSettings } = await import('@/app/admin/settings/tabs/AuthTab/useAuthSettings');
    const result = renderHook(() => useAuthSettings({ onSuccess, onError }));

    await act(async () => {
      const ok = await result.current.testOIDCConnection('issuer', 'client', 'secret');
      expect(ok).toBe(false);
    });

    expect(result.current.oidcTestResult?.message).toBe('Bad issuer');
    expect(onError).toHaveBeenCalledWith('Bad issuer');
  });

  it('approves a pending user and refreshes the list', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeResponse({ success: true, message: 'Approved' }))
      .mockResolvedValueOnce(makeResponse({ users: [] }));

    const { useAuthSettings } = await import('@/app/admin/settings/tabs/AuthTab/useAuthSettings');
    const result = renderHook(() => useAuthSettings({ onSuccess, onError }));

    await act(async () => {
      await result.current.approveUser('u1', true);
    });

    expect(onSuccess).toHaveBeenCalledWith('Approved');
    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/admin/users/u1/approve', expect.any(Object));
    expect(result.current.pendingUsers).toHaveLength(0);
  });

  it('surfaces approval failures', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ success: false, error: 'Nope' }));

    const { useAuthSettings } = await import('@/app/admin/settings/tabs/AuthTab/useAuthSettings');
    const result = renderHook(() => useAuthSettings({ onSuccess, onError }));

    await act(async () => {
      await result.current.approveUser('u2', false);
    });

    expect(onError).toHaveBeenCalledWith('Nope');
  });

  it('handles pending user fetch errors gracefully', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({}, false));

    const { useAuthSettings } = await import('@/app/admin/settings/tabs/AuthTab/useAuthSettings');
    const result = renderHook(() => useAuthSettings({ onSuccess, onError }));

    await act(async () => {
      await result.current.fetchPendingUsers();
    });

    await waitFor(() => {
      expect(result.current.loadingPendingUsers).toBe(false);
    });
  });
});
