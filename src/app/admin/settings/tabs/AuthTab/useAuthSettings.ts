/**
 * Component: AuthTab - Custom Hook
 * Documentation: documentation/settings-pages.md
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/utils/api';
import type { PendingUser, TestResult } from '../../lib/types';

interface UseAuthSettingsProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function useAuthSettings({ onSuccess, onError }: UseAuthSettingsProps) {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loadingPendingUsers, setLoadingPendingUsers] = useState(false);
  const [testing, setTesting] = useState(false);
  const [oidcTestResult, setOidcTestResult] = useState<TestResult | null>(null);

  /**
   * Fetch pending users awaiting approval
   */
  const fetchPendingUsers = useCallback(async () => {
    setLoadingPendingUsers(true);
    try {
      const response = await fetchWithAuth('/api/admin/users/pending');
      if (response.ok) {
        const data = await response.json();
        setPendingUsers(data.users || []);
      } else {
        console.error('Failed to fetch pending users:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch pending users:', error);
    } finally {
      setLoadingPendingUsers(false);
    }
  }, []);

  /**
   * Test OIDC connection configuration
   */
  const testOIDCConnection = useCallback(async (issuerUrl: string, clientId: string, clientSecret: string) => {
    setTesting(true);
    setOidcTestResult(null);

    try {
      const response = await fetchWithAuth('/api/setup/test-oidc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issuerUrl,
          clientId,
          clientSecret,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setOidcTestResult({ success: true, message: 'OIDC configuration is valid' });
        onSuccess('OIDC configuration is valid. You can now save.');
        return true;
      } else {
        setOidcTestResult({ success: false, message: data.error || 'Connection failed' });
        onError(data.error || 'Failed to validate OIDC configuration');
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to test OIDC connection';
      setOidcTestResult({ success: false, message: errorMsg });
      onError(errorMsg);
      return false;
    } finally {
      setTesting(false);
    }
  }, [onSuccess, onError]);

  /**
   * Approve or reject a pending user
   */
  const approveUser = useCallback(async (userId: string, approve: boolean) => {
    try {
      const response = await fetchWithAuth(`/api/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess(data.message);
        // Refresh pending users list
        await fetchPendingUsers();
      } else {
        onError(data.error || 'Failed to process user approval');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to process user approval');
    }
  }, [onSuccess, onError, fetchPendingUsers]);

  return {
    pendingUsers,
    loadingPendingUsers,
    testing,
    oidcTestResult,
    fetchPendingUsers,
    testOIDCConnection,
    approveUser,
  };
}
