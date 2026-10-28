'use client';

import { PARCEL_STATUS_LABEL, dateTime, distance, money, type ParcelStatus } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Card, StatusBadge } from '@/components/ui/surfaces';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminParcel } from '@/lib/admin-context';

export default function ParcelsPage() {
  const admin = useAdminApi();
  const list = useListQuery();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'parcels', list.query],
    queryFn: ({ signal }) => admin.parcels(list.query, { signal }),
    refetchInterval: 60_000,
  });

  const columns: Column<AdminParcel>[] = [
    {
      key: 'reference',
      header: 'Parcel',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-ink-900">{row.reference}</p>
          <p className="text-xs text-ink-500">{dateTime(row.bookedAt)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusBadge status={row.status} label={PARCEL_STATUS_LABEL[row.status as ParcelStatus]} />
      ),
    },
    {
      key: 'journey',
      header: 'Journey',
      cell: (row) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate text-sm text-ink-800">{row.from}</p>
          <p className="truncate text-xs text-ink-500">→ {row.to}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      secondary: true,
      cell: (row) => (
        <div>
          <p className="text-sm text-ink-800">{row.parcelType}</p>
          <p className="text-xs text-ink-500">
            {row.vehicleType}
            {row.weightKg && ` · ${row.weightKg} kg`}
          </p>
        </div>
      ),
    },
    {
      key: 'courier',
      header: 'Courier',
      cell: (row) =>
        row.courier ? (
          <span className="text-sm text-ink-800">{row.courier.firstName}</span>
        ) : (
          <span className="text-xs text-ink-400">unassigned</span>
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
      header: 'Customer paid',
      align: 'right',
      cell: (row) => (
        <span className="text-sm font-medium tabular-nums text-ink-900">
          {row.money ? money(row.money.customerPaid) : '—'}
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
          {row.money ? money(row.money.platformCommission) : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Parcels" description="Parcel deliveries and their couriers." />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search by reference"
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status,
            onChange: (value) => list.setFilter('status', value),
            options: (
              [
                'PLACED', 'SEARCHING_DRIVER', 'ASSIGNED', 'HEADING_TO_PICKUP',
                'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED',
              ] as ParcelStatus[]
            ).map((status) => ({ value: status, label: PARCEL_STATUS_LABEL[status] })),
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
            emptyTitle="No parcels match"
            pagination={
              data
                ? { page: data.page, totalPages: data.totalPages, total: data.total, onPageChange: list.setPage }
                : undefined
            }
            mobileCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium text-ink-900">{row.reference}</p>
                    <p className="truncate text-xs text-ink-500">{row.from}</p>
                    <p className="truncate text-xs text-ink-500">→ {row.to}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-ink-900">
                    {row.money ? money(row.money.customerPaid) : '—'}
                  </p>
                </div>
                <div className="mt-2">
                  <StatusBadge
                    status={row.status}
                    label={PARCEL_STATUS_LABEL[row.status as ParcelStatus]}
                  />
                </div>
              </div>
            )}
          />
        </Card>
      </div>
    </>
  );
}
