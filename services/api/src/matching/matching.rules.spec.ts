import { Gender, MatchRejectionReason, SharedRideGenderPreference } from '@prisma/client';
import { bearingDegrees } from '../common/utils/geo';
import {
  CHAVAKACHCHERI,
  DRIVER_ROUTE,
  JAFFNA,
  KILINOCHCHI,
  KOPAY,
  MANNAR,
  NELLIYADY,
  POINT_PEDRO,
  buildCandidateGeometry,
  defaultMatchingSettings,
  routing,
} from '../../test/support/geo-fixtures';
import { ExistingRider } from './matching.types';
import {
  evaluateDetour,
  evaluateHardConstraints,
  evaluateTime,
  scoreCandidate,
} from './matching.rules';

/**
 * The specification's worked scenario (§33).
 *
 *   Driver:      Jaffna → Kopay → Chavakachcheri → Nelliyady → Point Pedro
 *   Passenger A: Jaffna → Point Pedro           (already on board)
 *   Passenger B: Kopay → Nelliyady              (must be offered)
 *   Passenger C: Chavakachcheri → Point Pedro   (must be offered)
 *   Passenger D: off-corridor                   (must NOT be offered)
 */
describe('shared-ride matching rules', () => {
  const settings = defaultMatchingSettings();

  const rider = (
    gender: Gender,
    preference: SharedRideGenderPreference,
    userId = 'existing-user',
  ): ExistingRider => ({
    ridePassengerId: `rp-${userId}`,
    userId,
    gender,
    preference,
    seats: 1,
    pickupFraction: 0,
    dropoffFraction: 1,
    estimatedDropoffAt: null,
    alreadyOnboard: true,
  });

  const passengerA = rider(Gender.MALE, SharedRideGenderPreference.ANY, 'passenger-a');

  async function evaluate(
    pickup = KOPAY,
    dropoff = NELLIYADY,
    overrides: Partial<Parameters<typeof evaluateHardConstraints>[0]> = {},
  ) {
    const geometry = await buildCandidateGeometry({ pickup, dropoff });
    const solo = await routing.route({ waypoints: [pickup, dropoff] });

    return evaluateHardConstraints({
      settings,
      geometry,
      seatsRequested: 1,
      joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
      existingRiders: [passengerA],
      isSelfMatch: false,
      passengerBearingDeg: bearingDegrees(pickup, dropoff),
      passengerDirectDistanceM: solo.distanceM,
      vehicleSharedEligible: true,
      driverLocationFresh: true,
      ...overrides,
    });
  }

  describe('passenger B — Kopay to Nelliyady, along the driver’s route', () => {
    it('is accepted', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY);
      expect(verdict.reason).toBe(MatchRejectionReason.NONE);
    });

    it('reports a high route coincidence', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY);
      // Not 100%: the driver's road from Kopay to Nelliyady runs via
      // Chavakachcheri, so it is meaningfully longer than the direct line. The
      // measure is doing its job by reporting that difference rather than
      // hiding it.
      expect(verdict.routeOverlapPct).toBeGreaterThan(70);
      expect(verdict.routeOverlapPct).toBeLessThan(100);
    });

    it('occupies a substantial share of the driver’s remaining journey', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY);
      expect(verdict.driverRouteSharePct).toBeGreaterThan(30);
    });
  });

  describe('passenger C — Chavakachcheri to Point Pedro', () => {
    it('is accepted', async () => {
      const verdict = await evaluate(CHAVAKACHCHERI, POINT_PEDRO);
      expect(verdict.reason).toBe(MatchRejectionReason.NONE);
    });
  });

  describe('passenger D — off the corridor', () => {
    it('is rejected when the pickup is far from the route', async () => {
      const verdict = await evaluate(MANNAR, POINT_PEDRO);
      expect(verdict.reason).toBe(MatchRejectionReason.PICKUP_OFF_ROUTE);
    });

    it('is rejected when the drop-off is far from the route', async () => {
      const verdict = await evaluate(KOPAY, KILINOCHCHI);
      expect(verdict.reason).toBe(MatchRejectionReason.DROPOFF_OFF_ROUTE);
    });
  });

  describe('direction of travel', () => {
    it('rejects a passenger travelling against the driver (Nelliyady → Kopay)', async () => {
      const verdict = await evaluate(NELLIYADY, KOPAY);
      expect(verdict.reason).toBe(MatchRejectionReason.INVALID_STOP_ORDER);
    });

    it('rejects a pickup the driver has already driven past', async () => {
      // Driver is at Nelliyady; the request wants collecting back at Kopay.
      const geometry = await buildCandidateGeometry({
        pickup: KOPAY,
        dropoff: POINT_PEDRO,
        driverPosition: NELLIYADY,
      });
      const solo = await routing.route({ waypoints: [KOPAY, POINT_PEDRO] });

      const verdict = evaluateHardConstraints({
        settings,
        geometry,
        seatsRequested: 1,
        joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [passengerA],
        isSelfMatch: false,
        passengerBearingDeg: bearingDegrees(KOPAY, POINT_PEDRO),
        passengerDirectDistanceM: solo.distanceM,
        vehicleSharedEligible: true,
        driverLocationFresh: true,
      });

      expect(verdict.reason).toBe(MatchRejectionReason.WRONG_DIRECTION);
    });
  });

  describe('vehicle capacity', () => {
    it('rejects when no seat is free', async () => {
      const geometry = await buildCandidateGeometry({
        pickup: KOPAY,
        dropoff: NELLIYADY,
        seatsTotal: 4,
        seatsOccupied: 4,
      });
      const solo = await routing.route({ waypoints: [KOPAY, NELLIYADY] });

      const verdict = evaluateHardConstraints({
        settings,
        geometry,
        seatsRequested: 1,
        joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [passengerA],
        isSelfMatch: false,
        passengerBearingDeg: bearingDegrees(KOPAY, NELLIYADY),
        passengerDirectDistanceM: solo.distanceM,
        vehicleSharedEligible: true,
        driverLocationFresh: true,
      });

      expect(verdict.reason).toBe(MatchRejectionReason.CAPACITY_FULL);
    });

    it('rejects a two-seat request when only one seat is free', async () => {
      const geometry = await buildCandidateGeometry({
        pickup: KOPAY,
        dropoff: NELLIYADY,
        seatsTotal: 4,
        seatsOccupied: 3,
      });
      const solo = await routing.route({ waypoints: [KOPAY, NELLIYADY] });

      const verdict = evaluateHardConstraints({
        settings,
        geometry,
        seatsRequested: 2,
        joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [passengerA],
        isSelfMatch: false,
        passengerBearingDeg: bearingDegrees(KOPAY, NELLIYADY),
        passengerDirectDistanceM: solo.distanceM,
        vehicleSharedEligible: true,
        driverLocationFresh: true,
      });

      expect(verdict.reason).toBe(MatchRejectionReason.CAPACITY_FULL);
    });
  });

  describe('gender safety constraints', () => {
    const femaleOnBoard = rider(
      Gender.FEMALE,
      SharedRideGenderPreference.WOMEN_ONLY,
      'passenger-f',
    );

    it('refuses a male joiner when a woman on board asked for women only', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY, {
        joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [femaleOnBoard],
      });

      expect(verdict.reason).toBe(MatchRejectionReason.GENDER_PREFERENCE_CONFLICT);
    });

    it('admits a female joiner to that same ride', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY, {
        joiner: { gender: Gender.FEMALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [femaleOnBoard],
      });

      expect(verdict.reason).toBe(MatchRejectionReason.NONE);
    });

    it('refuses a male co-passenger when the JOINER asked for women only', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY, {
        joiner: { gender: Gender.FEMALE, preference: SharedRideGenderPreference.WOMEN_ONLY },
        existingRiders: [rider(Gender.MALE, SharedRideGenderPreference.ANY, 'passenger-m')],
      });

      expect(verdict.reason).toBe(MatchRejectionReason.GENDER_PREFERENCE_CONFLICT);
    });

    it('refuses an undisclosed gender against a women-only request', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY, {
        joiner: { gender: Gender.FEMALE, preference: SharedRideGenderPreference.WOMEN_ONLY },
        existingRiders: [rider(Gender.UNDISCLOSED, SharedRideGenderPreference.ANY, 'passenger-u')],
      });

      expect(verdict.reason).toBe(MatchRejectionReason.GENDER_PREFERENCE_CONFLICT);
    });

    it('never trades a safety constraint away for a perfect route', async () => {
      // Identical journey, identical geometry — the only difference is the
      // safety preference, and that alone decides it.
      const permissive = await evaluate(KOPAY, NELLIYADY, {
        joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [rider(Gender.MALE, SharedRideGenderPreference.ANY, 'p1')],
      });
      const restricted = await evaluate(KOPAY, NELLIYADY, {
        joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [femaleOnBoard],
      });

      expect(permissive.reason).toBe(MatchRejectionReason.NONE);
      expect(permissive.routeOverlapPct).toBeCloseTo(restricted.routeOverlapPct, 1);
      expect(restricted.reason).toBe(MatchRejectionReason.GENDER_PREFERENCE_CONFLICT);
    });

    it('can be disabled by policy, and then does not block', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY, {
        settings: defaultMatchingSettings({ enforceGenderPreferences: false }),
        joiner: { gender: Gender.MALE, preference: SharedRideGenderPreference.ANY },
        existingRiders: [femaleOnBoard],
      });

      expect(verdict.reason).toBe(MatchRejectionReason.NONE);
    });
  });

  describe('self-matching', () => {
    it('refuses to add a passenger to a ride they are already on', async () => {
      const verdict = await evaluate(KOPAY, NELLIYADY, {
        isSelfMatch: true,
      });
      expect(verdict.reason).toBe(MatchRejectionReason.SELF_MATCH);
    });
  });

  describe('detour ceilings', () => {
    const base = {
      settings,
      currentRouteDistanceM: 40_000,
      worstExistingPassengerDelayS: 0,
    };

    it('accepts a small detour', () => {
      expect(
        evaluateDetour({ ...base, additionalDistanceM: 1_800, additionalDurationS: 300 }),
      ).toBe(MatchRejectionReason.NONE);
    });

    it('rejects on the absolute distance ceiling', () => {
      expect(
        evaluateDetour({ ...base, additionalDistanceM: 7_000, additionalDurationS: 300 }),
      ).toBe(MatchRejectionReason.DETOUR_EXCEEDED);
    });

    it('rejects on the duration ceiling', () => {
      expect(
        evaluateDetour({ ...base, additionalDistanceM: 1_000, additionalDurationS: 1_200 }),
      ).toBe(MatchRejectionReason.DETOUR_EXCEEDED);
    });

    it('rejects on the percentage ceiling even when absolute limits pass', () => {
      expect(
        evaluateDetour({
          ...base,
          currentRouteDistanceM: 4_000,
          additionalDistanceM: 1_500,
          additionalDurationS: 200,
        }),
      ).toBe(MatchRejectionReason.DETOUR_EXCEEDED);
    });

    it('rejects when passengers already on board would be delayed too much', () => {
      expect(
        evaluateDetour({
          ...base,
          additionalDistanceM: 500,
          additionalDurationS: 120,
          worstExistingPassengerDelayS: 900,
        }),
      ).toBe(MatchRejectionReason.DETOUR_EXCEEDED);
    });
  });

  describe('time compatibility', () => {
    const requestedAt = new Date('2026-09-08T08:15:00.000Z');

    it('accepts an arrival two minutes early (8:13 for an 8:15 request)', () => {
      const result = evaluateTime({
        settings,
        requestedPickupAt: requestedAt,
        estimatedPickupAt: new Date('2026-09-08T08:13:00.000Z'),
      });

      expect(result.reason).toBe(MatchRejectionReason.NONE);
      expect(result.pickupTimeDeltaS).toBe(-120);
    });

    it('rejects an arrival 45 minutes late (9:00 for an 8:15 request)', () => {
      const result = evaluateTime({
        settings,
        requestedPickupAt: requestedAt,
        estimatedPickupAt: new Date('2026-09-08T09:00:00.000Z'),
      });

      expect(result.reason).toBe(MatchRejectionReason.TIME_INCOMPATIBLE);
      expect(result.pickupTimeDeltaS).toBe(2700);
    });

    it('rejects an arrival far earlier than requested', () => {
      const result = evaluateTime({
        settings,
        requestedPickupAt: requestedAt,
        estimatedPickupAt: new Date('2026-09-08T07:30:00.000Z'),
      });

      expect(result.reason).toBe(MatchRejectionReason.TIME_INCOMPATIBLE);
    });

    it('imposes no time constraint when the passenger stated no preference', () => {
      const result = evaluateTime({
        settings,
        requestedPickupAt: null,
        estimatedPickupAt: new Date('2026-09-08T23:59:00.000Z'),
      });

      expect(result.reason).toBe(MatchRejectionReason.NONE);
      expect(result.pickupTimeDeltaS).toBeNull();
    });
  });

  describe('soft scoring', () => {
    it('prefers the closer pickup when everything else is equal', () => {
      const near = scoreCandidate({
        settings,
        routeOverlapPct: 90,
        pickupDistanceM: 100,
        dropoffDistanceM: 200,
        additionalDurationS: 200,
        pickupTimeDeltaS: 0,
      });
      const far = scoreCandidate({
        settings,
        routeOverlapPct: 90,
        pickupDistanceM: 550,
        dropoffDistanceM: 200,
        additionalDurationS: 200,
        pickupTimeDeltaS: 0,
      });

      expect(near.total).toBeGreaterThan(far.total);
    });

    it('prefers the smaller detour when everything else is equal', () => {
      const short = scoreCandidate({
        settings,
        routeOverlapPct: 90,
        pickupDistanceM: 200,
        dropoffDistanceM: 200,
        additionalDurationS: 60,
        pickupTimeDeltaS: 0,
      });
      const long = scoreCandidate({
        settings,
        routeOverlapPct: 90,
        pickupDistanceM: 200,
        dropoffDistanceM: 200,
        additionalDurationS: 800,
        pickupTimeDeltaS: 0,
      });

      expect(short.total).toBeGreaterThan(long.total);
    });

    it('keeps every sub-score within 0..100', () => {
      const result = scoreCandidate({
        settings,
        routeOverlapPct: 140,
        pickupDistanceM: 100_000,
        dropoffDistanceM: -5,
        additionalDurationS: 100_000,
        pickupTimeDeltaS: 100_000,
      });

      for (const value of Object.values(result.breakdown)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });
  });

  describe('the driver’s own route', () => {
    it('spans the full corridor from Jaffna to Point Pedro', async () => {
      const route = await routing.route({ waypoints: DRIVER_ROUTE });
      expect(route.path[0]).toEqual(JAFFNA);
      expect(route.path[route.path.length - 1]).toEqual(POINT_PEDRO);
      expect(route.distanceM).toBeGreaterThan(30_000);
    });
  });
});
