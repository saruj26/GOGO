'use client';

import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { Badge, Card, InlineNotice } from '@/components/ui/surfaces';
import { useAdminApi, type AdminVehicleType } from '@/lib/admin-context';

export default function VehicleTypesPage() {
  const admin = useAdminApi();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'vehicle-types'],
    queryFn: ({ signal }) => admin.vehicleTypes({ signal }),
  });

  const columns: Column<AdminVehicleType>[] = [
    {
      key: 'name',
      header: 'Class',
      cell: (row) => (
        <div>
          <p className="font-medium text-ink-900">{row.name}</p>
          <p className="font-mono text-xs text-ink-500">{row.code}</p>
        </div>
      ),
    },
    {
      key: 'seats',
      header: 'Seats',
      align: 'right',
      cell: (row) => (
        <span className="text-sm tabular-nums text-ink-800">
          {row.maxPassengers}
          <span className="ml-1 text-xs text-ink-400">of {row.seatCapacity}</span>
        </span>
      ),
    },
    {
      key: 'capabilities',
      header: 'Can carry',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.sharedRideEligible && <Badge tone="warning">shared rides</Badge>}
          {row.foodDeliveryEligible && <Badge tone="neutral">food</Badge>}
          {row.parcelEligible && <Badge tone="neutral">parcels</Badge>}
        </div>
      ),
    },
    {
      key: 'weight',
      header: 'Max parcel',
      align: 'right',
      secondary: true,
      cell: (row) => (
        <span className="text-sm text-ink-700">
          {row.maxParcelWeightKg ? `${row.maxParcelWeightKg} kg` : '—'}
        </span>
      ),
    },
    {
      key: 'vehicles',
      header: 'Vehicles',
      align: 'right',
      cell: (row) => <span className="text-sm tabular-nums text-ink-700">{row.vehicles}</span>,
    },
    {
      key: 'active',
      header: 'Status',
      cell: (row) =>
        row.active ? <Badge tone="success">active</Badge> : <Badge tone="neutral">inactive</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Vehicle types"
        description="What each class can carry. Fares are set under Pricing."
      />

      <div className="p-4 sm:p-6">
        <div className="mb-4 max-w-2xl">
          <InlineNotice tone="neutral">
            Editing vehicle classes is not available in the console yet. Capabilities are read-only
            here; their fares are editable under Pricing.
          </InlineNotice>
        </div>

        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={data}
            rowKey={(row) => row.id}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            emptyTitle="No vehicle classes configured"
            mobileCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{row.name}</p>
                    <p className="font-mono text-xs text-ink-500">{row.code}</p>
                  </div>
                  <span className="text-sm tabular-nums text-ink-700">
                    {row.maxPassengers} seats
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.sharedRideEligible && <Badge tone="warning">shared rides</Badge>}
                  {row.foodDeliveryEligible && <Badge tone="neutral">food</Badge>}
                  {row.parcelEligible && <Badge tone="neutral">parcels</Badge>}
                </div>
              </div>
            )}
          />
        </Card>
      </div>
    </>
  );
}
