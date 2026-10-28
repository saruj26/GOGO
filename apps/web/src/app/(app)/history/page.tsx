'use client';

import {
  FOOD_STATUS_LABEL,
  PARCEL_STATUS_LABEL,
  RIDE_STATUS_LABEL,
  dateTime,
  messageFor,
  money,
} from '@rideflow/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import {
  Card,
  EmptyState,
  ErrorState,
  SharedBadge,
  Skeleton,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';

type Tab = 'rides' | 'food' | 'parcels';

function HistoryView() {
  const api = useApi();
  const params = useSearchParams();
  const initial = (params.get('tab') as Tab) ?? 'rides';
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink-900">History</h1>
        <p className="mt-0.5 text-sm text-ink-500">Everything you have booked with us.</p>
      </header>

      <div className="mb-4">
        <Tabs
          ariaLabel="History type"
          active={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            { id: 'rides', label: 'Rides' },
            { id: 'food', label: 'Food' },
            { id: 'parcels', label: 'Parcels' },
          ]}
        />
      </div>

      {tab === 'rides' && <RideHistory />}
      {tab === 'food' && <FoodHistory />}
      {tab === 'parcels' && <ParcelHistory />}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryView />
    </Suspense>
  );
}

/**
 * Cursor pagination, one page at a time.
 *
 * The API returns a cursor rather than a page number, so a list that grows while
 * somebody is scrolling never duplicates or skips a row.
 */
function useCursorList<T>(
  key: string,
  fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<{
    items: T[];
    nextCursor: string | null;
    hasMore: boolean;
  }>,
) {
  return useInfiniteQuery({
    queryKey: [key, 'history'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

function ListFrame<T>({
  query,
  empty,
  children,
}: {
  query: ReturnType<typeof useCursorList<T>>;
  empty: React.ReactNode;
  children: (items: T[]) => React.ReactNode;
}) {
  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (query.error) {
    return <ErrorState message={messageFor(query.error)} onRetry={() => void query.refetch()} />;
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-3">
      {children(items)}

      {query.hasNextPage && (
        <Button
          variant="secondary"
          fullWidth
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

function RideHistory() {
  const api = useApi();
  const query = useCursorList('rides', (cursor, signal) =>
    api.rides.history({ cursor, limit: 15 }, { signal }),
  );

  return (
    <ListFrame
      query={query}
      empty={
        <EmptyState
          title="No rides yet"
          description="Your completed trips will be listed here."
          action={<Link href="/"><Button>Book a ride</Button></Link>}
        />
      }
    >
      {(items) =>
        items.map((item) => (
          <Link key={item.id} href={`/rides/${item.ride.id}`}>
            <Card className="p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.ride.rideType === 'SHARED' && <SharedBadge />}
                    <StatusBadge
                      status={item.ride.status}
                      label={RIDE_STATUS_LABEL[item.ride.status]}
                    />
                    <span className="text-xs text-ink-400">{item.ride.vehicleType.name}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-ink-900">
                    {item.pickupAddress}
                  </p>
                  <p className="truncate text-sm text-ink-500">→ {item.dropoffAddress}</p>
                  <p className="mt-1 text-xs text-ink-400">{dateTime(item.createdAt)}</p>
                </div>
                {item.fareQuote && (
                  <p className="shrink-0 font-semibold text-ink-900">
                    {money(item.fareQuote.passengerTotal, item.fareQuote.currency)}
                  </p>
                )}
              </div>
            </Card>
          </Link>
        ))
      }
    </ListFrame>
  );
}

function FoodHistory() {
  const api = useApi();
  const query = useCursorList('food-orders', (cursor, signal) =>
    api.food.orders({ cursor, limit: 15 }, { signal }),
  );

  return (
    <ListFrame
      query={query}
      empty={
        <EmptyState
          title="No orders yet"
          description="Food you order will appear here."
          action={<Link href="/food"><Button>Browse restaurants</Button></Link>}
        />
      }
    >
      {(items) =>
        items.map((order) => (
          <Link key={order.id} href={`/food/orders/${order.id}`}>
            <Card className="p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <StatusBadge status={order.status} label={FOOD_STATUS_LABEL[order.status]} />
                  <p className="mt-2 truncate font-medium text-ink-900">{order.restaurant.name}</p>
                  <p className="text-sm text-ink-500">
                    {order.itemLines} {order.itemLines === 1 ? 'item' : 'items'}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    {dateTime(order.deliveredAt ?? order.placedAt)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-ink-900">
                  {money(order.total, order.currency)}
                </p>
              </div>
            </Card>
          </Link>
        ))
      }
    </ListFrame>
  );
}

function ParcelHistory() {
  const api = useApi();
  const query = useCursorList('parcels', (cursor, signal) =>
    api.parcels.list({ cursor, limit: 15 }, { signal }),
  );

  return (
    <ListFrame
      query={query}
      empty={
        <EmptyState
          title="No parcels yet"
          description="Parcels you send will appear here."
          action={<Link href="/parcel"><Button>Send a parcel</Button></Link>}
        />
      }
    >
      {(items) =>
        items.map((parcel) => (
          <Link key={parcel.id} href={`/parcel/${parcel.id}`}>
            <Card className="p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={parcel.status}
                      label={PARCEL_STATUS_LABEL[parcel.status]}
                    />
                    <span className="text-xs text-ink-400">{parcel.parcelType}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-ink-900">{parcel.from}</p>
                  <p className="truncate text-sm text-ink-500">→ {parcel.to}</p>
                  <p className="mt-1 text-xs text-ink-400">{dateTime(parcel.bookedAt)}</p>
                </div>
                {parcel.total && (
                  <p className="shrink-0 font-semibold text-ink-900">
                    {money(parcel.total, parcel.currency ?? 'LKR')}
                  </p>
                )}
              </div>
            </Card>
          </Link>
        ))
      }
    </ListFrame>
  );
}
