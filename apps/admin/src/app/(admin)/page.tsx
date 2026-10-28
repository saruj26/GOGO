'use client';

import { SERVICE_LABEL, dateTime, messageFor, money, type ServiceType } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { Card, CardHeader, ErrorState, Skeleton, Badge } from '@/components/ui/surfaces';
import { useAdminApi } from '@/lib/admin-context';

export default function DashboardPage() {
  const admin = useAdminApi();

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: ({ signal }) => admin.dashboard({ signal }),
    refetchInterval: 60_000,
  });

  const revenue = useQuery({
    queryKey: ['admin', 'revenue-by-service'],
    queryFn: ({ signal }) => admin.revenueByService({}, { signal }),
  });

  const trend = useQuery({
    queryKey: ['admin', 'revenue-trend'],
    queryFn: ({ signal }) => admin.revenueTrend(14, { signal }),
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          dataUpdatedAt ? `Updated ${dateTime(new Date(dataUpdatedAt).toISOString())}` : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {error ? (
          <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />
        ) : (
          <>
            {/* Things that need somebody to act */}
            {data && (data.drivers.awaitingApproval > 0 || data.restaurants.awaitingApproval > 0) && (
              <div className="mb-5 flex flex-wrap gap-3">
                {data.drivers.awaitingApproval > 0 && (
                  <Link href="/drivers?approvalStatus=PENDING">
                    <Card className="flex items-center gap-3 px-4 py-3 transition-shadow hover:shadow-md">
                      <Badge tone="warning">{data.drivers.awaitingApproval}</Badge>
                      <span className="text-sm font-medium text-ink-800">
                        {data.drivers.awaitingApproval === 1 ? 'driver' : 'drivers'} awaiting approval
                      </span>
                    </Card>
                  </Link>
                )}
                {data.restaurants.awaitingApproval > 0 && (
                  <Link href="/restaurants">
                    <Card className="flex items-center gap-3 px-4 py-3 transition-shadow hover:shadow-md">
                      <Badge tone="warning">{data.restaurants.awaitingApproval}</Badge>
                      <span className="text-sm font-medium text-ink-800">
                        {data.restaurants.awaitingApproval === 1 ? 'restaurant' : 'restaurants'} awaiting approval
                      </span>
                    </Card>
                  </Link>
                )}
              </div>
            )}

            <section aria-label="Live activity" className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-ink-700">Right now</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <Metric label="Rides in progress" value={data?.rides.activeNow} loading={isLoading} href="/rides?status=IN_PROGRESS" />
                <Metric label="Drivers online" value={data?.drivers.onlineNow} loading={isLoading} href="/drivers" />
                <Metric label="Food orders open" value={data?.food.activeNow} loading={isLoading} href="/food-orders" />
                <Metric label="Parcels in transit" value={data?.parcels.activeNow} loading={isLoading} href="/parcels" />
                <Metric label="Restaurants active" value={data?.restaurants.active} loading={isLoading} href="/restaurants" />
              </div>
            </section>

            <section aria-label="Today" className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-ink-700">Today</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <Metric label="Rides booked" value={data?.rides.today} loading={isLoading} />
                <Metric
                  label="Shared rides"
                  value={data?.rides.sharedToday}
                  loading={isLoading}
                  hint={
                    data && data.rides.today > 0
                      ? `${Math.round((data.rides.sharedToday / data.rides.today) * 100)}% of rides`
                      : undefined
                  }
                />
                <Metric label="Food orders" value={data?.food.today} loading={isLoading} />
                <Metric label="Parcels" value={data?.parcels.today} loading={isLoading} />
                <Metric label="New users this week" value={data?.users.newThisWeek} loading={isLoading} />
              </div>
            </section>

            <section aria-label="Money" className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-ink-700">Money</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MoneyMetric
                  label="Commission today"
                  value={data?.money.commissionToday}
                  currency={data?.money.currency}
                  loading={isLoading}
                />
                <MoneyMetric
                  label="Commission this month"
                  value={data?.money.commissionThisMonth}
                  currency={data?.money.currency}
                  loading={isLoading}
                />
                <MoneyMetric
                  label="Driver earnings to pay out"
                  value={data?.money.driverEarningsAwaitingPayout}
                  currency={data?.money.currency}
                  loading={isLoading}
                />
                <MoneyMetric
                  label="Driver earnings paid"
                  value={data?.money.driverEarningsPaid}
                  currency={data?.money.currency}
                  loading={isLoading}
                />
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader title="Commission by service" description="All time" />
                <div className="p-4">
                  {revenue.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {revenue.data?.map((row) => {
                        const max = Math.max(
                          ...(revenue.data ?? []).map((r) => Number(r.commission)),
                          1,
                        );
                        const width = (Number(row.commission) / max) * 100;

                        return (
                          <li key={row.serviceType}>
                            <div className="mb-1 flex items-baseline justify-between gap-3">
                              <span className="text-sm text-ink-700">
                                {SERVICE_LABEL[row.serviceType as ServiceType] ?? row.serviceType}
                              </span>
                              <span className="text-sm font-medium text-ink-900">
                                {money(row.commission)}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                              <div
                                className="h-full rounded-full bg-brand-500"
                                style={{ width: `${Math.max(2, width)}%` }}
                              />
                            </div>
                            <p className="mt-0.5 text-xs text-ink-400">
                              {row.transactions} {row.transactions === 1 ? 'transaction' : 'transactions'}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Commission, last 14 days" />
                <div className="p-4">
                  {trend.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <TrendChart points={trend.data ?? []} />
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  loading,
  href,
  hint,
}: {
  label: string;
  value: number | undefined;
  loading?: boolean;
  href?: string;
  hint?: string;
}) {
  const body = (
    <Card className="p-4 transition-shadow hover:shadow-md">
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="text-2xl font-semibold tabular-nums text-ink-900">{value ?? 0}</p>
      )}
      <p className="mt-1 text-xs text-ink-500">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-brand-700">{hint}</p>}
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

function MoneyMetric({
  label,
  value,
  currency,
  loading,
}: {
  label: string;
  value: string | undefined;
  currency: string | undefined;
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <p className="text-xl font-semibold tabular-nums text-ink-900">
          {money(value ?? '0.00', currency)}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-500">{label}</p>
    </Card>
  );
}

/**
 * A small bar chart drawn with plain elements.
 *
 * A charting library would add well over a hundred kilobytes to render fourteen
 * bars, which is not a trade worth making for one panel.
 */
function TrendChart({ points }: { points: Array<{ date: string; commission: string; transactions: number }> }) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-400">No data yet.</p>;
  }

  const max = Math.max(...points.map((p) => Number(p.commission)), 1);

  return (
    <div>
      {/*
        The row must stretch its columns: with `items-end` the columns
        shrink-to-fit, leaving each bar's percentage height with no definite
        basis to resolve against, and nothing renders.
      */}
      <div className="flex h-32 items-stretch gap-1" role="img" aria-label="Daily commission for the last 14 days">
        {points.map((point) => {
          const height = (Number(point.commission) / max) * 100;
          const label = new Date(point.date).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          });

          return (
            <div key={point.date} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className="rounded-t bg-brand-400 transition-colors group-hover:bg-brand-600"
                style={{ height: `${Math.max(2, height)}%` }}
                title={`${label}: ${money(point.commission)} over ${point.transactions} transactions`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-400">
        <span>
          {new Date(points[0].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </span>
        <span>
          {new Date(points[points.length - 1].date).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>
    </div>
  );
}
