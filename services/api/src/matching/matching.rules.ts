import { MatchRejectionReason } from '@prisma/client';
import { bearingDifference } from '../common/utils/geo';
import { MatchingSettings } from '../settings/settings.service';
import { RiderSafetyProfile, joinerCompatibleWithAll } from './gender-compatibility';
import { CandidateGeometry, ExistingRider, ScoreBreakdown } from './matching.types';

/**
 * The rule kernel: pure functions with no I/O.
 *
 * HARD CONSTRAINTS are evaluated first and independently. A candidate that
 * fails any one of them is discarded and never scored — no soft preference,
 * however favourable, can resurrect it. This ordering is the reason a
 * women-only preference cannot be overridden by a cheaper or closer match.
 *
 * SOFT PREFERENCES only rank candidates that have already passed every hard
 * constraint.
 */

/** Tolerance on route-fraction comparisons; ~0.1% of route length. */
const FRACTION_EPSILON = 0.001;

export interface HardConstraintInput {
  settings: MatchingSettings;
  geometry: CandidateGeometry;
  seatsRequested: number;
  joiner: RiderSafetyProfile;
  /** Riders already confirmed on the candidate ride. */
  existingRiders: readonly ExistingRider[];
  /** True if the requesting user is already a passenger on this ride. */
  isSelfMatch: boolean;
  /** Straight-line bearing of the passenger's own journey. */
  passengerBearingDeg: number;
  /** Road distance for the passenger travelling alone, in metres. */
  passengerDirectDistanceM: number;
  /** True when the vehicle class permits shared riding. */
  vehicleSharedEligible: boolean;
  /** True when the driver's live position is recent enough to trust. */
  driverLocationFresh: boolean;
}

export interface GeometricVerdict {
  reason: MatchRejectionReason;
  routeOverlapPct: number;
  driverRouteSharePct: number;
}

/**
 * Everything that can be decided from geometry, capacity and safety alone —
 * i.e. without asking the routing provider to re-plan the trip. Running these
 * first means the expensive detour calculation is only ever performed for
 * candidates that could actually be offered.
 */
export function evaluateHardConstraints(input: HardConstraintInput): GeometricVerdict {
  const { settings, geometry } = input;

  const overlap = computeOverlap(geometry, input.passengerDirectDistanceM);
  const verdict = (reason: MatchRejectionReason): GeometricVerdict => ({ reason, ...overlap });

  // --- identity ------------------------------------------------------------
  if (input.isSelfMatch) {
    return verdict(MatchRejectionReason.SELF_MATCH);
  }

  // --- vehicle & driver ----------------------------------------------------
  if (!input.vehicleSharedEligible) {
    return verdict(MatchRejectionReason.VEHICLE_NOT_SHARED_ELIGIBLE);
  }
  if (!geometry.driverId) {
    return verdict(MatchRejectionReason.DRIVER_UNAVAILABLE);
  }
  if (!input.driverLocationFresh) {
    return verdict(MatchRejectionReason.DRIVER_UNAVAILABLE);
  }

  // --- capacity ------------------------------------------------------------
  // Advisory only: the authoritative check happens under a row lock at booking
  // time, because a seat can be taken between search and confirmation.
  if (geometry.seatsTotal - geometry.seatsOccupied < input.seatsRequested) {
    return verdict(MatchRejectionReason.CAPACITY_FULL);
  }

  // --- safety --------------------------------------------------------------
  if (settings.enforceGenderPreferences) {
    const existingProfiles: RiderSafetyProfile[] = input.existingRiders.map((r) => ({
      gender: r.gender,
      preference: r.preference,
    }));

    const compatible = joinerCompatibleWithAll(input.joiner, existingProfiles, {
      requireMutual: settings.requireMutualGenderConsent,
      driverGender: geometry.driverGender ?? undefined,
      applyToDriver: settings.applyGenderPreferenceToDriver,
    });

    if (!compatible) {
      return verdict(MatchRejectionReason.GENDER_PREFERENCE_CONFLICT);
    }
  }

  // --- corridor proximity --------------------------------------------------
  if (geometry.pickupDistanceM > settings.pickupCorridorRadiusM) {
    return verdict(MatchRejectionReason.PICKUP_OFF_ROUTE);
  }
  if (geometry.dropoffDistanceM > settings.dropoffCorridorRadiusM) {
    return verdict(MatchRejectionReason.DROPOFF_OFF_ROUTE);
  }

  // --- ordering along the driver's route -----------------------------------
  // Driver route A→B→C→D→E: a passenger boarding at B and alighting at D is
  // valid; boarding at D and alighting at B is not, because the driver never
  // travels that way.
  if (geometry.pickupFraction >= geometry.dropoffFraction - FRACTION_EPSILON) {
    return verdict(MatchRejectionReason.INVALID_STOP_ORDER);
  }

  // The driver must not already have passed the pickup point.
  if (geometry.pickupFraction < geometry.driverProgressFraction - FRACTION_EPSILON) {
    return verdict(MatchRejectionReason.WRONG_DIRECTION);
  }

  // --- direction of travel -------------------------------------------------
  const headingDelta = bearingDifference(
    input.passengerBearingDeg,
    geometry.segmentBearingDeg,
  );
  if (headingDelta > settings.maxBearingDifferenceDeg) {
    return verdict(MatchRejectionReason.WRONG_DIRECTION);
  }

  // --- journey coincidence -------------------------------------------------
  if (overlap.routeOverlapPct < settings.minRouteOverlapPct) {
    return verdict(MatchRejectionReason.ROUTE_OVERLAP_TOO_LOW);
  }

  return verdict(MatchRejectionReason.NONE);
}

