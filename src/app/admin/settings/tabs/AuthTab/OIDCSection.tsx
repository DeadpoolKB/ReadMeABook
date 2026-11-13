/**
 * Component: AuthTab - OIDC Configuration Section
 * Documentation: documentation/settings-pages.md
 */

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { OIDCSettings, TestResult } from '../../lib/types';

interface OIDCSectionProps {
  settings: OIDCSettings;
  onChange: (settings: OIDCSettings) => void;
  onTest: (issuerUrl: string, clientId: string, clientSecret: string) => Promise<boolean>;
  testing: boolean;
  testResult: TestResult | null;
  onValidationChange: () => void;
}

export function OIDCSection({
  settings,
  onChange,
  onTest,
  testing,
  testResult,
  onValidationChange
}: OIDCSectionProps) {
  const handleTestConnection = async () => {
    const isValid = await onTest(settings.issuerUrl, settings.clientId, settings.clientSecret);
    if (isValid) {
      onValidationChange();
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        OIDC Authentication
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Configure OpenID Connect (OIDC) authentication for single sign-on with Authentik, Keycloak, or other providers.
      </p>

      <div className="space-y-4">
        {/* Enable OIDC Toggle */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4">
            <input
              type="checkbox"
              id="oidc-enabled"
              checked={settings.enabled}
              onChange={(e) => {
                onChange({ ...settings, enabled: e.target.checked });
              }}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label
                htmlFor="oidc-enabled"
                className="block text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Enable OIDC Authentication
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Allow users to log in using an external OIDC provider
              </p>
            </div>
          </div>
        </div>

        {settings.enabled && (
          <>
            {/* Provider Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Provider Name
              </label>
              <Input
                type="text"
                value={settings.providerName}
                onChange={(e) => {
                  onChange({ ...settings, providerName: e.target.value });
                }}
                placeholder="Authentik"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Display name for the login button
              </p>
            </div>

            {/* Issuer URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Issuer URL
              </label>
              <Input
                type="url"
                value={settings.issuerUrl}
                onChange={(e) => {
                  onChange({ ...settings, issuerUrl: e.target.value });
                }}
                placeholder="https://auth.example.com/application/o/readmeabook/"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                OIDC provider's issuer URL (must support .well-known/openid-configuration)
              </p>
            </div>

            {/* Client ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Client ID
              </label>
              <Input
                type="text"
                value={settings.clientId}
                onChange={(e) => {
                  onChange({ ...settings, clientId: e.target.value });
                }}
                placeholder="readmeabook-client"
              />
            </div>

            {/* Client Secret */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Client Secret
              </label>
              <Input
                type="password"
                value={settings.clientSecret}
                onChange={(e) => {
                  onChange({ ...settings, clientSecret: e.target.value });
                }}
                placeholder="Enter client secret"
              />
            </div>

            {/* Test Connection Button */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <Button
                onClick={handleTestConnection}
                loading={testing}
                disabled={!settings.issuerUrl || !settings.clientId || !settings.clientSecret}
                variant="outline"
                className="w-full"
              >
                Test OIDC Configuration
              </Button>
              {testResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  testResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                }`}>
                  {testResult.message}
                </div>
              )}
            </div>

            {/* Access Control Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Access Control
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Control who can log in to your application. This is separate from admin permissions.
              </p>

              <div className="space-y-4">
                {/* Access Control Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Access Control Method
                  </label>
                  <select
                    value={settings.accessControlMethod}
                    onChange={(e) => {
                      onChange({ ...settings, accessControlMethod: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="open">Open Access (anyone can log in)</option>
                    <option value="group_claim">Group/Claim Based</option>
                    <option value="allowed_list">Allowed List (emails/usernames)</option>
                    <option value="admin_approval">Admin Approval Required</option>
                  </select>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {settings.accessControlMethod === 'open' && 'Anyone who can authenticate with your OIDC provider will have access'}
                    {settings.accessControlMethod === 'group_claim' && 'Only users with a specific group/claim can access'}
                    {settings.accessControlMethod === 'allowed_list' && 'Only explicitly allowed users can access'}
                    {settings.accessControlMethod === 'admin_approval' && 'New users must be approved by an admin before access is granted'}
                  </p>
                </div>

                {/* Group/Claim Based Controls */}
                {settings.accessControlMethod === 'group_claim' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Group Claim Name
                      </label>
                      <Input
                        type="text"
                        value={settings.accessGroupClaim}
                        onChange={(e) => {
                          onChange({ ...settings, accessGroupClaim: e.target.value });
                        }}
                        placeholder="groups"
                      />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        The OIDC claim field that contains group membership (usually "groups" or "roles")
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Required Group
                      </label>
                      <Input
                        type="text"
                        value={settings.accessGroupValue}
                        onChange={(e) => {
                          onChange({ ...settings, accessGroupValue: e.target.value });
                        }}
                        placeholder="readmeabook-users"
                      />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Users must be in this group to access the application
                      </p>
                    </div>
                  </>
                )}

                {/* Allowed List Controls */}
                {settings.accessControlMethod === 'allowed_list' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Allowed Emails (comma-separated)
                      </label>
                      <Input
                        type="text"
                        value={settings.allowedEmails}
                        onChange={(e) => {
                          onChange({ ...settings, allowedEmails: e.target.value });
                        }}
                        placeholder="user1@example.com, user2@example.com"
                      />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Enter email addresses separated by commas
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Allowed Usernames (comma-separated)
                      </label>
                      <Input
                        type="text"
                        value={settings.allowedUsernames}
                        onChange={(e) => {
                          onChange({ ...settings, allowedUsernames: e.target.value });
                        }}
                        placeholder="john_doe, jane_smith"
                      />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Enter usernames separated by commas
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Admin Role Mapping Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Admin Role Mapping
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Automatically grant admin permissions based on OIDC claims (e.g., group membership). The first user will always become admin.
              </p>

              <div className="space-y-4">
                {/* Enable Admin Claim Mapping */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="admin-claim-enabled"
                    checked={settings.adminClaimEnabled}
                    onChange={(e) => {
                      onChange({ ...settings, adminClaimEnabled: e.target.checked });
                    }}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="admin-claim-enabled"
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      Enable Admin Role Mapping
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Automatically grant admin role to users with specific OIDC claim values
                    </p>
                  </div>
                </div>

                {settings.adminClaimEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Admin Claim Name
                      </label>
                      <Input
                        type="text"
                        value={settings.adminClaimName}
                        onChange={(e) => {
                          onChange({ ...settings, adminClaimName: e.target.value });
                        }}
                        placeholder="groups"
                      />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        The OIDC claim field to check for admin role (usually "groups" or "roles")
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Admin Claim Value
                      </label>
                      <Input
                        type="text"
                        value={settings.adminClaimValue}
                        onChange={(e) => {
                          onChange({ ...settings, adminClaimValue: e.target.value });
                        }}
                        placeholder="readmeabook-admin"
                      />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Users with this value in their claim will be granted admin role
                      </p>
                    </div>

                    {/* Example Configuration */}
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                      <div className="flex gap-3">
                        <svg
                          className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            Example Configuration
                          </p>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            In Authentik: Create a group called "readmeabook-admin", add users to it, and set "Admin Claim Value" to "readmeabook-admin"
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
