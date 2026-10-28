import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  CancelledBy,
  MatchRejectionReason,
  MatchRequestStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RideStatus,
  RideType,
  RidePassengerStatus,
  RoleCode,
  ServiceType,
  SharedRideGenderPreference,
  StopStatus,
  StopType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { LatLng } from '../common/utils/geo';
import { MatchingService, SharedRideMatch } from '../matching/matching.service';
import { PlannedStop, sequenceStops, stopPlanIsValid, stopsToWaypoints } from '../matching/stop-sequencer';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { RoutingService } from '../routing/routing.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { NOTIFICATION_TYPES } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { REALTIME_EVENTS } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { approvalOutcome, rideCanApprove } from './shared-approval';
import {
  CreateRideDto,
  DeclarePlannedJourneyDto,
  EstimateRideDto,
  SearchSharedRidesDto,
} from './dto/rides.dto';
import { RidesRepository } from './rides.repository';

/**
 * Interactive transactions here perform many small round trips against a
 * managed database that may be far away, so Prisma's 5-second default budget is
 * too tight and fails intermittently under ordinary latency. No external call
 * is ever made inside a transaction, so a generous budget costs nothing.
 */
export const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/**
 * Temporary sequence numbers used while a stop plan is renumbered inside a
 * transaction. Chosen far above any real stop count so parked rows collide with
 * neither each other nor a final position.
 */
const STOP_SEQUENCE_PARK_OFFSET = 100_000;