/**
 * How closely the driver's on-route segment between the two projections
 * resembles the passenger's own direct journey.
 *
 * A symmetric ratio (shorter ÷ longer) is used deliberately: it penalises both
 * a driver whose road between the points wanders far further than necessary,
 * and a projection artefact where the segment is implausibly short.
 */
export function computeOverlap(
  geometry: CandidateGeometry,
  passengerDirectDistanceM: number,
): { routeOverlapPct: number; driverRouteSharePct: number } {
  const segment = Math.max(0, geometry.sharedSegmentM);
  const direct = Math.max(1, passengerDirectDistanceM);

  const ratio = segment === 0 ? 0 : Math.min(segment, direct) / Math.max(segment, direct);

  const remaining = Math.max(1, geometry.driverRemainingM);
  const share = Math.min(100, (segment / remaining) * 100);

  return {
    routeOverlapPct: round1(ratio * 100),
    driverRouteSharePct: round1(share),
  };
}

export interface DetourInput {
  settings: MatchingSettings;
  currentRouteDistanceM: number;
  additionalDistanceM: number;
  additionalDurationS: number;
  worstExistingPassengerDelayS: number | null;
}

/** Applies the configured detour ceilings. All three must be satisfied. */
export function evaluateDetour(input: DetourInput): MatchRejectionReason {
  const { settings } = input;

  if (input.additionalDistanceM > settings.maxDetourDistanceM) {
    return MatchRejectionReason.DETOUR_EXCEEDED;
  }
  if (input.additionalDurationS > settings.maxDetourDurationS) {
    return MatchRejectionReason.DETOUR_EXCEEDED;
  }

  const base = Math.max(1, input.currentRouteDistanceM);
  const pct = (input.additionalDistanceM / base) * 100;
  if (pct > settings.maxDetourDistancePct) {
    return MatchRejectionReason.DETOUR_EXCEEDED;
  }

  // Adding a passenger must not push people already on board past the delay
  // the operator has agreed to accept on their behalf.
  if (
    input.worstExistingPassengerDelayS !== null &&
    input.worstExistingPassengerDelayS > settings.maxExistingPassengerDelayS
  ) {
    return MatchRejectionReason.DETOUR_EXCEEDED;
  }

  return MatchRejectionReason.NONE;
}

