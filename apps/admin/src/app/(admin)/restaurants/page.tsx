'use client';

import { dateTime, money } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Badge, Card, StatusBadge } from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminRestaurant } from '@/lib/admin-context';

export default function RestaurantsPage() {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [target, setTarget] = useState<AdminRestaurant | null>(null);
  const [status, setStatus] = useState('ACTIVE');
  const [reason, setReason] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'restaurants', list.query],
    queryFn: ({ signal }) => admin.restaurants(list.query, { signal }),
  });

  const update = useMutation({
    mutationFn: () =>
      admin.setRestaurantStatus(target!.id, { status, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success('Restaurant updated.');
      setTarget(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (caught) =>
      toast.error(caught instanceof Error ? caught.message : 'Could not update the restaurant.'),
  });

  const columns: Column<AdminRestaurant>[] = [
    {
      key: 'name',
      header: 'Restaurant',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{row.name}</p>
          <p className="truncate text-xs text-ink-500">{row.address}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'accepting',
      header: 'Taking orders',
      cell: (row) =>
        row.isAcceptingOrders ? (
          <Badge tone="success">open</Badge>
        ) : (
          <Badge tone="neutral">closed</Badge>
        ),
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      cell: (row) => <span className="text-sm tabular-nums text-ink-800">{row.commissionPct}%</span>,
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      secondary: true,
      cell: (row) => <span className="text-sm tabular-nums text-ink-700">{row.orders}</span>,
    },
    {
      key: 'menu',
      header: 'Menu',
      align: 'right',
      secondary: true,
      cell: (row) => <span className="text-sm tabular-nums text-ink-700">{row.menuItems}</span>,
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      secondary: true,
      cell: (row) =>
        row.rating.count > 0 ? (
          <span className="text-sm text-ink-800">★ {row.rating.average}</span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setTarget(row);
            setStatus(row.status);
          }}
        >
          Manage
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Restaurants" description="Approve and manage restaurant partners." />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search restaurants"
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
            emptyTitle="No restaurants match"
            pagination={
              data
                ? { page: data.page, totalPages: data.totalPages, total: data.total, onPageChange: list.setPage }
                : undefined
            }
            mobileCard={(row) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{row.name}</p>
                  <p className="truncate text-xs text-ink-500">{row.address}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <StatusBadge status={row.status} />
                    {row.isAcceptingOrders && <Badge tone="success">open</Badge>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setTarget(row);
                    setStatus(row.status);
                  }}
                >
                  Manage
                </Button>
              </div>
            )}
          />
        </Card>
      </div>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target?.name ?? 'Restaurant'}
        description={target?.address}
        size="sm"
      >
        {target && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Commission</dt>
                <dd className="text-ink-900">{target.commissionPct}%</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Orders</dt>
                <dd className="text-ink-900">{target.orders}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Menu items</dt>
                <dd className="text-ink-900">{target.menuItems}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Joined</dt>
                <dd className="text-ink-900">{dateTime(target.joinedAt)}</dd>
              </div>
            </dl>

            <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CLOSED">Closed</option>
            </SelectField>

            <TextAreaField
              label="Reason"
              hint="Recorded in the audit log."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <p className="text-xs text-ink-500">
              Anything other than Active also stops the restaurant taking new orders.
            </p>

            <Button fullWidth loading={update.isPending} onClick={() => update.mutate()}>
              Save
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
