import {
  Gender,
  MatchRejectionReason,
  RideStatus,
  SharedRideGenderPreference,
} from '@prisma/client';
import { LatLng } from '../common/utils/geo';

export interface SharedRideSearchInput {
  userId: string;
  pickup: LatLng;
  pickupAddress: string;
  dropoff: LatLng;
  dropoffAddress: string;
  vehicleTypeId: string | null;
  seatsRequested: number;
  requestedPickupAt: Date | null;
  genderPreference: SharedRideGenderPreference;
  genderSnapshot: Gender;
}

/** One existing rider on a candidate ride, as the matching engine sees them. */
export interface ExistingRider {
  ridePassengerId: string;
  userId: string;
  gender: Gender;
  preference: SharedRideGenderPreference;
  seats: number;
  /** Position of their remaining stops along the driver's active route, 0..1. */
  pickupFraction: number | null;
  dropoffFraction: number | null;
  estimatedDropoffAt: Date | null;
  alreadyOnboard: boolean;
}

/** Raw geometry measured by PostGIS for one candidate ride. */
export interface CandidateGeometry {
  rideId: string;
  status: RideStatus;
  driverId: string | null;
  driverGender: Gender | null;
  vehicleTypeId: string;
  seatsTotal: number;
  seatsOccupied: number;
  routeId: string;
  routeDistanceM: number;
  routeDurationS: number;
  encodedPolyline: string;
  scheduledPickupAt: Date | null;
  rideStartedAt: Date | null;

  pickupDistanceM: number;
  dropoffDistanceM: number;
  pickupFraction: number;
  dropoffFraction: number;
  /** Where the driver currently is along their own route, 0..1. */
  driverProgressFraction: number;
  driverLocationAgeS: number | null;
  driverLat: number | null;
  driverLng: number | null;
  /** Geodesic length of the driver's route between the two projections. */
  sharedSegmentM: number;
  /** Geodesic length of the driver's route from their position to the end. */
  driverRemainingM: number;
  /** Bearing of the driver's route across the shared segment, degrees. */
  segmentBearingDeg: number;
  /** First point of the planned route — the origin for a not-yet-started ride. */
  routeStart: LatLng;
}

export interface ScoreBreakdown {
  routeOverlap: number;
  pickupDistance: number;
  dropoffDistance: number;
  timeCompatibility: number;
  detour: number;
}

export interface EvaluatedCandidate {
  rideId: string;
  eligible: boolean;
  rejectionReason: MatchRejectionReason;

  pickupDistanceM: number;
  dropoffDistanceM: number;
  pickupFraction: number;
  dropoffFraction: number;
  /** Similarity between the driver's on-route segment and the direct journey. */
  routeOverlapPct: number;
  /** Share of the driver's remaining journey the passenger travels alongside. */
  driverRouteSharePct: number;

  additionalDistanceM: number | null;
  additionalDurationS: number | null;
  estimatedPickupAt: Date | null;
  estimatedDropoffAt: Date | null;
  pickupTimeDeltaS: number | null;
  worstExistingPassengerDelayS: number | null;

  scoreBreakdown: ScoreBreakdown | null;
  totalScore: number | null;
}
