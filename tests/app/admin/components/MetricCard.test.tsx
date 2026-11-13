/**
 * Component: Metric Card Tests
 * Documentation: documentation/admin-dashboard.md
 */

// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '@/app/admin/components/MetricCard';

describe('MetricCard', () => {
  it('renders title, value, and subtitle with variant styles', () => {
    const { container } = render(
      <MetricCard
        title="Errors"
        value={3}
        subtitle="Last 24h"
        variant="error"
        icon={<span>!</span>}
      />
    );

    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-red-50');
  });
});
