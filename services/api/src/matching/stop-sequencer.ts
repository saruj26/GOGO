import { StopType } from '@prisma/client';
import { LatLng } from '../common/utils/geo';

export interface PlannedStop {
  /** Stable identifier used to correlate the plan back to a passenger leg. */
  key: string;
  ridePassengerId: string | null;
  type: StopType;
  location: LatLng;
  address: string;
  /** Projection of this stop onto the driver's active route, 0..1. */
  routeFraction: number;
}

/**
 * Produces the ordered stop plan for a shared ride.
 *
 * Stops are ordered by where they fall ALONG THE DRIVER'S ROUTE, not by the
 * order passengers happened to book (§10). For corridor-style shared rides —
 * a driver running a fixed line and picking up passengers along it — route
 * position is the optimal order, and it needs only one routing call to price
 * rather than one per candidate permutation.
 *
 * A repair pass then enforces the invariant the database also checks: a
 * passenger is always collected before they are dropped off. The repair can
 * only ever move a drop-off LATER, so it cannot introduce a new violation.
 *
 * LIMITATION: this is a corridor heuristic. A ride whose passengers are spread
 * across genuinely divergent branches would be better served by an insertion
 * search over permutations; that would be a drop-in replacement for this
 * function, at the cost of one routing call per permutation considered.
 */
export function sequenceStops(stops: readonly PlannedStop[]): PlannedStop[] {
  const ordered = [...stops].sort((a, b) => {
    if (a.routeFraction !== b.routeFraction) {
      return a.routeFraction - b.routeFraction;
    }
    // At an identical point, alight before boarding so a seat is freed before
    // it is claimed.
    if (a.type !== b.type) {
      return a.type === StopType.DROPOFF ? -1 : 1;
    }
    return a.key.localeCompare(b.key);
  });

  return repairPrecedence(ordered);
}

/**
 * Moves any drop-off that precedes its own pickup to sit immediately after it.
 * Terminates in at most one pass per passenger.
 */
function repairPrecedence(stops: PlannedStop[]): PlannedStop[] {
  const result = [...stops];

  const passengerIds = new Set(
    result.filter((s) => s.ridePassengerId !== null).map((s) => s.ridePassengerId as string),
  );

  for (const passengerId of passengerIds) {
    const pickupIndex = result.findIndex(
      (s) => s.ridePassengerId === passengerId && s.type === StopType.PICKUP,
    );
    const dropoffIndex = result.findIndex(
      (s) => s.ridePassengerId === passengerId && s.type === StopType.DROPOFF,
    );

    if (pickupIndex === -1 || dropoffIndex === -1 || dropoffIndex > pickupIndex) {
      continue;
    }

    const [dropoff] = result.splice(dropoffIndex, 1);
    // pickupIndex shifted left by one because the earlier element was removed.
    result.splice(pickupIndex, 0, dropoff);
  }

  return result;
}

/**
 * Verifies the precedence invariant. Used by tests and as a guard before the
 * plan is written, so an optimiser bug surfaces as a clear error rather than as
 * a passenger being driven past their destination.
 */
export function stopPlanIsValid(stops: readonly PlannedStop[]): boolean {
  const seenPickup = new Set<string>();

  for (const stop of stops) {
    if (!stop.ridePassengerId) continue;

    if (stop.type === StopType.PICKUP) {
      seenPickup.add(stop.ridePassengerId);
    } else if (stop.type === StopType.DROPOFF && !seenPickup.has(stop.ridePassengerId)) {
      return false;
    }
  }

  return true;
}

/** Number of seats occupied at the busiest point of the plan. */
export function peakOccupancy(
  stops: readonly PlannedStop[],
  seatsByPassenger: ReadonlyMap<string, number>,
): number {
  let current = 0;
  let peak = 0;

  for (const stop of stops) {
    if (!stop.ridePassengerId) continue;
    const seats = seatsByPassenger.get(stop.ridePassengerId) ?? 1;

    if (stop.type === StopType.PICKUP) {
      current += seats;
      peak = Math.max(peak, current);
    } else if (stop.type === StopType.DROPOFF) {
      current -= seats;
    }
  }

  return peak;
}

/** Convenience for turning an ordered plan into routing waypoints. */
export function stopsToWaypoints(from: LatLng, stops: readonly PlannedStop[]): LatLng[] {
  return [from, ...stops.map((s) => s.location)];
}