export interface TimeInput {
  settings: MatchingSettings;
  requestedPickupAt: Date | null;
  estimatedPickupAt: Date;
}

/**
 * A match is only useful if the driver reaches the passenger near when the
 * passenger asked for. Arriving 45 minutes late is not a match, however
 * perfectly the route lines up.
 */
export function evaluateTime(input: TimeInput): {
  reason: MatchRejectionReason;
  pickupTimeDeltaS: number | null;
} {
  if (!input.requestedPickupAt) {
    return { reason: MatchRejectionReason.NONE, pickupTimeDeltaS: null };
  }

  const deltaS = Math.round(
    (input.estimatedPickupAt.getTime() - input.requestedPickupAt.getTime()) / 1000,
  );

  // Negative delta = the driver arrives before the passenger asked for.
  if (deltaS < -input.settings.pickupToleranceEarlyS) {
    return { reason: MatchRejectionReason.TIME_INCOMPATIBLE, pickupTimeDeltaS: deltaS };
  }
  if (deltaS > input.settings.pickupToleranceLateS) {
    return { reason: MatchRejectionReason.TIME_INCOMPATIBLE, pickupTimeDeltaS: deltaS };
  }

  return { reason: MatchRejectionReason.NONE, pickupTimeDeltaS: deltaS };
}

export interface ScoreInput {
  settings: MatchingSettings;
  routeOverlapPct: number;
  pickupDistanceM: number;
  dropoffDistanceM: number;
  additionalDurationS: number;
  pickupTimeDeltaS: number | null;
}

/**
 * Ranks candidates that have already satisfied every hard constraint. Each
 * sub-score is normalised to 0..100 where 100 is ideal, then combined using the
 * admin-configured weights.
 */
export function scoreCandidate(input: ScoreInput): {
  breakdown: ScoreBreakdown;
  total: number;
} {
  const { settings } = input;

  const breakdown: ScoreBreakdown = {
    routeOverlap: clamp(input.routeOverlapPct),
    pickupDistance: proximityScore(input.pickupDistanceM, settings.pickupCorridorRadiusM),
    dropoffDistance: proximityScore(input.dropoffDistanceM, settings.dropoffCorridorRadiusM),
    timeCompatibility: timeScore(
      input.pickupTimeDeltaS,
      settings.pickupToleranceEarlyS,
      settings.pickupToleranceLateS,
    ),
    detour: clamp(100 - (input.additionalDurationS / Math.max(1, settings.maxDetourDurationS)) * 100),
  };

  const weights = settings.scoreWeights;
  const weightTotal =
    weights.routeOverlap +
    weights.pickupDistance +
    weights.dropoffDistance +
    weights.timeCompatibility +
    weights.detour;

  if (weightTotal <= 0) {
    return { breakdown, total: 0 };
  }

  const weighted =
    breakdown.routeOverlap * weights.routeOverlap +
    breakdown.pickupDistance * weights.pickupDistance +
    breakdown.dropoffDistance * weights.dropoffDistance +
    breakdown.timeCompatibility * weights.timeCompatibility +
    breakdown.detour * weights.detour;

  return { breakdown, total: round1(weighted / weightTotal) };
}

function proximityScore(distanceM: number, radiusM: number): number {
  if (radiusM <= 0) return 0;
  return clamp(100 - (distanceM / radiusM) * 100);
}

function timeScore(deltaS: number | null, earlyToleranceS: number, lateToleranceS: number): number {
  // No stated preference means no way to be wrong about it.
  if (deltaS === null) return 100;

  const tolerance = deltaS < 0 ? earlyToleranceS : lateToleranceS;
  if (tolerance <= 0) return deltaS === 0 ? 100 : 0;

  return clamp(100 - (Math.abs(deltaS) / tolerance) * 100);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return round1(Math.max(0, Math.min(100, value)));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
