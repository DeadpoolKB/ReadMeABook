/**
 * Component: Download Client Settings Tab - Custom Hook
 * Documentation: documentation/settings-pages.md
 */

'use client';

import { useState } from 'react';
import { fetchWithAuth } from '@/lib/utils/api';
import type { DownloadClientSettings, TestResult } from '../../lib/types';

interface UseDownloadSettingsProps {
  downloadClient: DownloadClientSettings;
  onChange: (settings: DownloadClientSettings) => void;
  onValidationChange: (isValid: boolean) => void;
}

export function useDownloadSettings({ downloadClient, onChange, onValidationChange }: UseDownloadSettingsProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const updateField = (field: keyof DownloadClientSettings, value: string | boolean) => {
    onChange({ ...downloadClient, [field]: value });
    onValidationChange(false);
  };

  const handleTypeChange = (type: string) => {
    onChange({
      ...downloadClient,
      type,
      username: '',
      password: '',
    });
    onValidationChange(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetchWithAuth('/api/admin/settings/test-download-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: downloadClient.type,
          url: downloadClient.url,
          username: downloadClient.username,
          password: downloadClient.password,
          disableSSLVerify: downloadClient.disableSSLVerify,
          remotePathMappingEnabled: downloadClient.remotePathMappingEnabled,
          remotePath: downloadClient.remotePath,
          localPath: downloadClient.localPath,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const result: TestResult = {
          success: true,
          message: `Connected to ${downloadClient.type} (${data.version || 'version unknown'})`
        };
        setTestResult(result);
        onValidationChange(true);
        return result;
      } else {
        const result: TestResult = {
          success: false,
          message: data.error || 'Connection failed'
        };
        setTestResult(result);
        onValidationChange(false);
        return result;
      }
    } catch (error) {
      const result: TestResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to test connection'
      };
      setTestResult(result);
      onValidationChange(false);
      return result;
    } finally {
      setTesting(false);
    }
  };

  return {
    testing,
    testResult,
    updateField,
    handleTypeChange,
    testConnection,
  };
}
