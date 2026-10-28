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
import { Badge, Card, InlineNotice, StatusBadge } from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminDriver } from '@/lib/admin-context';

export default function DriversPage() {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [target, setTarget] = useState<AdminDriver | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: listError, refetch } = useQuery({
    queryKey: ['admin', 'drivers', list.query],
    queryFn: ({ signal }) => admin.drivers(list.query, { signal }),
  });

  const done = () => {
    setTarget(null);
    setReason('');
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const decide = useMutation({
    mutationFn: ({ driverId, decision }: { driverId: string; decision: 'approve' | 'reject' | 'suspend' }) => {
      if (decision === 'approve') return admin.approveDriver(driverId, reason.trim() || undefined);
      if (decision === 'reject') return admin.rejectDriver(driverId, reason.trim());
      return admin.suspendDriver(driverId, reason.trim());
    },
    onSuccess: () => {
      toast.success('Driver updated.');
      done();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not update the driver.'),
  });

  const columns: Column<AdminDriver>[] = [
    {
      key: 'name',
      header: 'Driver',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{row.name}</p>
          <p className="text-xs text-ink-500">{formatPhone(row.phone)}</p>
        </div>
      ),
    },
    {
      key: 'approval',
      header: 'Approval',
      cell: (row) => <StatusBadge status={row.approvalStatus} />,
    },
    {
      key: 'presence',
      header: 'Presence',
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
          <span
            className={
              row.presence === 'OFFLINE'
                ? 'size-1.5 rounded-full bg-ink-300'
                : 'size-1.5 rounded-full bg-positive-500'
            }
            aria-hidden="true"
          />
          {row.presence.toLowerCase().replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      secondary: true,
      cell: (row) => {
        const primary = row.vehicles.find((v) => v.isPrimary) ?? row.vehicles[0];
        return primary ? (
          <div className="min-w-0">
            <p className="truncate text-xs text-ink-800">{primary.description}</p>
            <p className="font-mono text-xs text-ink-500">{primary.plateNumber}</p>
          </div>
        ) : (
          <span className="text-xs text-ink-400">none</span>
        );
      },
    },
    {
      key: 'shared',
      header: 'Shared',
      secondary: true,
      cell: (row) =>
        row.sharedRideOptIn ? <Badge tone="progress">opted in</Badge> : <span className="text-xs text-ink-400">no</span>,
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      cell: (row) =>
        row.rating.count > 0 ? (
          <span className="text-sm tabular-nums text-ink-800">
            ★ {row.rating.average}
            <span className="ml-1 text-xs text-ink-400">({row.rating.count})</span>
          </span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'trips',
      header: 'Trips',
      align: 'right',
      secondary: true,
      cell: (row) => (
        <span className="text-sm tabular-nums text-ink-800">{row.trips.completed}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setTarget(row)}>
          Review
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Drivers" description="Approve applications and manage who can drive." />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search name, phone or licence"
        filters={[
          {
            key: 'approvalStatus',
            label: 'Approval',
            value: list.filters.approvalStatus,
            onChange: (value) => list.setFilter('approvalStatus', value),
            options: [
              { value: 'PENDING', label: 'Pending' },
              { value: 'UNDER_REVIEW', label: 'Under review' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'SUSPENDED', label: 'Suspended' },
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
            error={listError}
            onRetry={() => void refetch()}
            emptyTitle="No drivers match"
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
                  <p className="truncate font-medium text-ink-900">{row.name}</p>
                  <p className="text-xs text-ink-500">{formatPhone(row.phone)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <StatusBadge status={row.approvalStatus} />
                    {row.sharedRideOptIn && <Badge tone="progress">shared</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setTarget(row)}>
                  Review
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
          setError(null);
        }}
        title={target?.name ?? 'Driver'}
        description={target ? formatPhone(target.phone) : undefined}
      >
        {target && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={target.approvalStatus} />
              <Badge tone="neutral">{target.presence.toLowerCase().replace('_', ' ')}</Badge>
              {target.sharedRideOptIn && <Badge tone="progress">shared rides</Badge>}
            </div>

            {target.rejectionReason && (
              <InlineNotice tone="warning">
                Previous decision: {target.rejectionReason}
              </InlineNotice>
            )}

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Licence" value={target.licence.number} />
              <Detail label="Licence expires" value={dateTime(target.licence.expiresAt)} />
              <Detail label="Completed trips" value={String(target.trips.completed)} />
              <Detail label="Cancelled trips" value={String(target.trips.cancelled)} />
              <Detail
                label="Rating"
                value={target.rating.count > 0 ? `★ ${target.rating.average} (${target.rating.count})` : 'none yet'}
              />
              <Detail label="Documents" value={String(target.documentCount)} />
              <Detail label="Joined" value={dateTime(target.joinedAt)} />
              <Detail
                label="Last seen"
                value={target.lastSeenAt ? relativeTime(target.lastSeenAt) : 'never'}
              />
            </dl>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-700">Vehicles</p>
              {target.vehicles.length === 0 ? (
                <p className="text-sm text-ink-400">No vehicle registered.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {target.vehicles.map((vehicle) => (
                    <li
                      key={vehicle.plateNumber}
                      className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-ink-50 px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink-800">
                          {vehicle.description}
                        </span>
                        <span className="block font-mono text-xs text-ink-500">
                          {vehicle.plateNumber} · {vehicle.type}
                        </span>
                      </span>
                      <StatusBadge status={vehicle.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {target.documentCount === 0 && (
              <InlineNotice tone="warning">
                This driver has uploaded no documents. Document review is not available in the
                console yet — check them another way before approving.
              </InlineNotice>
            )}

            <TextAreaField
              label="Reason"
              hint="Required to reject or suspend. Recorded in the audit log."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            {error && <InlineNotice tone="danger">{error}</InlineNotice>}

            <div className="flex flex-col gap-2 sm:flex-row">
              {target.approvalStatus !== 'APPROVED' && (
                <Button
                  fullWidth
                  loading={decide.isPending}
                  onClick={() => decide.mutate({ driverId: target.id, decision: 'approve' })}
                >
                  Approve
                </Button>
              )}
              {target.approvalStatus === 'APPROVED' ? (
                <Button
                  variant="danger"
                  fullWidth
                  disabled={!reason.trim()}
                  loading={decide.isPending}
                  onClick={() => decide.mutate({ driverId: target.id, decision: 'suspend' })}
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={!reason.trim()}
                  loading={decide.isPending}
                  onClick={() => decide.mutate({ driverId: target.id, decision: 'reject' })}
                >
                  Reject
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-sm text-ink-900">{value}</dd>
    </div>
  );
}