export interface VehicleEstimate {
  vehicleTypeId: string;
  code: string;
  name: string;
  seatCapacity: number;
  maxPassengers: number;
  sharedRideEligible: boolean;
  distanceM: number;
  durationS: number;
  etaMinutes: number;
  currency: string;
  soloFare: string;
  sharedFareFrom: string | null;
  sharedSaving: string | null;
}

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RidesRepository,
    private readonly routing: RoutingService,
    private readonly pricing: PricingService,
    private readonly matching: MatchingService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly promotions: PromotionsService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // =========================================================================
  // ESTIMATES
  // =========================================================================

  /**
   * Prices every eligible vehicle class for one journey.
   *
   * Fares are computed here, server-side, and the client is never trusted to
   * send one back: what a passenger is charged comes from a persisted FareQuote
   * created by this service, not from a number in a request body.
   */
  async estimate(dto: EstimateRideDto): Promise<VehicleEstimate[]> {
    const pickup: LatLng = { lat: dto.pickup.lat, lng: dto.pickup.lng };
    const dropoff: LatLng = { lat: dto.dropoff.lat, lng: dto.dropoff.lng };

    const route = await this.routing.route({
      waypoints: [pickup, dropoff],
      departureAt: dto.scheduledPickupAt ? new Date(dto.scheduledPickupAt) : undefined,
    });

    const vehicleTypes = await this.prisma.vehicleType.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });

    const estimates: VehicleEstimate[] = [];

    for (const vt of vehicleTypes) {
      const solo = await this.pricing.quote({
        serviceType: ServiceType.RIDE,
        vehicleTypeId: vt.id,
        distanceM: route.distanceM,
        durationS: route.durationS,
        isShared: false,
      });

      let sharedFareFrom: string | null = null;
      let sharedSaving: string | null = null;

      if (vt.sharedRideEligible) {
        const shared = await this.pricing.quote({
          serviceType: ServiceType.SHARED_RIDE,
          vehicleTypeId: vt.id,
          distanceM: route.distanceM,
          durationS: route.durationS,
          isShared: true,
        });
        sharedFareFrom = shared.passengerTotal.toFixed(2);
        sharedSaving = solo.passengerTotal.minus(shared.passengerTotal).toFixed(2);
      }

      estimates.push({
        vehicleTypeId: vt.id,
        code: vt.code,
        name: vt.name,
        seatCapacity: vt.seatCapacity,
        maxPassengers: vt.maxPassengers,
        sharedRideEligible: vt.sharedRideEligible,
        distanceM: route.distanceM,
        durationS: route.durationS,
        etaMinutes: Math.max(1, Math.round(route.durationS / 60)),
        currency: solo.currency,
        soloFare: solo.passengerTotal.toFixed(2),
        sharedFareFrom,
        sharedSaving,
      });
    }

    return estimates;
  }

  // =========================================================================
  // BOOKING
  // =========================================================================

  /**
   * Creates a ride and its first passenger leg.
   *
   * A SHARED ride is created `joinable`, which is what makes it visible to the
   * matching engine for later passengers travelling the same corridor.
   */
  async createRide(userId: string, dto: CreateRideDto) {
    const pickup: LatLng = { lat: dto.pickup.lat, lng: dto.pickup.lng };
    const dropoff: LatLng = { lat: dto.dropoff.lat, lng: dto.dropoff.lng };

    const vehicleType = await this.prisma.vehicleType.findFirst({
      where: { id: dto.vehicleTypeId, active: true },
    });

    if (!vehicleType) {
      throw DomainError.notFound('Vehicle type');
    }

    if (dto.rideType === RideType.SHARED && !vehicleType.sharedRideEligible) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `${vehicleType.name} cannot be booked as a shared ride`,
      );
    }

    if (dto.seats > vehicleType.maxPassengers) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `${vehicleType.name} seats at most ${vehicleType.maxPassengers} passengers`,
      );
    }

    const scheduledPickupAt = await this.validateSchedule(dto.scheduledPickupAt);

    const route = await this.routing.route({
      waypoints: [pickup, dropoff],
      departureAt: scheduledPickupAt ?? undefined,
    });

    const promotion = await this.promotions.resolve(dto.promotionCode, userId);

    const fare = await this.pricing.quote({
      serviceType: dto.rideType === RideType.SHARED ? ServiceType.SHARED_RIDE : ServiceType.RIDE,
      vehicleTypeId: vehicleType.id,
      distanceM: route.distanceM,
      durationS: route.durationS,
      isShared: dto.rideType === RideType.SHARED,
      promotion,
    });

    const quoteTtlS = await this.settings.getNumber(SETTING_KEYS.QUOTE_TTL_SECONDS);
    const safety = await this.resolveSafetyProfile(userId, dto.genderPreference);

    const result = await this.prisma.$transaction(async (tx) => {
      const fareQuoteId = await this.pricing.persistQuote(tx, fare, quoteTtlS);

      const payment = await tx.payment.create({
        data: {
          userId,
          serviceType: fare.inputs.serviceType as ServiceType,
          method: PaymentMethod.CASH,
          status: PaymentStatus.PENDING,
          amount: fare.passengerTotal,
          currency: fare.currency,
          provider: 'cash',
        },
        select: { id: true },
      });

      const ride = await tx.ride.create({
        data: {
          reference: RidesRepository.reference('RD'),
          rideType: dto.rideType,
          status: scheduledPickupAt ? RideStatus.SCHEDULED : RideStatus.SEARCHING,
          vehicleTypeId: vehicleType.id,
          seatsTotal: vehicleType.maxPassengers,
          seatsOccupied: dto.seats,
          // Only a shared ride accepts additional passengers, and only once a
          // driver has been assigned and a real route exists.
          joinable: false,
          scheduledPickupAt,
          currency: fare.currency,
        },
        select: { id: true, reference: true },
      });

      const passenger = await tx.ridePassenger.create({
        data: {
          rideId: ride.id,
          userId,
          status: RidePassengerStatus.CONFIRMED,
          seatsRequested: dto.seats,
          isSharedJoin: false,
          pickupAddress: dto.pickup.address,
          pickupLatitude: pickup.lat,
          pickupLongitude: pickup.lng,
          dropoffAddress: dto.dropoff.address,
          dropoffLatitude: dropoff.lat,
          dropoffLongitude: dropoff.lng,
          requestedPickupAt: scheduledPickupAt,
          genderPreference: safety.preference,
          genderSnapshot: safety.gender,
          note: dto.note,
          fareQuoteId,
          paymentId: payment.id,
        },
        select: { id: true },
      });

      await tx.rideStop.createMany({
        data: [
          {
            rideId: ride.id,
            ridePassengerId: passenger.id,
            sequence: 0,
            type: StopType.PICKUP,
            address: dto.pickup.address,
            latitude: pickup.lat,
            longitude: pickup.lng,
          },
          {
            rideId: ride.id,
            ridePassengerId: passenger.id,
            sequence: 1,
            type: StopType.DROPOFF,
            address: dto.dropoff.address,
            latitude: dropoff.lat,
            longitude: dropoff.lng,
          },
        ],
      });

      await this.routing.persistRideRoute(tx, ride.id, route);

      await tx.rideStatusHistory.create({
        data: {
          rideId: ride.id,
          toStatus: scheduledPickupAt ? RideStatus.SCHEDULED : RideStatus.SEARCHING,
          actorUserId: userId,
          actorRole: RoleCode.USER,
          reason: 'Ride created',
        },
      });

      await this.audit.record(
        {
          actorUserId: userId,
          actorRole: RoleCode.USER,
          action: 'ride.create',
          entityType: 'Ride',
          entityId: ride.id,
          newState: {
            rideType: dto.rideType,
            vehicleTypeId: vehicleType.id,
            passengerTotal: fare.passengerTotal.toFixed(2),
            driverNet: fare.driverNet.toFixed(2),
            pricingRuleVersion: fare.pricingRuleVersion,
          },
        },
        tx,
      );

      return { rideId: ride.id, reference: ride.reference, passengerId: passenger.id, fareQuoteId };
    }, TRANSACTION_OPTIONS);

    return {
      ...result,
      status: scheduledPickupAt ? RideStatus.SCHEDULED : RideStatus.SEARCHING,
      fare: this.publicFare(fare),
      route: { distanceM: route.distanceM, durationS: route.durationS, polyline: route.encodedPolyline },
    };
  }

  /**
   * A driver declares a journey they are making anyway, and offers the empty
   * seats along it.
   *
   * This is the case §2 of the specification describes directly: a driver
   * travelling Jaffna → Kopay → Chavakachcheri → Nelliyady → Point Pedro. The
   * declared waypoints ARE the corridor — they are stored as WAYPOINT stops, so
   * every later re-plan keeps the driver on the road they intended to drive,
   * and the matching engine measures passenger requests against that geometry
   * rather than against a straight line between two endpoints.
   */
  async declarePlannedJourney(driverId: string, dto: DeclarePlannedJourneyDto) {
    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId },
      select: { presence: true, activeVehicleId: true, acceptsShared: true },
    });

    if (!availability?.activeVehicleId) {
      throw new DomainError(
        DomainErrorCode.DRIVER_UNAVAILABLE,
        'Select the vehicle you are driving before declaring a journey.',
      );
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { approvalStatus: true, sharedRideOptIn: true },
    });

    if (driver?.approvalStatus !== 'APPROVED') {
      throw DomainError.forbidden('Your driver account has not been approved yet.');
    }

    if (!driver.sharedRideOptIn || !availability.acceptsShared) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Turn on shared rides in your settings before offering seats on a journey.',
      );
    }

    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: availability.activeVehicleId },
      include: { vehicleType: true },
    });

    if (!vehicle.vehicleType.sharedRideEligible) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `${vehicle.vehicleType.name} cannot carry shared passengers.`,
      );
    }

    const points = [
      dto.origin,
      ...(dto.waypoints ?? []),
      dto.destination,
    ];

    const departureAt = dto.departureAt ? new Date(dto.departureAt) : null;

    const route = await this.routing.route({
      waypoints: points.map((p) => ({ lat: p.lat, lng: p.lng })),
      departureAt: departureAt ?? undefined,
    });

    const seatsOffered = Math.min(
      dto.seatsOffered ?? vehicle.vehicleType.maxPassengers,
      vehicle.vehicleType.maxPassengers,
    );

    return this.prisma.$transaction(async (tx) => {
      const ride = await tx.ride.create({
        data: {
          reference: RidesRepository.reference('SJ'),
          rideType: RideType.SHARED,
          // The driver is already committed to this journey, so the ride starts
          // in the accepted state with no passengers aboard.
          status: departureAt ? RideStatus.SCHEDULED : RideStatus.ACCEPTED,
          driverId,
          vehicleId: vehicle.id,
          vehicleTypeId: vehicle.vehicleTypeId,
          seatsTotal: seatsOffered,
          seatsOccupied: 0,
          joinable: true,
          scheduledPickupAt: departureAt,
          acceptedAt: new Date(),
        },
        select: { id: true, reference: true },
      });

      // The declared points become WAYPOINT stops, which is what keeps the
      // corridor intact through every subsequent re-plan. They carry no
      // passenger, so the pickup-before-drop-off invariant does not apply.
      await tx.rideStop.createMany({
        data: points.slice(1).map((p, index) => ({
          rideId: ride.id,
          ridePassengerId: null,
          sequence: index,
          type: StopType.WAYPOINT,
          address: p.address,
          latitude: p.lat,
          longitude: p.lng,
        })),
      });

      await this.routing.persistRideRoute(tx, ride.id, route);

      await tx.rideStatusHistory.create({
        data: {
          rideId: ride.id,
          toStatus: departureAt ? RideStatus.SCHEDULED : RideStatus.ACCEPTED,
          actorUserId: null,
          actorRole: RoleCode.DRIVER,
          reason: 'Driver declared a planned journey with seats offered',
        },
      });

      return {
        rideId: ride.id,
        reference: ride.reference,
        seatsOffered,
        stops: points.length,
        route: {
          distanceM: route.distanceM,
          durationS: route.durationS,
          polyline: route.encodedPolyline,
        },
      };
    }, TRANSACTION_OPTIONS);
  }

  // =========================================================================
  // SHARED RIDES
  // =========================================================================

  async searchSharedRides(userId: string, dto: SearchSharedRidesDto) {
    const safety = await this.resolveSafetyProfile(userId, dto.genderPreference);

    if (!safety.allowSharedRides) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Shared rides are turned off in your safety preferences.',
      );
    }

    const result = await this.matching.search({
      userId,
      pickup: { lat: dto.pickup.lat, lng: dto.pickup.lng },
      pickupAddress: dto.pickup.address,
      dropoff: { lat: dto.dropoff.lat, lng: dto.dropoff.lng },
      dropoffAddress: dto.dropoff.address,
      vehicleTypeId: dto.vehicleTypeId ?? null,
      seatsRequested: dto.seats,
      requestedPickupAt: dto.scheduledPickupAt ? new Date(dto.scheduledPickupAt) : null,
      genderPreference: safety.preference,
      genderSnapshot: safety.gender,
    });

    return {
      requestId: result.requestId,
      expiresAt: result.expiresAt,
      offers: await Promise.all(result.matches.map((m) => this.toOffer(m))),
      // Rejection reasons are aggregated, never attributed to a specific ride
      // or passenger — that would leak who is travelling where.
      noMatchReason: result.matches.length === 0 ? this.summariseRejections(result) : null,
    };
  }

  /**
   * Adds a passenger to an existing shared ride.
   *
   * The seat is claimed inside a transaction that holds an exclusive lock on
   * the ride row, so two passengers racing for the last seat are serialised and
   * exactly one succeeds. Everything the search offered is re-verified here:
   * an offer is a quotation, not a reservation.
   */
  async joinSharedRide(
    userId: string,
    params: { requestId: string; rideId: string; note?: string },
  ) {
    const candidate = await this.prisma.sharedRideMatchCandidate.findUnique({
      where: { requestId_rideId: { requestId: params.requestId, rideId: params.rideId } },
      include: { request: true, fareQuote: true },
    });

    if (!candidate || candidate.request.userId !== userId) {
      throw DomainError.notFound('Shared ride offer');
    }

    if (!candidate.eligible) {
      throw new DomainError(
        DomainErrorCode.ROUTE_NOT_COMPATIBLE,
        'That shared ride is no longer available for your journey.',
      );
    }

    if (candidate.request.expiresAt && candidate.request.expiresAt < new Date()) {
      throw new DomainError(
        DomainErrorCode.QUOTE_EXPIRED,
        'This offer has expired. Please search again.',
      );
    }

    if (candidate.request.status === MatchRequestStatus.MATCHED) {
      throw DomainError.conflict(
        DomainErrorCode.CONFLICT,
        'You have already booked a ride from this search.',
      );
    }

    const request = candidate.request;
    const seats = request.seatsRequested;

    return this.prisma.$transaction(
      async (tx) => {
        // ---- 1. serialise on the ride row ------------------------------
        const ride = await this.repository.lockRide(tx, params.rideId);
        if (!ride) {
          throw DomainError.notFound('Ride');
        }

        if (!ride.joinable || !this.isJoinableStatus(ride.status)) {
          throw DomainError.conflict(
            DomainErrorCode.RIDE_NOT_JOINABLE,
            'That ride is no longer accepting passengers.',
          );
        }

        // ---- 2. re-verify capacity under the lock ----------------------
        if (ride.seats_total - ride.seats_occupied < seats) {
          throw DomainError.conflict(
            DomainErrorCode.SEATS_UNAVAILABLE,
            'The last seat on that ride has just been taken.',
          );
        }

        // ---- 3. re-verify safety against who is on board NOW ------------
        await this.assertSafetyStillHolds(tx, params.rideId, request);

        // ---- 4. claim the seat -----------------------------------------
        const claimed = await this.repository.claimSeats(tx, params.rideId, seats);
        if (!claimed) {
          throw DomainError.conflict(
            DomainErrorCode.SEATS_UNAVAILABLE,
            'The last seat on that ride has just been taken.',
          );
        }

        // ---- 5. create the passenger leg -------------------------------
        const payment = await tx.payment.create({
          data: {
            userId,
            serviceType: ServiceType.SHARED_RIDE,
            method: PaymentMethod.CASH,
            status: PaymentStatus.PENDING,
            amount: candidate.quotedFare ?? new Prisma.Decimal(0),
            currency: candidate.fareQuote?.currency ?? 'LKR',
            provider: 'cash',
          },
          select: { id: true },
        });

        const passenger = await tx.ridePassenger.create({
          data: {
            rideId: params.rideId,
            userId,
            // The seat is held, but the passenger is not on the ride until the
            // driver accepts. OFFERED is the state between the two.
            status: RidePassengerStatus.OFFERED,
            seatsRequested: seats,
            isSharedJoin: true,
            pickupAddress: request.pickupAddress,
            pickupLatitude: request.pickupLatitude,
            pickupLongitude: request.pickupLongitude,
            dropoffAddress: request.dropoffAddress,
            dropoffLatitude: request.dropoffLatitude,
            dropoffLongitude: request.dropoffLongitude,
            requestedPickupAt: request.requestedPickupAt,
            estimatedPickupAt: candidate.estimatedPickupAt,
            genderPreference: request.genderPreference,
            genderSnapshot: request.genderSnapshot,
            note: params.note,
            fareQuoteId: candidate.fareQuoteId,
            paymentId: payment.id,
          },
          select: { id: true },
        });

        // ---- 6. the itinerary is NOT replanned yet ---------------------
        // The driver's route must not change because someone asked to join.
        // Stops are inserted when the request is accepted.

        await tx.sharedRideMatchRequest.update({
          where: { id: request.id },
          data: {
            status: MatchRequestStatus.MATCHED,
            matchedRidePassengerId: passenger.id,
          },
        });

        await this.audit.record(
          {
            actorUserId: userId,
            actorRole: RoleCode.USER,
            action: 'ride.shared.request',
            entityType: 'RidePassenger',
            entityId: passenger.id,
            newState: {
              rideId: params.rideId,
              seats,
              quotedFare: candidate.quotedFare?.toFixed(2) ?? null,
              driverAdditionalEarning: candidate.driverAdditionalEarning?.toFixed(2) ?? null,
              matchScore: candidate.totalScore?.toFixed(2) ?? null,
              routeOverlapPct: candidate.routeOverlapPct?.toFixed(2) ?? null,
              additionalDistanceM: candidate.additionalDistanceM,
              additionalDurationS: candidate.additionalDurationS,
            },
            metadata: { matchRequestId: request.id, candidateId: candidate.id },
          },
          tx,
        );

        return {
          ridePassengerId: passenger.id,
          rideId: params.rideId,
          seats,
          // PENDING_DRIVER_APPROVAL, so the application shows "waiting for the
          // driver" rather than announcing a confirmed seat.
          status: RidePassengerStatus.OFFERED,
          fare: candidate.quotedFare?.toFixed(2) ?? null,
          currency: candidate.fareQuote?.currency ?? 'LKR',
          estimatedPickupAt: candidate.estimatedPickupAt,
          driverId: ride.driver_id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, ...TRANSACTION_OPTIONS },
    ).then(async (result) => {
      // The driver is told after commit, so the request they are shown is one
      // that definitely exists.
      if (result.driverId) {
        this.realtime.toDriver(result.driverId, REALTIME_EVENTS.SHARED_PASSENGER_REQUESTED, {
          rideId: result.rideId,
          ridePassengerId: result.ridePassengerId,
          seats: result.seats,
        });
      }

      this.realtime.toRide(result.rideId, REALTIME_EVENTS.SHARED_PASSENGER_REQUESTED, {
        ridePassengerId: result.ridePassengerId,
      });

      const { driverId: _withheld, ...forCaller } = result;
      return forCaller;
    });
  }

  // =========================================================================
  // SHARED PASSENGER APPROVAL
  // =========================================================================

  /**
   * Requests waiting on this driver's decision, across the rides they are
   * working.
   *
   * The driver is shown what the request would cost them — the extra distance,
   * the extra time and what they would earn for it — all of which the matching
   * engine computed when the candidate was scored. None of it is recalculated
   * here or in the application.
   */
  async pendingSharedPassengers(driverId: string) {
    const pending = await this.prisma.ridePassenger.findMany({
      where: {
        status: RidePassengerStatus.OFFERED,
        isSharedJoin: true,
        ride: {
          driverId,
          status: {
            in: [
              RideStatus.SCHEDULED,
              RideStatus.ACCEPTED,
              RideStatus.DRIVER_ARRIVING,
              RideStatus.DRIVER_ARRIVED,
              RideStatus.IN_PROGRESS,
            ],
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        rideId: true,
        seatsRequested: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        estimatedPickupAt: true,
        note: true,
        createdAt: true,
        // First name only: the driver has to recognise someone at the kerb,
        // not know who they are.
        user: { select: { firstName: true } },
        fareQuote: { select: { driverNet: true, currency: true } },
        ride: { select: { reference: true, seatsTotal: true, seatsOccupied: true } },
      },
    });

    // The scoring the engine already did for these candidates, fetched once
    // rather than per row.
    const candidates = await this.prisma.sharedRideMatchCandidate.findMany({
      where: { request: { matchedRidePassengerId: { in: pending.map((p) => p.id) } } },
      select: {
        additionalDistanceM: true,
        additionalDurationS: true,
        driverAdditionalEarning: true,
        totalScore: true,
        request: { select: { matchedRidePassengerId: true } },
      },
    });

    const byPassenger = new Map(
      candidates
        .filter((c) => c.request.matchedRidePassengerId !== null)
        .map((c) => [c.request.matchedRidePassengerId as string, c]),
    );

    return pending.map((passenger) => {
      const candidate = byPassenger.get(passenger.id);

      return {
        ridePassengerId: passenger.id,
        rideId: passenger.rideId,
        rideReference: passenger.ride.reference,
        requestedAt: passenger.createdAt,
        passenger: { firstName: passenger.user.firstName },
        seats: passenger.seatsRequested,
        pickup: {
          address: passenger.pickupAddress,
          lat: Number(passenger.pickupLatitude),
          lng: Number(passenger.pickupLongitude),
        },
        dropoff: {
          address: passenger.dropoffAddress,
          lat: Number(passenger.dropoffLatitude),
          lng: Number(passenger.dropoffLongitude),
        },
        estimatedPickupAt: passenger.estimatedPickupAt,
        note: passenger.note,
        additionalDistanceM: candidate?.additionalDistanceM ?? null,
        additionalDurationS: candidate?.additionalDurationS ?? null,
        additionalEarning:
          candidate?.driverAdditionalEarning?.toFixed(2) ??
          passenger.fareQuote?.driverNet.toFixed(2) ??
          null,
        currency: passenger.fareQuote?.currency ?? 'LKR',
        matchScore: candidate?.totalScore?.toFixed(2) ?? null,
      };
    });
  }

  /**
   * The driver takes the passenger.
   *
   * Everything that could have changed between the request and this moment is
   * re-checked under the ride's row lock: that the ride is still theirs, still
   * joinable, still has the seats, and that safety still holds against whoever
   * is aboard now. Only then is the passenger confirmed and the itinerary
   * replanned — which is what changes the driver's route.
   *
   * The seat was already claimed when the request was made, so two concurrent
   * accepts cannot overbook: capacity was settled at request time, and this
   * transition only moves a held seat from pending to confirmed.
   */
  async acceptSharedPassenger(params: {
    driverId: string;
    rideId: string;
    ridePassengerId: string;
    actorUserId: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const ride = await this.repository.lockRide(tx, params.rideId);
        if (!ride) throw DomainError.notFound('Ride');

        if (ride.driver_id !== params.driverId) {
          throw DomainError.forbidden('That ride is not yours.');
        }

        if (!rideCanApprove(ride.status)) {
          throw DomainError.conflict(
            DomainErrorCode.RIDE_NOT_JOINABLE,
            'This ride can no longer take passengers.',
          );
        }

        const passenger = await tx.ridePassenger.findFirst({
          where: { id: params.ridePassengerId, rideId: params.rideId },
          select: {
            id: true,
            userId: true,
            status: true,
            seatsRequested: true,
            genderPreference: true,
            genderSnapshot: true,
            pickupAddress: true,
            pickupLatitude: true,
            pickupLongitude: true,
            dropoffAddress: true,
            dropoffLatitude: true,
            dropoffLongitude: true,
          },
        });

        if (!passenger) throw DomainError.notFound('Shared passenger request');

        // Idempotent from the driver's point of view: a double tap does not
        // add the passenger twice, and does not read as a failure either.
        if (approvalOutcome(passenger.status, 'accept') === 'noop') {
          return {
            ridePassengerId: passenger.id,
            rideId: params.rideId,
            status: passenger.status,
            alreadyAccepted: true,
          };
        }

        // The seat is already held; this asserts the ride's own accounting is
        // still consistent rather than claiming a second one.
        if (ride.seats_occupied > ride.seats_total) {
          throw DomainError.conflict(
            DomainErrorCode.SEATS_UNAVAILABLE,
            'This ride is full.',
          );
        }

        await this.assertSafetyStillHolds(tx, params.rideId, {
          genderPreference: passenger.genderPreference,
          genderSnapshot: passenger.genderSnapshot,
        });

        const claimed = await tx.ridePassenger.updateMany({
          // The status predicate is the real guard: two concurrent accepts race
          // here and exactly one matches.
          where: { id: passenger.id, status: RidePassengerStatus.OFFERED },
          data: { status: RidePassengerStatus.CONFIRMED },
        });

        if (claimed.count !== 1) {
          throw DomainError.conflict(
            DomainErrorCode.CONFLICT,
            'That request has just been handled.',
          );
        }

        const candidate = await tx.sharedRideMatchCandidate.findFirst({
          where: { rideId: params.rideId, request: { matchedRidePassengerId: passenger.id } },
          select: { pickupRouteFraction: true, dropoffRouteFraction: true },
        });

        // Now the route changes.
        await this.replanRide(tx, params.rideId, {
          newStops: [
            {
              key: `${passenger.id}-pickup`,
              ridePassengerId: passenger.id,
              type: StopType.PICKUP,
              address: passenger.pickupAddress,
              location: {
                lat: Number(passenger.pickupLatitude),
                lng: Number(passenger.pickupLongitude),
              },
              routeFraction: Number(candidate?.pickupRouteFraction ?? 0),
            },
            {
              key: `${passenger.id}-dropoff`,
              ridePassengerId: passenger.id,
              type: StopType.DROPOFF,
              address: passenger.dropoffAddress,
              location: {
                lat: Number(passenger.dropoffLatitude),
                lng: Number(passenger.dropoffLongitude),
              },
              routeFraction: Number(candidate?.dropoffRouteFraction ?? 1),
            },
          ],
        });

        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            actorRole: RoleCode.DRIVER,
            action: 'ride.shared.accept',
            entityType: 'RidePassenger',
            entityId: passenger.id,
            previousState: { status: RidePassengerStatus.OFFERED },
            newState: { status: RidePassengerStatus.CONFIRMED, rideId: params.rideId },
          },
          tx,
        );

        return {
          ridePassengerId: passenger.id,
          rideId: params.rideId,
          status: RidePassengerStatus.CONFIRMED,
          alreadyAccepted: false,
          passengerUserId: passenger.userId,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, ...TRANSACTION_OPTIONS },
    ).then(async (result) => {
      if (!result.alreadyAccepted) {
        // Everyone on the ride learns the itinerary changed; the new passenger
        // learns they are on it.
        this.realtime.toRide(result.rideId, REALTIME_EVENTS.SHARED_PASSENGER_ADDED, {
          ridePassengerId: result.ridePassengerId,
        });
        this.realtime.toRide(result.rideId, REALTIME_EVENTS.RIDE_STOPS_RESEQUENCED, {});

        if (result.passengerUserId) {
          await this.notifications.notify({
            userId: result.passengerUserId,
            type: NOTIFICATION_TYPES.SHARED_REQUEST_ACCEPTED,
            title: 'You are on the ride',
            body: 'The driver accepted your request. You will be picked up along the route.',
            data: { rideId: result.rideId },
            dedupeKey: `ride.shared.accepted:${result.ridePassengerId}`,
          });
        }
      }

      const { passengerUserId: _hidden, ...forCaller } = result;
      return forCaller;
    });
  }

  /**
   * The driver declines the passenger.
   *
   * The held seat is released, the passenger never joins the ride, and the
   * journey continues unchanged — no stop was ever added for them, so there is
   * nothing to unwind. Their match request re-opens so they can take a
   * different ride while it is still valid.
   */
  async rejectSharedPassenger(params: {
    driverId: string;
    rideId: string;
    ridePassengerId: string;
    actorUserId: string;
    reason?: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const ride = await this.repository.lockRide(tx, params.rideId);
        if (!ride) throw DomainError.notFound('Ride');

        if (ride.driver_id !== params.driverId) {
          throw DomainError.forbidden('That ride is not yours.');
        }

        const passenger = await tx.ridePassenger.findFirst({
          where: { id: params.ridePassengerId, rideId: params.rideId },
          select: { id: true, status: true, seatsRequested: true, userId: true },
        });

        if (!passenger) throw DomainError.notFound('Shared passenger request');

        if (approvalOutcome(passenger.status, 'reject') === 'noop') {
          return {
            ridePassengerId: passenger.id,
            rideId: params.rideId,
            status: passenger.status,
            alreadyRejected: true,
          };
        }

        const rejected = await tx.ridePassenger.updateMany({
          where: { id: passenger.id, status: RidePassengerStatus.OFFERED },
          data: {
            status: RidePassengerStatus.REJECTED,
            cancelledAt: new Date(),
            cancellationReason: params.reason ?? 'Declined by the driver',
          },
        });

        if (rejected.count !== 1) {
          throw DomainError.conflict(
            DomainErrorCode.CONFLICT,
            'That request has just been handled.',
          );
        }

        // The seat goes back to the pool only once, guarded by the status
        // transition above.
        await this.repository.releaseSeats(tx, params.rideId, passenger.seatsRequested);

        // Re-open the search so the passenger can pick another ride rather
        // than starting again from nothing.
        await tx.sharedRideMatchRequest.updateMany({
          where: { matchedRidePassengerId: passenger.id },
          data: { status: MatchRequestStatus.OPEN, matchedRidePassengerId: null },
        });

        await tx.sharedRideMatchCandidate.updateMany({
          where: { rideId: params.rideId, request: { userId: passenger.userId } },
          data: { eligible: false, rejectionReason: MatchRejectionReason.DRIVER_UNAVAILABLE },
        });

        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            actorRole: RoleCode.DRIVER,
            action: 'ride.shared.reject',
            entityType: 'RidePassenger',
            entityId: passenger.id,
            previousState: { status: RidePassengerStatus.OFFERED },
            newState: {
              status: RidePassengerStatus.REJECTED,
              rideId: params.rideId,
              seatsReleased: passenger.seatsRequested,
            },
          },
          tx,
        );

        return {
          ridePassengerId: passenger.id,
          rideId: params.rideId,
          status: RidePassengerStatus.REJECTED,
          alreadyRejected: false,
          passengerUserId: passenger.userId,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, ...TRANSACTION_OPTIONS },
    ).then(async (result) => {
      if (!result.alreadyRejected && result.passengerUserId) {
        // Told to the passenger only. The other people on the ride have no
        // business knowing who asked to join and was turned down.
        this.realtime.toUser(
          result.passengerUserId,
          REALTIME_EVENTS.SHARED_PASSENGER_REJECTED,
          { rideId: result.rideId },
        );

        await this.notifications.notify({
          userId: result.passengerUserId,
          type: NOTIFICATION_TYPES.SHARED_REQUEST_REJECTED,
          title: 'That ride is not available',
          body: 'The driver could not take you. Search again to find another ride going your way.',
          data: { rideId: result.rideId },
          dedupeKey: `ride.shared.rejected:${result.ridePassengerId}`,
        });
      }

      const { passengerUserId: _hidden, ...forCaller } = result;
      return forCaller;
    });
  }

  /**
   * Rebuilds the ride's stop order and route after the passenger set changes.
   *
   * Existing PENDING stops are re-sequenced together with the new ones, so the
   * plan reflects the whole itinerary rather than appending to the end.
   */
  private async replanRide(
    tx: Prisma.TransactionClient,
    rideId: string,
    options: { newStops: PlannedStop[] },
  ): Promise<void> {
    const existing = await tx.$queryRaw<
      Array<{
        id: string;
        ride_passenger_id: string | null;
        type: string;
        address: string;
        latitude: number;
        longitude: number;
        route_fraction: number | null;
      }>
    >`
      SELECT
        s.id,
        s.ride_passenger_id,
        s.type::text AS type,
        s.address,
        s.latitude::double precision  AS latitude,
        s.longitude::double precision AS longitude,
        ST_LineLocatePoint(rr.geometry::geometry, s.location::geometry)::double precision AS route_fraction
      FROM ride_stops s
      JOIN rides r        ON r.id = s.ride_id
      JOIN ride_routes rr ON rr.id = r.active_route_id
      WHERE s.ride_id = ${rideId}::uuid
        AND s.status = 'PENDING'
    `;

    const existingStops: PlannedStop[] = existing.map((row) => ({
      key: row.id,
      ridePassengerId: row.ride_passenger_id,
      type: row.type as StopType,
      address: row.address,
      location: { lat: Number(row.latitude), lng: Number(row.longitude) },
      routeFraction: row.route_fraction === null ? 0 : Number(row.route_fraction),
    }));

    const plan = sequenceStops([...existingStops, ...options.newStops]);

    if (!stopPlanIsValid(plan)) {
      // Refuse rather than commit an itinerary that would drive somebody past
      // their destination before collecting them.
      throw new DomainError(
        DomainErrorCode.ROUTE_NOT_COMPATIBLE,
        'That passenger cannot be added without disrupting the current route.',
      );
    }

    const origin = await this.rideOrigin(tx, rideId, plan);
    const route = await this.routing.route({ waypoints: stopsToWaypoints(origin, plan) });

    // `ride_stops` carries UNIQUE(ride_id, sequence), so renumbering has to
    // happen in three phases. Interleaving inserts with updates would let a new
    // stop claim a number an existing stop has not yet vacated.
    const newKeys = new Set(options.newStops.map((s) => s.key));

    // Phase 1 — park every existing stop on a number no final position uses.
    // Negative values are not available: `ride_stops_sequence_non_negative`
    // forbids them, so the parking range sits above any plausible stop count.
    for (let i = 0; i < existingStops.length; i += 1) {
      await tx.rideStop.update({
        where: { id: existingStops[i].key },
        data: { sequence: STOP_SEQUENCE_PARK_OFFSET + i },
      });
    }

    // Phase 2 — insert the new stops at their final positions.
    for (let index = 0; index < plan.length; index += 1) {
      const stop = plan[index];
      if (!newKeys.has(stop.key)) continue;

      await tx.rideStop.create({
        data: {
          rideId,
          ridePassengerId: stop.ridePassengerId,
          sequence: index,
          type: stop.type,
          address: stop.address,
          latitude: stop.location.lat,
          longitude: stop.location.lng,
          status: StopStatus.PENDING,
        },
      });
    }

    // Phase 3 — move the existing stops to their final positions.
    for (let index = 0; index < plan.length; index += 1) {
      const stop = plan[index];
      if (newKeys.has(stop.key)) continue;
      await tx.rideStop.update({ where: { id: stop.key }, data: { sequence: index } });
    }

    await this.routing.persistRideRoute(tx, rideId, route);
  }

  /** Where re-planning starts from: the driver now, or the first stop if not yet moving. */
  private async rideOrigin(
    tx: Prisma.TransactionClient,
    rideId: string,
    plan: readonly PlannedStop[],
  ): Promise<LatLng> {
    const rows = await tx.$queryRaw<Array<{ lat: number; lng: number }>>`
      SELECT dl.latitude::double precision AS lat, dl.longitude::double precision AS lng
      FROM rides r
      JOIN driver_locations_current dl ON dl.driver_id = r.driver_id
      WHERE r.id = ${rideId}::uuid
        AND r.status IN ('ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS')
    `;

    if (rows[0]) {
      return { lat: Number(rows[0].lat), lng: Number(rows[0].lng) };
    }

    return plan[0].location;
  }

  /**
   * Re-runs the gender compatibility check against the passengers actually on
   * the ride at commit time. The set can have changed since the search.
   */
  private async assertSafetyStillHolds(
    tx: Prisma.TransactionClient,
    rideId: string,
    request: { genderPreference: SharedRideGenderPreference; genderSnapshot: string },
  ): Promise<void> {
    const settings = await this.settings.getMatchingSettings();
    if (!settings.enforceGenderPreferences) return;

    const riders = await tx.ridePassenger.findMany({
      where: {
        rideId,
        status: {
          in: [
            RidePassengerStatus.CONFIRMED,
            RidePassengerStatus.AWAITING_PICKUP,
            RidePassengerStatus.ONBOARD,
          ],
        },
      },
      select: { genderSnapshot: true, genderPreference: true },
    });

    const { joinerCompatibleWithAll } = await import('../matching/gender-compatibility');

    const compatible = joinerCompatibleWithAll(
      {
        gender: request.genderSnapshot as never,
        preference: request.genderPreference,
      },
      riders.map((r) => ({ gender: r.genderSnapshot, preference: r.genderPreference })),
      { requireMutual: settings.requireMutualGenderConsent, applyToDriver: false },
    );

    if (!compatible) {
      throw new DomainError(
        DomainErrorCode.GENDER_PREFERENCE_CONFLICT,
        'That ride no longer matches your shared-ride safety preferences.',
        HttpStatus.CONFLICT,
      );
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private isJoinableStatus(status: RideStatus | string): boolean {
    return (
      status === RideStatus.SCHEDULED ||
      status === RideStatus.ACCEPTED ||
      status === RideStatus.DRIVER_ARRIVING ||
      status === RideStatus.DRIVER_ARRIVED ||
      status === RideStatus.IN_PROGRESS
    );
  }

  private async validateSchedule(iso?: string): Promise<Date | null> {
    if (!iso) return null;

    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invalid scheduled time');
    }

    const minLeadMinutes = await this.settings.getNumber(SETTING_KEYS.SCHEDULING_MIN_LEAD_MINUTES);
    const maxDaysAhead = await this.settings.getNumber(SETTING_KEYS.SCHEDULING_MAX_DAYS_AHEAD);

    const earliest = new Date(Date.now() + minLeadMinutes * 60_000);
    const latest = new Date(Date.now() + maxDaysAhead * 86_400_000);

    if (when < earliest) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `Scheduled rides must be at least ${minLeadMinutes} minutes ahead`,
      );
    }
    if (when > latest) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `Rides can be scheduled up to ${maxDaysAhead} days ahead`,
      );
    }

    return when;
  }

  private async resolveSafetyProfile(
    userId: string,
    override?: SharedRideGenderPreference,
  ): Promise<{
    gender: never;
    preference: SharedRideGenderPreference;
    allowSharedRides: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { gender: true, sharedRidePrefs: true },
    });

    if (!user) {
      throw DomainError.notFound('User');
    }

    return {
      gender: user.gender as never,
      preference:
        override ?? user.sharedRidePrefs?.genderPreference ?? SharedRideGenderPreference.ANY,
      allowSharedRides: user.sharedRidePrefs?.allowSharedRides ?? true,
    };
  }

  /** The fare shape a passenger may see — driver economics are not included. */
  private publicFare(fare: {
    currency: string;
    grossFare: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    serviceFee: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    passengerTotal: Prisma.Decimal;
    components: Array<{ code: string; label: string; side: string; amount: Prisma.Decimal }>;
  }) {
    return {
      currency: fare.currency,
      subtotal: fare.grossFare.toFixed(2),
      discount: fare.discountTotal.toFixed(2),
      serviceFee: fare.serviceFee.toFixed(2),
      tax: fare.taxTotal.toFixed(2),
      total: fare.passengerTotal.toFixed(2),
      breakdown: fare.components
        .filter((c) => c.side === 'PASSENGER')
        .map((c) => ({ code: c.code, label: c.label, amount: c.amount.toFixed(2) })),
    };
  }

  /**
   * The passenger-facing shape of an offer.
   *
   * Deliberately excludes co-passenger identities, their genders, the driver's
   * exact position and the internal match score — none of which the passenger
   * needs in order to decide (§37).
   */
  private async toOffer(match: SharedRideMatch) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: match.rideId },
      select: {
        reference: true,
        vehicleType: { select: { code: true, name: true } },
        driver: {
          select: {
            ratingAverage: true,
            completedTrips: true,
            user: { select: { firstName: true } },
          },
        },
        vehicle: { select: { make: true, model: true, colour: true } },
      },
    });

    return {
      rideId: match.rideId,
      reference: ride?.reference,
      vehicleType: ride?.vehicleType,
      vehicle: ride?.vehicle,
      driver: ride?.driver
        ? {
            firstName: ride.driver.user.firstName,
            rating: ride.driver.ratingAverage.toFixed(2),
            trips: ride.driver.completedTrips,
          }
        : null,
      pickupWalkMeters: match.pickupDistanceM,
      dropoffWalkMeters: match.dropoffDistanceM,
      estimatedPickupAt: match.estimatedPickupAt,
      estimatedDropoffAt: match.estimatedDropoffAt,
      seatsAvailable: match.seatsAvailable,
      coPassengerCount: match.coPassengerCount,
      fare: this.publicFare(match.fare),
      saving: match.savingVsSolo.toFixed(2),
      matchQuality: Math.round(match.score),
    };
  }

  private summariseRejections(result: { rejectionSummary: Record<string, number | undefined> }) {
    const reasons = Object.entries(result.rejectionSummary)
      .filter(([, count]) => (count ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

    if (reasons.length === 0) {
      return 'No drivers are currently travelling your route.';
    }

    const messages: Record<string, string> = {
      GENDER_PREFERENCE_CONFLICT:
        'Rides on your route do not currently match your safety preferences.',
      CAPACITY_FULL: 'Rides on your route are full.',
      DETOUR_EXCEEDED: 'Your journey would take drivers too far off their route.',
      TIME_INCOMPATIBLE: 'No driver can reach you close to your requested time.',
      WRONG_DIRECTION: 'Drivers on your route are travelling the other way.',
      INVALID_STOP_ORDER: 'Drivers on your route are travelling the other way.',
      PICKUP_OFF_ROUTE: 'Your pickup point is not on any current shared route.',
      DROPOFF_OFF_ROUTE: 'Your destination is not on any current shared route.',
      ROUTE_OVERLAP_TOO_LOW: 'No driver is travelling enough of your journey.',
    };

    return messages[reasons[0][0]] ?? 'No shared ride is available for your journey right now.';
  }
}
