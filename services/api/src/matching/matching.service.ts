import { Injectable, Logger } from '@nestjs/common';
import {
  MatchRejectionReason,
  MatchRequestStatus,
  Prisma,
  RideStatus,
  ServiceType,
  StopType,
} from '@prisma/client';
import { LatLng, bearingDegrees } from '../common/utils/geo';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { FareBreakdown } from '../pricing/pricing.types';
import { RoutingService } from '../routing/routing.service';
import { RouteResult } from '../routing/routing.types';
import { SETTING_KEYS } from '../settings/settings.registry';
import { MatchingSettings, SettingsService } from '../settings/settings.service';
import { MatchingRepository } from './matching.repository';
import {
  evaluateDetour,
  evaluateHardConstraints,
  evaluateTime,
  scoreCandidate,
} from './matching.rules';
import {
  CandidateGeometry,
  EvaluatedCandidate,
  ExistingRider,
  ScoreBreakdown,
  SharedRideSearchInput,
} from './matching.types';
import { PlannedStop, sequenceStops, stopPlanIsValid, stopsToWaypoints } from './stop-sequencer';

/**
 * Candidate persistence writes one row per evaluated ride, each preceded by a
 * fare quote insert. Prisma's 5-second default is not enough for a full
 * shortlist against a remote database.
 */
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/** A candidate that survived every hard constraint, with everything a booking needs. */
export interface SharedRideMatch {
  candidateId: string;
  rideId: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  pickupDistanceM: number;
  dropoffDistanceM: number;
  routeOverlapPct: number;
  additionalDistanceM: number;
  additionalDurationS: number;
  estimatedPickupAt: Date;
  estimatedDropoffAt: Date;
  seatsAvailable: number;
  coPassengerCount: number;
  fare: FareBreakdown;
  savingVsSolo: Prisma.Decimal;
  /** Extra the driver earns by taking this passenger — shown before they accept. */
  driverAdditionalEarning: Prisma.Decimal;
  /** The re-planned stop order, reused verbatim if the passenger books. */
  plannedStops: PlannedStop[];
  newRoute: RouteResult;
}

export interface SharedRideSearchResult {
  requestId: string;
  expiresAt: Date;
  matches: SharedRideMatch[];
  /** Why nothing was offered, when nothing was. */
  rejectionSummary: Partial<Record<MatchRejectionReason, number>>;
}

/** Internal: a candidate plus the re-planning work done for it. */
interface CandidateEvaluation extends EvaluatedCandidate {
  plannedStops: PlannedStop[] | null;
  newRoute: RouteResult | null;
  fare: FareBreakdown | null;
  savingVsSolo: Prisma.Decimal | null;
  driverAdditionalEarning: Prisma.Decimal | null;
  seatsAvailable: number;
  coPassengerCount: number;
}

