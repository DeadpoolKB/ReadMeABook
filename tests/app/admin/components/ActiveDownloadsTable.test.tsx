/**
 * Component: Active Downloads Table Tests
 * Documentation: documentation/admin-dashboard.md
 */

// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActiveDownloadsTable } from '@/app/admin/components/ActiveDownloadsTable';

describe('ActiveDownloadsTable', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an empty state when no downloads exist', () => {
    render(<ActiveDownloadsTable downloads={[]} />);

    expect(screen.getByText('No Active Downloads')).toBeInTheDocument();
  });

  it('renders download details with formatted values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    render(
      <ActiveDownloadsTable
        downloads={[
          {
            requestId: 'req-1',
            title: 'Active Book',
            author: 'Author One',
            progress: 42,
            speed: 1024 * 1024,
            eta: 3600,
            user: 'Zach',
            startedAt: new Date('2023-12-31T23:00:00Z'),
          },
        ]}
      />
    );

    expect(screen.getByText('Active Book')).toBeInTheDocument();
    expect(screen.getByText('Author One')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('1 MB/s')).toBeInTheDocument();
    expect(screen.getByText('1h 0m')).toBeInTheDocument();
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });
});
