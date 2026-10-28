'use client';

import { distance, messageFor, money, type RestaurantSummary } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, ErrorState, Skeleton, Badge } from '@/components/ui/surfaces';
import { useDebounced } from '@/hooks/use-debounced';
import { useCurrentPosition } from '@/hooks/use-current-position';
import { useApi } from '@/lib/api-context';

export default function FoodPage() {
  const api = useApi();
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const debounced = useDebounced(query, 350);
  const { position, locate, loading: locating, error: locationError } = useCurrentPosition();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['restaurants', debounced, openOnly, position?.lat, position?.lng],
    queryFn: ({ signal }) =>
      api.food.restaurants(
        {
          q: debounced.trim() || undefined,
          openOnly,
          lat: position?.lat,
          lng: position?.lng,
          limit: 20,
        },
        { signal },
      ),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Food</h1>
        <p className="mt-0.5 text-sm text-ink-500">Order from restaurants that deliver to you.</p>
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9 3.5a5.5 5.5 0 1 0 3.4 9.8l3.4 3.4a1 1 0 0 0 1.4-1.4l-3.4-3.4A5.5 5.5 0 0 0 9 3.5zm-3.5 5.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search restaurants"
            aria-label="Search restaurants"
            className="h-11 w-full rounded-[var(--radius-control)] border border-ink-300 bg-white pl-9 pr-3 text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
          />
        </div>

        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => void locate()} loading={locating}>
            {position ? 'Update location' : 'Use my location'}
          </Button>
          <button
            type="button"
            onClick={() => setOpenOnly((v) => !v)}
            aria-pressed={openOnly}
            className={
              openOnly
                ? 'h-11 rounded-[var(--radius-control)] bg-brand-600 px-4 text-sm font-medium text-white'
                : 'h-11 rounded-[var(--radius-control)] bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-inset ring-ink-300'
            }
          >
            Open now
          </button>
        </div>
      </div>

      {locationError && (
        <p className="mb-3 text-sm text-caution-700">{locationError}</p>
      )}
      {!position && !locationError && (
        <p className="mb-3 text-sm text-ink-500">
          Share your location to see distances and who delivers to you.
        </p>
      )}

      {isLoading ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton className="h-40 w-full" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No restaurants found"
          description={
            query
              ? 'Try a different search, or turn off “Open now”.'
              : 'Nothing is delivering to you right now. Try again shortly.'
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((restaurant) => (
            <li key={restaurant.id}>
              <RestaurantCard restaurant={restaurant} />
            </li>
          ))}
        </ul>
      )}

      {isFetching && !isLoading && (
        <p className="mt-4 text-center text-sm text-ink-400">Updating…</p>
      )}
    </div>
  );
}

function RestaurantCard({ restaurant }: { restaurant: RestaurantSummary }) {
  const closed = !restaurant.isAcceptingOrders;
  const outOfRange = restaurant.withinDeliveryRange === false;

  return (
    <Link href={`/food/${restaurant.slug}`} className="block h-full">
      <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
        <div className="relative h-28 bg-linear-to-br from-brand-100 to-brand-200">
          {restaurant.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.coverUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          )}
          {(closed || outOfRange) && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-900/55">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-800">
                {closed ? 'Closed' : 'Outside delivery area'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 truncate font-semibold text-ink-900">{restaurant.name}</h2>
            {Number(restaurant.rating.count) > 0 && (
              <Badge tone="neutral">★ {restaurant.rating.average}</Badge>
            )}
          </div>

          {restaurant.description && (
            <p className="mt-1 line-clamp-2 text-sm text-ink-500">{restaurant.description}</p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-ink-500">
            <span>{restaurant.prepMinutes} min prep</span>
            {restaurant.distanceM !== null && <span>{distance(restaurant.distanceM)}</span>}
            <span>Min {money(restaurant.minOrderAmount)}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