/**
 * The route-aware dynamic shared-ride matching engine.
 *
 * The pipeline, in the order the spec lays it out:
 *
 *   1. price and route the passenger's journey on its own (the solo baseline)
 *   2. shortlist joinable rides whose route passes within the corridor of BOTH
 *      endpoints — done by PostGIS against a GiST index
 *   3. apply hard constraints: safety, capacity, corridor, stop order,
 *      direction, journey coincidence
 *   4. re-plan the surviving rides' stop order with the new passenger inserted
 *   5. measure the detour that re-planning costs, and the delay it imposes on
 *      passengers already on board
 *   6. apply the detour and time ceilings
 *   7. price the passenger's shared fare and the driver's additional earning
 *   8. score and rank what is left
 *
 * Every candidate — accepted or rejected — is written to
 * shared_ride_match_candidates with the reason, so any decision can be
 * explained afterwards.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: MatchingRepository,
    private readonly routing: RoutingService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  async search(input: SharedRideSearchInput): Promise<SharedRideSearchResult> {
    const settings = await this.settings.getMatchingSettings();
    const staleAfterS = await this.settings.getNumber(SETTING_KEYS.LOCATION_STALE_AFTER_S);
    const quoteTtlS = await this.settings.getNumber(SETTING_KEYS.QUOTE_TTL_SECONDS);

    // ---- 1. the solo baseline ------------------------------------------
    // Routed once and reused: it defines the passenger's own journey length,
    // the saving a shared ride represents, and the coincidence denominator.
    const soloRoute = await this.routing.route({
      waypoints: [input.pickup, input.dropoff],
      departureAt: input.requestedPickupAt ?? undefined,
    });

    // The saving a passenger is shown must be against a solo ride in the SAME
    // vehicle class as the one being offered — comparing a shared car fare to a
    // solo bike fare would be meaningless. A search need not name a vehicle
    // class, so the baseline is resolved per candidate and memoised.
    const soloFareByVehicleType = new Map<string, FareBreakdown>();
    const soloFareFor = async (vehicleTypeId: string): Promise<FareBreakdown> => {
      const cached = soloFareByVehicleType.get(vehicleTypeId);
      if (cached) return cached;

      const quote = await this.pricing.quote({
        serviceType: ServiceType.RIDE,
        vehicleTypeId,
        distanceM: soloRoute.distanceM,
        durationS: soloRoute.durationS,
        isShared: false,
      });
      soloFareByVehicleType.set(vehicleTypeId, quote);
      return quote;
    };

    const expiresAt = new Date(Date.now() + settings.requestTtlS * 1000);

    const request = await this.prisma.sharedRideMatchRequest.create({
      data: {
        userId: input.userId,
        vehicleTypeId: input.vehicleTypeId,
        status: MatchRequestStatus.OPEN,
        pickupAddress: input.pickupAddress,
        pickupLatitude: input.pickup.lat,
        pickupLongitude: input.pickup.lng,
        dropoffAddress: input.dropoffAddress,
        dropoffLatitude: input.dropoff.lat,
        dropoffLongitude: input.dropoff.lng,
        requestedPickupAt: input.requestedPickupAt,
        seatsRequested: input.seatsRequested,
        genderPreference: input.genderPreference,
        genderSnapshot: input.genderSnapshot,
        // Snapshotted so a later settings change cannot make this decision
        // unexplainable.
        settingsSnapshot: settings as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
      select: { id: true },
    });

    // ---- 2. spatial shortlist -------------------------------------------
    const candidates = await this.repository.findCandidates({
      pickup: input.pickup,
      dropoff: input.dropoff,
      vehicleTypeId: input.vehicleTypeId,
      seatsRequested: input.seatsRequested,
      pickupRadiusM: settings.pickupCorridorRadiusM,
      dropoffRadiusM: settings.dropoffCorridorRadiusM,
      driverSearchRadiusM: settings.driverSearchRadiusM,
      limit: settings.maxCandidates,
    });

    if (candidates.length === 0) {
      await this.closeRequest(request.id, MatchRequestStatus.NO_MATCH);
      return { requestId: request.id, expiresAt, matches: [], rejectionSummary: {} };
    }

    const rideIds = candidates.map((c) => c.rideId);
    const [ridersByRide, stopsByRide] = await Promise.all([
      this.repository.findExistingRiders(rideIds),
      this.repository.findPendingStops(rideIds),
    ]);

    const passengerBearing = bearingDegrees(input.pickup, input.dropoff);

    // ---- 3..7. evaluate each candidate ----------------------------------
    const evaluations: CandidateEvaluation[] = [];
    for (const candidate of candidates) {
      evaluations.push(
        await this.evaluateCandidate({
          input,
          candidate,
          settings,
          staleAfterS,
          soloRoute,
          soloFare: await soloFareFor(candidate.vehicleTypeId),
          passengerBearing,
          existingRiders: ridersByRide.get(candidate.rideId) ?? [],
          pendingStops: stopsByRide.get(candidate.rideId) ?? [],
        }),
      );
    }

    // ---- 8. persist the full audit trail, then rank ----------------------
    const candidateIds = await this.persistCandidates(request.id, evaluations, quoteTtlS);

    const matches: SharedRideMatch[] = evaluations
      .filter(
        (e): e is CandidateEvaluation & {
          plannedStops: PlannedStop[];
          newRoute: RouteResult;
          fare: FareBreakdown;
          scoreBreakdown: ScoreBreakdown;
          totalScore: number;
          estimatedPickupAt: Date;
          estimatedDropoffAt: Date;
          savingVsSolo: Prisma.Decimal;
          driverAdditionalEarning: Prisma.Decimal;
        } =>
          e.eligible &&
          e.plannedStops !== null &&
          e.newRoute !== null &&
          e.fare !== null &&
          e.scoreBreakdown !== null &&
          e.totalScore !== null &&
          e.estimatedPickupAt !== null &&
          e.estimatedDropoffAt !== null &&
          e.savingVsSolo !== null &&
          e.driverAdditionalEarning !== null,
      )
      .map((e) => ({
        candidateId: candidateIds.get(e.rideId) ?? '',
        rideId: e.rideId,
        score: e.totalScore,
        scoreBreakdown: e.scoreBreakdown,
        pickupDistanceM: Math.round(e.pickupDistanceM),
        dropoffDistanceM: Math.round(e.dropoffDistanceM),
        routeOverlapPct: e.routeOverlapPct,
        additionalDistanceM: e.additionalDistanceM ?? 0,
        additionalDurationS: e.additionalDurationS ?? 0,
        estimatedPickupAt: e.estimatedPickupAt,
        estimatedDropoffAt: e.estimatedDropoffAt,
        seatsAvailable: e.seatsAvailable,
        coPassengerCount: e.coPassengerCount,
        fare: e.fare,
        savingVsSolo: e.savingVsSolo,
        driverAdditionalEarning: e.driverAdditionalEarning,
        plannedStops: e.plannedStops,
        newRoute: e.newRoute,
      }))
      .sort((a, b) => b.score - a.score);

    const rejectionSummary: Partial<Record<MatchRejectionReason, number>> = {};
    for (const e of evaluations) {
      if (e.eligible) continue;
      rejectionSummary[e.rejectionReason] = (rejectionSummary[e.rejectionReason] ?? 0) + 1;
    }

    await this.closeRequest(
      request.id,
      matches.length > 0 ? MatchRequestStatus.OPEN : MatchRequestStatus.NO_MATCH,
    );

    return { requestId: request.id, expiresAt, matches, rejectionSummary };
  }

  private async evaluateCandidate(args: {
    input: SharedRideSearchInput;
    candidate: CandidateGeometry;
    settings: MatchingSettings;
    staleAfterS: number;
    soloRoute: RouteResult;
    soloFare: FareBreakdown;
    passengerBearing: number;
    existingRiders: ExistingRider[];
    pendingStops: PlannedStop[];
  }): Promise<CandidateEvaluation> {
    const { input, candidate, settings, soloRoute, soloFare, existingRiders, pendingStops } = args;

    const seatsAvailable = candidate.seatsTotal - candidate.seatsOccupied;
    const coPassengerCount = existingRiders.length;

    const base = (
      reason: MatchRejectionReason,
      overlap: { routeOverlapPct: number; driverRouteSharePct: number },
    ): CandidateEvaluation => ({
      rideId: candidate.rideId,
      eligible: reason === MatchRejectionReason.NONE,
      rejectionReason: reason,
      pickupDistanceM: candidate.pickupDistanceM,
      dropoffDistanceM: candidate.dropoffDistanceM,
      pickupFraction: candidate.pickupFraction,
      dropoffFraction: candidate.dropoffFraction,
      routeOverlapPct: overlap.routeOverlapPct,
      driverRouteSharePct: overlap.driverRouteSharePct,
      additionalDistanceM: null,
      additionalDurationS: null,
      estimatedPickupAt: null,
      estimatedDropoffAt: null,
      pickupTimeDeltaS: null,
      worstExistingPassengerDelayS: null,
      scoreBreakdown: null,
      totalScore: null,
      plannedStops: null,
      newRoute: null,
      fare: null,
      savingVsSolo: null,
      driverAdditionalEarning: null,
      seatsAvailable,
      coPassengerCount,
    });

    // A ride that has already begun must have a live position to plan from; a
    // scheduled ride that has not is planned from its route origin instead.
    const isLive =
      candidate.status === RideStatus.ACCEPTED ||
      candidate.status === RideStatus.DRIVER_ARRIVING ||
      candidate.status === RideStatus.DRIVER_ARRIVED ||
      candidate.status === RideStatus.IN_PROGRESS;

    const locationFresh =
      !isLive ||
      (candidate.driverLocationAgeS !== null && candidate.driverLocationAgeS <= args.staleAfterS);

    const verdict = evaluateHardConstraints({
      settings,
      geometry: candidate,
      seatsRequested: input.seatsRequested,
      joiner: { gender: input.genderSnapshot, preference: input.genderPreference },
      existingRiders,
      isSelfMatch: existingRiders.some((r) => r.userId === input.userId),
      passengerBearingDeg: args.passengerBearing,
      passengerDirectDistanceM: soloRoute.distanceM,
      vehicleSharedEligible: true, // already filtered in SQL; re-stated for clarity
      driverLocationFresh: locationFresh,
    });

    if (verdict.reason !== MatchRejectionReason.NONE) {
      return base(verdict.reason, verdict);
    }

    // ---- 4. re-plan the stop order with this passenger inserted ----------
    const origin: LatLng =
      isLive && candidate.driverLat !== null && candidate.driverLng !== null
        ? { lat: candidate.driverLat, lng: candidate.driverLng }
        : candidate.routeStart;

    const newPickup: PlannedStop = {
      key: 'new-pickup',
      ridePassengerId: 'new',
      type: StopType.PICKUP,
      address: input.pickupAddress,
      location: input.pickup,
      routeFraction: candidate.pickupFraction,
    };
    const newDropoff: PlannedStop = {
      key: 'new-dropoff',
      ridePassengerId: 'new',
      type: StopType.DROPOFF,
      address: input.dropoffAddress,
      location: input.dropoff,
      routeFraction: candidate.dropoffFraction,
    };

    const proposedStops = sequenceStops([...pendingStops, newPickup, newDropoff]);
    if (!stopPlanIsValid(proposedStops)) {
      // The optimiser cannot serve this passenger without violating
      // pickup-before-dropoff for somebody.
      return base(MatchRejectionReason.INVALID_STOP_ORDER, verdict);
    }

    let baselineRoute: RouteResult;
    let newRoute: RouteResult;
    try {
      // Baseline is the ride as it stands, planned from where the driver is
      // now — not the route recorded when the ride was created, which may be
      // partly consumed.
      [baselineRoute, newRoute] = await Promise.all([
        pendingStops.length > 0
          ? this.routing.route({ waypoints: stopsToWaypoints(origin, sequenceStops(pendingStops)) })
          : Promise.resolve(this.emptyRoute()),
        this.routing.route({ waypoints: stopsToWaypoints(origin, proposedStops) }),
      ]);
    } catch (error) {
      this.logger.warn(
        `Could not re-plan ride ${candidate.rideId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return base(MatchRejectionReason.RIDE_NOT_JOINABLE, verdict);
    }

    const additionalDistanceM = Math.max(0, newRoute.distanceM - baselineRoute.distanceM);
    const additionalDurationS = Math.max(0, newRoute.durationS - baselineRoute.durationS);

    // ---- 5. arrival times, and the cost to people already on board -------
    const departureBase = isLive
      ? new Date()
      : new Date(
          Math.max(Date.now(), candidate.scheduledPickupAt?.getTime() ?? Date.now()),
        );

    const newEtas = this.cumulativeEtas(departureBase, proposedStops, newRoute);
    const baselineEtas = this.cumulativeEtas(
      departureBase,
      sequenceStops(pendingStops),
      baselineRoute,
    );

    const estimatedPickupAt = newEtas.get('new-pickup');
    const estimatedDropoffAt = newEtas.get('new-dropoff');
    if (!estimatedPickupAt || !estimatedDropoffAt) {
      return base(MatchRejectionReason.RIDE_NOT_JOINABLE, verdict);
    }

    let worstExistingDelayS: number | null = null;
    for (const stop of pendingStops) {
      if (stop.type !== StopType.DROPOFF) continue;
      const before = baselineEtas.get(stop.key);
      const after = newEtas.get(stop.key);
      if (!before || !after) continue;
      const delay = Math.round((after.getTime() - before.getTime()) / 1000);
      worstExistingDelayS = worstExistingDelayS === null ? delay : Math.max(worstExistingDelayS, delay);
    }

    // ---- 6. detour and time ceilings ------------------------------------
    const detourReason = evaluateDetour({
      settings,
      currentRouteDistanceM: baselineRoute.distanceM,
      additionalDistanceM,
      additionalDurationS,
      worstExistingPassengerDelayS: worstExistingDelayS,
    });

    const partial = (reason: MatchRejectionReason): CandidateEvaluation => ({
      ...base(reason, verdict),
      additionalDistanceM,
      additionalDurationS,
      estimatedPickupAt,
      estimatedDropoffAt,
      worstExistingPassengerDelayS: worstExistingDelayS,
    });

    if (detourReason !== MatchRejectionReason.NONE) {
      return partial(detourReason);
    }

    const timeVerdict = evaluateTime({
      settings,
      requestedPickupAt: input.requestedPickupAt,
      estimatedPickupAt,
    });

    if (timeVerdict.reason !== MatchRejectionReason.NONE) {
      return { ...partial(timeVerdict.reason), pickupTimeDeltaS: timeVerdict.pickupTimeDeltaS };
    }

    // ---- 7. price the passenger's leg and the driver's uplift ------------
    const leg = this.passengerLeg(proposedStops, newRoute);

    const fare = await this.pricing.quote({
      serviceType: ServiceType.SHARED_RIDE,
      vehicleTypeId: candidate.vehicleTypeId,
      distanceM: leg.distanceM,
      durationS: leg.durationS,
      isShared: true,
      isSharedJoin: true,
      // The driver serves two extra stops for this passenger.
      additionalStops: 2,
    });

    const savingVsSolo = soloFare.passengerTotal.minus(fare.passengerTotal);

    // ---- 8. score --------------------------------------------------------
    const { breakdown, total } = scoreCandidate({
      settings,
      routeOverlapPct: verdict.routeOverlapPct,
      pickupDistanceM: candidate.pickupDistanceM,
      dropoffDistanceM: candidate.dropoffDistanceM,
      additionalDurationS,
      pickupTimeDeltaS: timeVerdict.pickupTimeDeltaS,
    });

    return {
      ...base(MatchRejectionReason.NONE, verdict),
      additionalDistanceM,
      additionalDurationS,
      estimatedPickupAt,
      estimatedDropoffAt,
      pickupTimeDeltaS: timeVerdict.pickupTimeDeltaS,
      worstExistingPassengerDelayS: worstExistingDelayS,
      scoreBreakdown: breakdown,
      totalScore: total,
      plannedStops: proposedStops,
      newRoute,
      fare,
      savingVsSolo,
      driverAdditionalEarning: fare.driverNet,
    };
  }

  /**
   * Arrival time at each stop, from the route legs. Leg *i* connects waypoint
   * *i* to waypoint *i+1*, and waypoint 0 is the driver's starting point, so
   * arrival at stop *k* is the sum of legs 0..k.
   */
  private cumulativeEtas(
    departure: Date,
    stops: readonly PlannedStop[],
    route: RouteResult,
  ): Map<string, Date> {
    const etas = new Map<string, Date>();
    let elapsedS = 0;

    for (let i = 0; i < stops.length; i += 1) {
      const legDuration = route.legs[i]?.durationS ?? 0;
      elapsedS += legDuration;
      etas.set(stops[i].key, new Date(departure.getTime() + elapsedS * 1000));
    }

    return etas;
  }

  /**
   * Distance and duration the new passenger is actually carried — the legs
   * between their pickup and their drop-off. Charging them for the driver's
   * whole itinerary would bill them for other passengers' journeys.
   */
  private passengerLeg(
    stops: readonly PlannedStop[],
    route: RouteResult,
  ): { distanceM: number; durationS: number } {
    const pickupIndex = stops.findIndex((s) => s.key === 'new-pickup');
    const dropoffIndex = stops.findIndex((s) => s.key === 'new-dropoff');

    if (pickupIndex === -1 || dropoffIndex === -1 || dropoffIndex <= pickupIndex) {
      return { distanceM: route.distanceM, durationS: route.durationS };
    }

    let distanceM = 0;
    let durationS = 0;
    // Legs [pickupIndex+1 .. dropoffIndex] carry the passenger.
    for (let i = pickupIndex + 1; i <= dropoffIndex; i += 1) {
      distanceM += route.legs[i]?.distanceM ?? 0;
      durationS += route.legs[i]?.durationS ?? 0;
    }

    return { distanceM, durationS };
  }

  private emptyRoute(): RouteResult {
    return {
      provider: this.routing.providerName,
      encodedPolyline: '',
      path: [],
      distanceM: 0,
      durationS: 0,
      legs: [],
    };
  }

  /**
   * Writes one row per evaluated candidate, eligible or not. This is the record
   * that proves, for example, that a male candidate was refused a women-only
   * ride rather than simply never considered.
   */
  private async persistCandidates(
    requestId: string,
    evaluations: readonly CandidateEvaluation[],
    quoteTtlS: number,
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    if (evaluations.length === 0) return ids;

    await this.prisma.$transaction(async (tx) => {
      for (const e of evaluations) {
        const fareQuoteId =
          e.fare !== null ? await this.pricing.persistQuote(tx, e.fare, quoteTtlS) : null;

        const row = await tx.sharedRideMatchCandidate.create({
          data: {
            requestId,
            rideId: e.rideId,
            eligible: e.eligible,
            rejectionReason: e.rejectionReason,
            pickupDistanceM: Math.round(e.pickupDistanceM),
            dropoffDistanceM: Math.round(e.dropoffDistanceM),
            pickupRouteFraction: e.pickupFraction,
            dropoffRouteFraction: e.dropoffFraction,
            routeOverlapPct: e.routeOverlapPct,
            additionalDistanceM: e.additionalDistanceM,
            additionalDurationS: e.additionalDurationS,
            estimatedPickupAt: e.estimatedPickupAt,
            pickupTimeDeltaS: e.pickupTimeDeltaS,
            scoreBreakdown: (e.scoreBreakdown ?? undefined) as Prisma.InputJsonValue | undefined,
            totalScore: e.totalScore,
            quotedFare: e.fare?.passengerTotal ?? null,
            quotedSaving: e.savingVsSolo,
            driverAdditionalEarning: e.driverAdditionalEarning,
            fareQuoteId,
          },
          select: { id: true },
        });

        ids.set(e.rideId, row.id);
      }
    }, TRANSACTION_OPTIONS);

    return ids;
  }

  private async closeRequest(requestId: string, status: MatchRequestStatus): Promise<void> {
    await this.prisma.sharedRideMatchRequest.update({
      where: { id: requestId },
      data: { status },
    });
  }
}
