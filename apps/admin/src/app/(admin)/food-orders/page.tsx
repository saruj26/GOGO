'use client';

import { FOOD_STATUS_LABEL, dateTime, money, type FoodOrderStatus } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Card, StatusBadge } from '@/components/ui/surfaces';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminFoodOrder } from '@/lib/admin-context';

export default function FoodOrdersPage() {
  const admin = useAdminApi();
  const list = useListQuery();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'food-orders', list.query],
    queryFn: ({ signal }) => admin.foodOrders(list.query, { signal }),
    refetchInterval: 60_000,
  });

  const columns: Column<AdminFoodOrder>[] = [
    {
      key: 'reference',
      header: 'Order',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-ink-900">{row.reference}</p>
          <p className="text-xs text-ink-500">{dateTime(row.placedAt)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusBadge status={row.status} label={FOOD_STATUS_LABEL[row.status as FoodOrderStatus]} />
      ),
    },
    {
      key: 'restaurant',
      header: 'Restaurant',
      cell: (row) => <span className="text-sm text-ink-800">{row.restaurant.name}</span>,
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
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (row) => (
        <span className="text-sm font-medium tabular-nums text-ink-900">
          {money(row.money.total, row.money.currency)}
        </span>
      ),
    },
    {
      key: 'payout',
      header: 'Restaurant payout',
      align: 'right',
      secondary: true,
      cell: (row) => (
        <span className="text-sm tabular-nums text-ink-700">
          {money(row.money.restaurantPayout, row.money.currency)}
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
          {money(row.money.restaurantCommission, row.money.currency)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Food orders" description="Every order, with the restaurant split." />

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
                'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'ASSIGNED',
                'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED', 'REJECTED',
              ] as FoodOrderStatus[]
            ).map((status) => ({ value: status, label: FOOD_STATUS_LABEL[status] })),
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
            emptyTitle="No orders match"
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
                    <p className="truncate text-xs text-ink-500">{row.restaurant.name}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-ink-900">
                    {money(row.money.total, row.money.currency)}
                  </p>
                </div>
                <div className="mt-2">
                  <StatusBadge
                    status={row.status}
                    label={FOOD_STATUS_LABEL[row.status as FoodOrderStatus]}
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
