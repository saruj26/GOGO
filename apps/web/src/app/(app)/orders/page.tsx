'use client';

import {
  FOOD_STATUS_LABEL,
  PARCEL_STATUS_LABEL,
  RIDE_STATUS_LABEL,
  messageFor,
  money,
  relativeTime,
} from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  EmptyState,
  ErrorState,
  SharedBadge,
  Skeleton,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';

const ACTIVE_RIDE = new Set([
  'SEARCHING', 'SCHEDULED', 'ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS',
]);
const ACTIVE_FOOD = new Set([
  'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP', 'DELIVERING',
]);
const ACTIVE_PARCEL = new Set([
  'PLACED', 'SEARCHING_DRIVER', 'ASSIGNED', 'HEADING_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT',
]);

/**
 * Everything in flight, across all three services, on one screen.
 *
 * Each list is fetched with a small page size — this is a "what is happening
 * now" view, not a history, so there is no reason to pull more than a screenful.
 */
export default function OrdersPage() {
  const api = useApi();

  const rides = useQuery({
    queryKey: ['rides', 'active'],
    queryFn: ({ signal }) => api.rides.history({ limit: 10 }, { signal }),
    refetchInterval: 30_000,
  });

  const food = useQuery({
    queryKey: ['food-orders', 'active'],
    queryFn: ({ signal }) => api.food.orders({ limit: 10 }, { signal }),
    refetchInterval: 30_000,
  });

  const parcels = useQuery({
    queryKey: ['parcels', 'active'],
    queryFn: ({ signal }) => api.parcels.list({ limit: 10 }, { signal }),
    refetchInterval: 30_000,
  });

  const loading = rides.isLoading || food.isLoading || parcels.isLoading;
  const failure = rides.error ?? food.error ?? parcels.error;

  const activeRides = (rides.data?.items ?? []).filter((r) => ACTIVE_RIDE.has(r.ride.status));
  const activeFood = (food.data?.items ?? []).filter((o) => ACTIVE_FOOD.has(o.status));
  const activeParcels = (parcels.data?.items ?? []).filter((p) => ACTIVE_PARCEL.has(p.status));
  const total = activeRides.length + activeFood.length + activeParcels.length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Active orders</h1>
        <p className="mt-0.5 text-sm text-ink-500">Everything happening right now.</p>
      </header>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : failure ? (
        <ErrorState
          message={messageFor(failure)}
          onRetry={() => {
            void rides.refetch();
            void food.refetch();
            void parcels.refetch();
          }}
        />
      ) : total === 0 ? (
        <EmptyState
          title="Nothing in progress"
          description="Your active rides, food orders and parcels appear here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/"><Button>Book a ride</Button></Link>
              <Link href="/food"><Button variant="secondary">Order food</Button></Link>
              <Link href="/parcel"><Button variant="secondary">Send a parcel</Button></Link>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {activeRides.map((item) => (
            <Link key={item.id} href={`/rides/${item.ride.id}`}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.ride.rideType === 'SHARED' ? (
                        <SharedBadge />
                      ) : (
                        <span className="text-xs font-medium text-ink-500">Ride</span>
                      )}
                      <StatusBadge
                        status={item.ride.status}
                        label={RIDE_STATUS_LABEL[item.ride.status]}
                      />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-ink-900">
                      {item.pickupAddress}
                    </p>
                    <p className="truncate text-sm text-ink-500">→ {item.dropoffAddress}</p>
                  </div>
                  {item.fareQuote && (
                    <p className="shrink-0 font-semibold text-ink-900">
                      {money(item.fareQuote.passengerTotal, item.fareQuote.currency)}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          ))}

          {activeFood.map((order) => (
            <Link key={order.id} href={`/food/orders/${order.id}`}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-ink-500">Food</span>
                      <StatusBadge status={order.status} label={FOOD_STATUS_LABEL[order.status]} />
                    </div>
                    <p className="mt-2 truncate font-medium text-ink-900">
                      {order.restaurant.name}
                    </p>
                    <p className="text-sm text-ink-500">
                      {order.itemLines} {order.itemLines === 1 ? 'item' : 'items'} ·{' '}
                      {relativeTime(order.placedAt)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-ink-900">
                    {money(order.total, order.currency)}
                  </p>
                </div>
              </Card>
            </Link>
          ))}

          {activeParcels.map((parcel) => (
            <Link key={parcel.id} href={`/parcel/${parcel.id}`}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-ink-500">Parcel</span>
                      <StatusBadge
                        status={parcel.status}
                        label={PARCEL_STATUS_LABEL[parcel.status]}
                      />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-ink-900">{parcel.from}</p>
                    <p className="truncate text-sm text-ink-500">→ {parcel.to}</p>
                  </div>
                  {parcel.total && (
                    <p className="shrink-0 font-semibold text-ink-900">
                      {money(parcel.total, parcel.currency ?? 'LKR')}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
