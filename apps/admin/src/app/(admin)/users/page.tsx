'use client';

import { dateTime, phone as formatPhone, relativeTime } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Badge, Card, StatusBadge } from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminUser } from '@/lib/admin-context';

export default function UsersPage() {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'users', list.query],
    queryFn: ({ signal }) => admin.users(list.query, { signal }),
  });

  const setStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) =>
      admin.setUserStatus(userId, { status, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success('Account updated.');
      setTarget(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (caught) =>
      toast.error(caught instanceof Error ? caught.message : 'Could not update the account.'),
  });

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{row.name || '—'}</p>
          <p className="text-xs text-ink-500">{formatPhone(row.phone)}</p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.map((role) => (
            <Badge key={role} tone={role === 'ADMIN' ? 'progress' : 'neutral'}>
              {role.toLowerCase()}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'activity',
      header: 'Activity',
      secondary: true,
      cell: (row) => (
        <span className="text-xs text-ink-600">
          {row.activity.rides} rides · {row.activity.foodOrders} food · {row.activity.parcels} parcels
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last seen',
      secondary: true,
      cell: (row) => (
        <span className="text-xs text-ink-500">
          {row.lastLoginAt ? relativeTime(row.lastLoginAt) : 'never'}
        </span>
      ),
    },
    { key: 'joined', header: 'Joined', secondary: true, cell: (row) => <span className="text-xs text-ink-500">{dateTime(row.joinedAt)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setTarget(row)}>
          Manage
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Users" description="Customers and staff on the platform." />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search name or phone"
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status,
            onChange: (value) => list.setFilter('status', value),
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'SUSPENDED', label: 'Suspended' },
              { value: 'DEACTIVATED', label: 'Deactivated' },
            ],
          },
        ]}
      />

      <div className="p-4 sm:p-6">
        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={data?.items}
            rowKey={(row) => row.id}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            emptyTitle="No users match"
            pagination={
              data
                ? {
                    page: data.page,
                    totalPages: data.totalPages,
                    total: data.total,
                    onPageChange: list.setPage,
                  }
                : undefined
            }
            mobileCard={(row) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{row.name || '—'}</p>
                  <p className="text-xs text-ink-500">{formatPhone(row.phone)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <StatusBadge status={row.status} />
                    {row.roles.map((role) => (
                      <Badge key={role} tone="neutral">
                        {role.toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setTarget(row)}>
                  Manage
                </Button>
              </div>
            )}
          />
        </Card>
      </div>

      <Modal
        open={Boolean(target)}
        onClose={() => {
          setTarget(null);
          setReason('');
        }}
        title={target?.name || 'Account'}
        description={target ? formatPhone(target.phone) : undefined}
        size="sm"
      >
        {target && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={target.status} />
              {target.roles.map((role) => (
                <Badge key={role} tone="neutral">
                  {role.toLowerCase()}
                </Badge>
              ))}
            </div>

            <p className="text-sm text-ink-600">
              {target.activity.rides} rides, {target.activity.foodOrders} food orders and{' '}
              {target.activity.parcels} parcels. Joined {dateTime(target.joinedAt)}.
            </p>

            <TextAreaField
              label="Reason"
              hint="Recorded in the audit log."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <div className="flex flex-col gap-2">
              {target.status !== 'ACTIVE' && (
                <Button
                  fullWidth
                  loading={setStatus.isPending}
                  onClick={() => setStatus.mutate({ userId: target.id, status: 'ACTIVE' })}
                >
                  Reactivate account
                </Button>
              )}
              {target.status === 'ACTIVE' && (
                <Button
                  variant="danger"
                  fullWidth
                  loading={setStatus.isPending}
                  onClick={() => setStatus.mutate({ userId: target.id, status: 'SUSPENDED' })}
                >
                  Suspend account
                </Button>
              )}
              <p className="text-xs text-ink-500">
                Suspending ends every active session for this account immediately.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
