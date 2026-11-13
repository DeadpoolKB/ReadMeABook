/**
 * Component: Available Indexer Row
 * Documentation: documentation/frontend/components.md
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';

interface AvailableIndexerRowProps {
  indexer: {
    id: number;
    name: string;
    protocol: string;
    supportsRss: boolean;
  };
  isAdded: boolean;
  onAdd: () => void;
}

export function AvailableIndexerRow({
  indexer,
  isAdded,
  onAdd,
}: AvailableIndexerRowProps) {
  return (
    <div
      className={`flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
        isAdded ? 'opacity-60' : ''
      }`}
    >
      {/* Indexer Info */}
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {indexer.name}
            </span>
            <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              {indexer.protocol}
            </span>
          </div>
        </div>
      </div>

      {/* Action */}
      <div>
        {isAdded ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <svg
              className="w-4 h-4 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Added
            </span>
          </div>
        ) : (
          <Button onClick={onAdd} variant="primary" size="sm">
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
