import { Gender, RideStatus, SharedRideGenderPreference } from '@prisma/client';
import {
  LatLng,
  bearingDegrees,
  haversineMeters,
  pathLengthMeters,
  projectPointOntoPath,
} from '../../src/common/utils/geo';
import { HaversineRoutingProvider } from '../../src/routing/providers/haversine.provider';
import { CandidateGeometry } from '../../src/matching/matching.types';
import { MatchingSettings } from '../../src/settings/settings.service';

/**
 * The corridor from the specification's worked example. Coordinates are the
 * real towns on the Jaffna – Point Pedro road, in travel order.
 */
export const JAFFNA: LatLng = { lat: 9.6615, lng: 80.0255 };
export const KOPAY: LatLng = { lat: 9.7167, lng: 80.05 };
export const CHAVAKACHCHERI: LatLng = { lat: 9.7405, lng: 80.115 };
export const NELLIYADY: LatLng = { lat: 9.7833, lng: 80.1833 };
export const POINT_PEDRO: LatLng = { lat: 9.8167, lng: 80.2333 };

/** Far off the corridor — used for the "must not match" case. */
export const MANNAR: LatLng = { lat: 8.9772, lng: 79.9047 };
export const KILINOCHCHI: LatLng = { lat: 9.3803, lng: 80.3993 };

export const DRIVER_ROUTE: LatLng[] = [
  JAFFNA,
  KOPAY,
  CHAVAKACHCHERI,
  NELLIYADY,
  POINT_PEDRO,
];

export const routing = new HaversineRoutingProvider();

export function defaultMatchingSettings(
  overrides: Partial<MatchingSettings> = {},
): MatchingSettings {
  return {
    pickupCorridorRadiusM: 600,
    dropoffCorridorRadiusM: 600,
    minRouteOverlapPct: 30,
    maxBearingDifferenceDeg: 75,
    driverSearchRadiusM: 20000,
    maxDetourDistancePct: 25,
    maxDetourDistanceM: 6000,
    maxDetourDurationS: 900,
    maxExistingPassengerDelayS: 600,
    pickupToleranceEarlyS: 300,
    pickupToleranceLateS: 900,
    maxPickupWaitS: 600,
    maxCandidates: 20,
    scoreWeights: {
      routeOverlap: 35,
      pickupDistance: 20,
      dropoffDistance: 15,
      timeCompatibility: 20,
      detour: 10,
    },
    requestTtlS: 300,
    enforceGenderPreferences: true,
    requireMutualGenderConsent: true,
    applyGenderPreferenceToDriver: false,
    ...overrides,
  };
}

/**
 * Builds the geometry PostGIS would produce for a candidate ride, using the
 * same projection maths, so the rule kernel can be tested end to end without a
 * database.
 */
export async function buildCandidateGeometry(options: {
  routeWaypoints?: LatLng[];
  pickup: LatLng;
  dropoff: LatLng;
  driverPosition?: LatLng;
  seatsTotal?: number;
  seatsOccupied?: number;
  status?: RideStatus;
  driverGender?: Gender;
}): Promise<CandidateGeometry> {
  const waypoints = options.routeWaypoints ?? DRIVER_ROUTE;
  const route = await routing.route({ waypoints });
  const path = route.path;

  const pickupProjection = projectPointOntoPath(options.pickup, path);
  const dropoffProjection = projectPointOntoPath(options.dropoff, path);
  const driverProjection = options.driverPosition
    ? projectPointOntoPath(options.driverPosition, path)
    : { fraction: 0, distanceMeters: 0, point: path[0], segmentIndex: 0 };

  const lo = Math.min(pickupProjection.fraction, dropoffProjection.fraction);
  const hi = Math.max(pickupProjection.fraction, dropoffProjection.fraction);

  const totalLength = pathLengthMeters(path);
  const sharedSegmentM = (hi - lo) * totalLength;
  const driverRemainingM = (1 - driverProjection.fraction) * totalLength;

  const segmentBearingDeg = bearingDegrees(
    sliceP(path, lo),
    sliceP(path, hi),
  );

  return {
    rideId: '00000000-0000-4000-8000-000000000001',
    status: options.status ?? RideStatus.IN_PROGRESS,
    driverId: '00000000-0000-4000-8000-0000000000d1',
    driverGender: options.driverGender ?? Gender.MALE,
    vehicleTypeId: '00000000-0000-4000-8000-0000000000v1'.replace(/v/g, 'a'),
    seatsTotal: options.seatsTotal ?? 4,
    seatsOccupied: options.seatsOccupied ?? 1,
    routeId: '00000000-0000-4000-8000-0000000000r1'.replace(/r/g, 'b'),
    routeDistanceM: route.distanceM,
    routeDurationS: route.durationS,
    encodedPolyline: route.encodedPolyline,
    scheduledPickupAt: null,
    rideStartedAt: new Date(),
    pickupDistanceM: pickupProjection.distanceMeters,
    dropoffDistanceM: dropoffProjection.distanceMeters,
    pickupFraction: pickupProjection.fraction,
    dropoffFraction: dropoffProjection.fraction,
    driverProgressFraction: driverProjection.fraction,
    driverLocationAgeS: 5,
    driverLat: (options.driverPosition ?? path[0]).lat,
    driverLng: (options.driverPosition ?? path[0]).lng,
    sharedSegmentM,
    driverRemainingM,
    segmentBearingDeg,
    routeStart: path[0],
  };
}

/** Point at a given fraction along a path. */
function sliceP(path: readonly LatLng[], fraction: number): LatLng {
  const total = pathLengthMeters(path);
  const target = total * fraction;
  let travelled = 0;

  for (let i = 1; i < path.length; i += 1) {
    const segment = haversineMeters(path[i - 1], path[i]);
    if (travelled + segment >= target) {
      const t = segment === 0 ? 0 : (target - travelled) / segment;
      return {
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t,
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t,
      };
    }
    travelled += segment;
  }

  return path[path.length - 1];
}

export const ANY_PREF = SharedRideGenderPreference.ANY;
