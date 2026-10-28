'use client';

import { SERVICE_LABEL, dateTime, money, type ServiceType } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Card, StatusBadge } from '@/components/ui/surfaces';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminPayment } from '@/lib/admin-context';

export default function PaymentsPage() {
  const admin = useAdminApi();
  const list = useListQuery();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'payments', list.query],
    queryFn: ({ signal }) => admin.payments(list.query, { signal }),
  });

  const columns: Column<AdminPayment>[] = [
    {
      key: 'service',
      header: 'Service',
      cell: (row) => (
        <div>
          <p className="text-sm text-ink-900">
            {SERVICE_LABEL[row.serviceType as ServiceType] ?? row.serviceType}
          </p>
          <p className="text-xs text-ink-500">{dateTime(row.createdAt)}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'method',
      header: 'Method',
      cell: (row) => (
        <span className="text-sm text-ink-700">
          {row.method.toLowerCase()}
          <span className="ml-1 text-xs text-ink-400">via {row.provider}</span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      secondary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-800">{row.customer.firstName}</p>
          <p className="text-xs text-ink-500">{row.customer.phone}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (row) => (
        <span className="text-sm font-medium tabular-nums text-ink-900">
          {money(row.amount, row.currency)}
        </span>
      ),
    },
    {
      key: 'refunded',
      header: 'Refunded',
      align: 'right',
      secondary: true,
      cell: (row) =>
        Number(row.refunded) > 0 ? (
          <span className="text-sm tabular-nums text-caution-700">
            {money(row.refunded, row.currency)}
          </span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'failure',
      header: 'Note',
      secondary: true,
      cell: (row) =>
        row.failureReason ? (
          <span className="text-xs text-critical-700">{row.failureReason}</span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every charge and refund. Card data is never stored or shown."
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search"
        filters={[
          {
            key: 'serviceType',
            label: 'Service',
            value: list.filters.serviceType,
            onChange: (value) => list.setFilter('serviceType', value),
            options: (['RIDE', 'SHARED_RIDE', 'FOOD_DELIVERY', 'PARCEL'] as ServiceType[]).map(
              (service) => ({ value: service, label: SERVICE_LABEL[service] }),
            ),
          },
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status,
            onChange: (value) => list.setFilter('status', value),
            options: [
              { value: 'PENDING', label: 'Pending' },
              { value: 'PAID', label: 'Paid' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'REFUNDED', label: 'Refunded' },
              { value: 'PARTIALLY_REFUNDED', label: 'Partially refunded' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          },
        ]}
      />

      <div className="p-4 sm:p-6">
        {data && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-md">
            <Card className="p-4">
              <p className="text-xl font-semibold tabular-nums text-ink-900">
                {money(data.totals.charged)}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">Charged, matching this filter</p>
            </Card>
            <Card className="p-4">
              <p className="text-xl font-semibold tabular-nums text-caution-700">
                {money(data.totals.refunded)}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">Refunded, matching this filter</p>
            </Card>
          </div>
        )}

        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={data?.items}
            rowKey={(row) => row.id}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            emptyTitle="No payments match"
            pagination={
              data
                ? { page: data.page, totalPages: data.totalPages, total: data.total, onPageChange: list.setPage }
                : undefined
            }
            mobileCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {SERVICE_LABEL[row.serviceType as ServiceType] ?? row.serviceType}
                    </p>
                    <p className="text-xs text-ink-500">
                      {row.customer.firstName} · {row.method.toLowerCase()}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-ink-900">
                    {money(row.amount, row.currency)}
                  </p>
                </div>
                <div className="mt-2">
                  <StatusBadge status={row.status} />
                </div>
              </div>
            )}
          />
        </Card>
      </div>
    </>
  );
}
