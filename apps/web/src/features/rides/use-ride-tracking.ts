'use client';

import type { RideDetail } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/lib/api-context';

/**
 * Live-ish ride state.
 *
 * The platform has no realtime transport yet, so this polls — gently, and only
 * while the ride is actually moving. A finished ride stops polling entirely.
 *
 * The important part is the shape: screens consume `{ ride, isLive }` and know
 * nothing about how it arrives. When a WebSocket gateway is added, only the
 * inside of this hook changes; no screen has to be redesigned. What this
 * deliberately does NOT do is invent a moving vehicle position — the API does
 * not expose the driver's live coordinates to a passenger, so the map shows the
 * planned route and the status, not a dot pretending to be a car.
 */
const LIVE_STATUSES = new Set([
  'SEARCHING',
  'SCHEDULED',
  'ACCEPTED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
]);

export function useRideTracking(rideId: string) {
  const api = useApi();

  const query = useQuery<RideDetail>({
    queryKey: ['rides', rideId],
    queryFn: ({ signal }) => api.rides.get(rideId, { signal }),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || !LIVE_STATUSES.has(status)) return false;
      // Frequent enough to feel current, infrequent enough to be polite.
      return status === 'IN_PROGRESS' || status === 'DRIVER_ARRIVING' ? 10_000 : 20_000;
    },
    refetchIntervalInBackground: false,
  });

  return {
    ride: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isLive: query.data ? LIVE_STATUSES.has(query.data.status) : false,
  };
}
