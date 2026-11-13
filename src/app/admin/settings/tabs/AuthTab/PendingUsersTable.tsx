/**
 * Component: AuthTab - Pending Users Table
 * Documentation: documentation/settings-pages.md
 */

import { Button } from '@/components/ui/Button';
import type { PendingUser } from '../../lib/types';

interface PendingUsersTableProps {
  pendingUsers: PendingUser[];
  loading: boolean;
  onApprove: (userId: string, approve: boolean) => void;
}

export function PendingUsersTable({ pendingUsers, loading, onApprove }: PendingUsersTableProps) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Pending User Approvals
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Review and approve or reject user registration requests.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-sm text-gray-500">Loading pending users...</span>
        </div>
      ) : pendingUsers.length > 0 ? (
        <div className="space-y-4">
          {pendingUsers.map((user) => (
            <div
              key={user.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {user.plexUsername}
                  </h3>
                  {user.plexEmail && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {user.plexEmail}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Registered: {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => onApprove(user.id, true)}
                    variant="outline"
                    className="border-green-300 text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => onApprove(user.id, false)}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">
            No pending user approvals
          </p>
        </div>
      )}
    </div>
  );
}
