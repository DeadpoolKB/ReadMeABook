// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EbookTab } from '@/app/admin/settings/tabs/EbookTab/EbookTab';

const useEbookSettingsMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/admin/settings/tabs/EbookTab/useEbookSettings', () => ({
  useEbookSettings: useEbookSettingsMock,
}));

describe('EbookTab additional source configuration', () => {
  beforeEach(() => {
    useEbookSettingsMock.mockImplementation(({ ebook, onChange }) => ({
      saving: false,
      testingFlaresolverr: false,
      flaresolverrTestResult: null,
      updateEbook: (field: string, value: unknown) => onChange({ ...ebook, [field]: value }),
      testFlaresolverrConnection: vi.fn(),
      saveSettings: vi.fn(),
      isAnySourceEnabled: false,
    }));
  });

  it('lets admins add a generic provider configuration', () => {
    const onChange = vi.fn();
    render(
      <EbookTab
        ebook={{
          annasArchiveEnabled: false,
          indexerSearchEnabled: false,
          baseUrl: 'https://annas-archive.gl',
          flaresolverrUrl: '',
          preferredFormat: 'epub',
          autoGrabEnabled: true,
          kindleFixEnabled: false,
          additionalSources: [],
        }}
        onChange={onChange}
        onSuccess={vi.fn()}
        onError={vi.fn()}
        markAsSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add source configuration' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      additionalSources: [
        expect.objectContaining({
          name: 'New ebook source',
          mirrorUrls: [],
          preferredMirror: '',
          settings: {},
        }),
      ],
    }));
  });
});
