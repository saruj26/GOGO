'use client';

import { RIDE_STATUS_LABEL, dateTime, distance, money, type RideStatus } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Card, SharedBadge, StatusBadge } from '@/components/ui/surfaces';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminRide } from '@/lib/admin-context';

export default function RidesPage() {
  const admin = useAdminApi();
  const router = useRouter();
  const list = useListQuery();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'rides', list.query],
    queryFn: ({ signal }) => admin.rides(list.query, { signal }),
  });

  const columns: Column<AdminRide>[] = [
    {
      key: 'reference',
      header: 'Ride',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-ink-900">{row.reference}</p>
          <p className="text-xs text-ink-500">{dateTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) =>
        row.rideType === 'SHARED' ? (
          <SharedBadge />
        ) : (
          <span className="text-xs text-ink-500">Solo</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusBadge status={row.status} label={RIDE_STATUS_LABEL[row.status as RideStatus]} />
      ),
    },
    {
      key: 'driver',
      header: 'Driver',
      cell: (row) =>
        row.driver ? (
          <div className="min-w-0">
            <p className="truncate text-sm text-ink-800">{row.driver.name}</p>
            {row.plateNumber && (
              <p className="font-mono text-xs text-ink-500">{row.plateNumber}</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-ink-400">unassigned</span>
        ),
    },
    {
      key: 'passengers',
      header: 'Seats',
      cell: (row) => (
        <span className="text-sm tabular-nums text-ink-800">
          {row.seats.occupied}/{row.seats.total}
          {row.seats.joinable && <span className="ml-1.5 text-xs text-share-700">open</span>}
        </span>
      ),
    },
    {
      key: 'distance',
      header: 'Distance',
      align: 'right',
      secondary: true,
      cell: (row) => <span className="text-sm text-ink-600">{distance(row.distanceM)}</span>,
    },
    {
      key: 'paid',
      header: 'Passengers paid',
      align: 'right',
      cell: (row) => (
        <span className="text-sm font-medium tabular-nums text-ink-900">
          {money(row.money.passengersPaid, row.money.currency)}
        </span>
      ),
    },
    {
      key: 'driverEarned',
      header: 'Driver',
      align: 'right',
      secondary: true,
      cell: (row) => (
        <span className="text-sm tabular-nums text-ink-700">
          {money(row.money.driverEarned, row.money.currency)}
        </span>
      ),
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      secondary: true,
      cell: (row) => (
        <span className="text-sm tabular-nums text-positive-700">
          {money(row.money.platformCommission, row.money.currency)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Rides" description="Solo and shared rides across the platform." />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search by reference"
        filters={[
          {
            key: 'rideType',
            label: 'Type',
            value: list.filters.rideType,
            onChange: (value) => list.setFilter('rideType', value),
            options: [
              { value: 'SOLO', label: 'Solo' },
              { value: 'SHARED', label: 'Shared' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status,
            onChange: (value) => list.setFilter('status', value),
            options: (
              [
                'SEARCHING', 'SCHEDULED', 'ACCEPTED', 'DRIVER_ARRIVING',
                'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
              ] as RideStatus[]
            ).map((status) => ({ value: status, label: RIDE_STATUS_LABEL[status] })),
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
            emptyTitle="No rides match"
            onRowClick={(row) => router.push(`/rides/${row.id}`)}
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
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium text-ink-900">{row.reference}</p>
                    <p className="text-xs text-ink-500">{dateTime(row.createdAt)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-ink-900">
                    {money(row.money.passengersPaid, row.money.currency)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.rideType === 'SHARED' && <SharedBadge />}
                  <StatusBadge status={row.status} label={RIDE_STATUS_LABEL[row.status as RideStatus]} />
                  <span className="text-xs text-ink-500">
                    {row.seats.occupied}/{row.seats.total} seats
                  </span>
                </div>
              </div>
            )}
          />
        </Card>
      </div>
    </>
  );
}
