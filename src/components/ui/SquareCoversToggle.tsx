/**
 * Component: Square Covers Toggle
 * Documentation: UI toggle for switching between square (1:1) and rectangle (2:3) cover aspect ratios
 */

'use client';

import React from 'react';

interface SquareCoversToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function SquareCoversToggle({ enabled, onToggle }: SquareCoversToggleProps) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      aria-label={enabled ? 'Switch to rectangular covers' : 'Switch to square covers'}
      aria-pressed={enabled}
      title={enabled ? 'Square covers (on)' : 'Square covers (off)'}
      className={`
        p-1.5 rounded-md transition-all duration-200
        ${enabled
          ? 'bg-blue-500/20 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30 dark:ring-blue-400/30 shadow-inner'
          : 'text-gray-600 dark:text-gray-400 hover:bg-white/20 dark:hover:bg-gray-700/50'
        }
      `}
    >
      {/* Crop/aspect ratio icon */}
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Square frame representing crop to 1:1 */}
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="2"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Inner crop marks suggesting aspect ratio change */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 9h4M3 15h4M21 9h-4M21 15h-4"
          opacity={enabled ? 1 : 0.4}
        />
      </svg>
    </button>
  );
}
