/**
 * Component: AuthTab - Manual Registration Section
 * Documentation: documentation/settings-pages.md
 */

import type { RegistrationSettings } from '../../lib/types';

interface RegistrationSectionProps {
  settings: RegistrationSettings;
  onChange: (settings: RegistrationSettings) => void;
}

export function RegistrationSection({ settings, onChange }: RegistrationSectionProps) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Manual Registration
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Configure manual user registration settings.
      </p>

      <div className="space-y-4">
        {/* Enable Registration Toggle */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4">
            <input
              type="checkbox"
              id="registration-enabled"
              checked={settings.enabled}
              onChange={(e) => {
                onChange({ ...settings, enabled: e.target.checked });
              }}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label
                htmlFor="registration-enabled"
                className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Enable Manual Registration
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Allow users to create accounts manually with username/password
              </p>
            </div>
          </div>
        </div>

        {/* Require Admin Approval Toggle */}
        {settings.enabled && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                id="require-approval"
                checked={settings.requireAdminApproval}
                onChange={(e) => {
                  onChange({ ...settings, requireAdminApproval: e.target.checked });
                }}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <label
                  htmlFor="require-approval"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  Require Admin Approval
                </label>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  New users must be approved by an admin before they can log in
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
