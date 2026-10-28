import { Injectable, Logger } from '@nestjs/common';
import {
  CancelledBy,
  DriverPresence,
  MatchRequestStatus,
  EarningStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  RideStatus,
  RidePassengerStatus,
  RideType,
  RoleCode,
  ServiceType,
  StopStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { shouldRedeem } from '../promotions/promotion-caps';
import { PromotionsService } from '../promotions/promotions.service';
import { NOTIFICATION_TYPES, NotificationType } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { REALTIME_EVENTS, RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { RoutingService } from '../routing/routing.service';
import { RidesRepository } from './rides.repository';
import { TRANSACTION_OPTIONS } from './rides.service';

/**
 * Legal ride state transitions. Anything not listed is rejected, so a client
 * cannot drive a ride into an impossible state by calling endpoints out of
 * order.
 */
const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  [RideStatus.DRAFT]: [RideStatus.SEARCHING, RideStatus.CANCELLED],
  [RideStatus.SEARCHING]: [RideStatus.ACCEPTED, RideStatus.CANCELLED, RideStatus.EXPIRED],
  [RideStatus.SCHEDULED]: [RideStatus.ACCEPTED, RideStatus.CANCELLED, RideStatus.EXPIRED],
  [RideStatus.ACCEPTED]: [RideStatus.DRIVER_ARRIVING, RideStatus.CANCELLED],
  [RideStatus.DRIVER_ARRIVING]: [RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED],
  [RideStatus.DRIVER_ARRIVED]: [RideStatus.IN_PROGRESS, RideStatus.CANCELLED],
  [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED, RideStatus.CANCELLED],
  [RideStatus.COMPLETED]: [],
  [RideStatus.CANCELLED]: [],
  [RideStatus.EXPIRED]: [],
};

/** Which ride statuses are worth pushing to a connected client. */
const RIDE_STATUS_EVENTS: Partial<Record<RideStatus, RealtimeEvent>> = {
  [RideStatus.ACCEPTED]: REALTIME_EVENTS.RIDE_DRIVER_ASSIGNED,
  [RideStatus.DRIVER_ARRIVING]: REALTIME_EVENTS.RIDE_DRIVER_ARRIVING,
  [RideStatus.DRIVER_ARRIVED]: REALTIME_EVENTS.RIDE_DRIVER_ARRIVED,
  [RideStatus.IN_PROGRESS]: REALTIME_EVENTS.RIDE_STARTED,
  [RideStatus.COMPLETED]: REALTIME_EVENTS.RIDE_COMPLETED,
  [RideStatus.CANCELLED]: REALTIME_EVENTS.RIDE_CANCELLED,
};

/**
 * Which statuses are worth interrupting somebody for.
 *
 * Not every transition is: a passenger does not need a notification saying the
 * ride they are sitting in has started, but they very much need one saying the
 * driver is outside.
 */
const RIDE_STATUS_NOTIFICATIONS: Partial<
  Record<RideStatus, { type: NotificationType; title: string; body: string }>
> = {
  [RideStatus.ACCEPTED]: {
    type: NOTIFICATION_TYPES.RIDE_DRIVER_ASSIGNED,
    title: 'Driver assigned',
    body: 'A driver has accepted your ride and is on the way.',
  },
  [RideStatus.DRIVER_ARRIVING]: {
    type: NOTIFICATION_TYPES.RIDE_DRIVER_ARRIVING,
    title: 'Driver on the way',
    body: 'Your driver is heading to the pick-up point.',
  },
  [RideStatus.DRIVER_ARRIVED]: {
    type: NOTIFICATION_TYPES.RIDE_DRIVER_ARRIVED,
    title: 'Your driver has arrived',
    body: 'Your driver is waiting at the pick-up point.',
  },
  [RideStatus.COMPLETED]: {
    type: NOTIFICATION_TYPES.RIDE_COMPLETED,
    title: 'Trip complete',
    body: 'Thanks for riding with us.',
  },
};

@Injectable()
export class RideLifecycleService {
  private readonly logger = new Logger(RideLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RidesRepository,
    private readonly routing: RoutingService,
    private readonly audit: AuditService,
    private readonly promotions: PromotionsService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A driver takes the ride.
   *
   * `rides_one_active_per_driver` — a partial unique index — guarantees a
   * driver cannot end up holding two live rides even if two accept requests
   * arrive simultaneously; the loser gets a conflict rather than a double
   * booking.
   */
  async accept(driverId: string, rideId: string, actorUserId: string) {
    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId },
      select: { presence: true, activeVehicleId: true, acceptsShared: true },
    });

    if (!availability || availability.presence === DriverPresence.OFFLINE) {
      throw new DomainError(
        DomainErrorCode.DRIVER_UNAVAILABLE,
        'Go online before accepting rides.',
      );
    }

    if (!availability.activeVehicleId) {
      throw new DomainError(
        DomainErrorCode.DRIVER_UNAVAILABLE,
        'Select the vehicle you are driving before accepting rides.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const ride = await this.repository.lockRide(tx, rideId);
        if (!ride) throw DomainError.notFound('Ride');

        this.assertTransition(ride.status, RideStatus.ACCEPTED);

        if (ride.driver_id && ride.driver_id !== driverId) {
          throw DomainError.conflict(
            DomainErrorCode.CONFLICT,
            'Another driver has already accepted this ride.',
          );
        }

        const driver = await tx.driver.findUnique({
          where: { id: driverId },
          select: { sharedRideOptIn: true, approvalStatus: true },
        });

        if (!driver || driver.approvalStatus !== 'APPROVED') {
          throw DomainError.forbidden('Your driver account is not approved.');
        }

        // A shared ride only becomes joinable once a real driver and a real
        // route exist — before that there is nothing for the matching engine to
        // measure against.
        const joinable =
          ride.ride_type === RideType.SHARED &&
          driver.sharedRideOptIn &&
          availability.acceptsShared;

        await tx.ride.update({
          where: { id: rideId },
          data: {
            driverId,
            vehicleId: availability.activeVehicleId,
            status: RideStatus.ACCEPTED,
            acceptedAt: new Date(),
            joinable,
          },
        });

        await tx.driverAvailability.update({
          where: { driverId },
          data: { presence: DriverPresence.ON_TRIP },
        });

        await this.recordStatus(tx, rideId, ride.status, RideStatus.ACCEPTED, actorUserId, RoleCode.DRIVER);

        await tx.ridePassenger.updateMany({
          where: { rideId, status: RidePassengerStatus.CONFIRMED },
          data: { status: RidePassengerStatus.AWAITING_PICKUP },
        });

        await this.audit.record(
          {
            actorUserId,
            actorRole: RoleCode.DRIVER,
            action: 'ride.accept',
            entityType: 'Ride',
            entityId: rideId,
            previousState: { status: ride.status, driverId: ride.driver_id },
            newState: { status: RideStatus.ACCEPTED, driverId, joinable },
          },
          tx,
        );

        return { rideId, status: RideStatus.ACCEPTED, joinable };
      }, TRANSACTION_OPTIONS).then(async (result) => {
        // Accepting does not go through `transition`, because it has its own
        // guards and its own unique-index failure to translate. It still has to
        // announce itself: a driver being assigned is the moment the passenger
        // has been waiting for, and it is the one they most need to hear about.
        this.announce(rideId, RideStatus.ACCEPTED);
        await this.notifyPassengers(rideId, RideStatus.ACCEPTED);
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        `${String(error.meta?.target ?? '')} ${error.message}`.includes(
          'rides_one_active_per_driver',
        )
      ) {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          'You already have an active ride. Complete it before accepting another.',
        );
      }
      throw error;
    }
  }

  async markArriving(rideId: string, actorUserId: string) {
    return this.transition(rideId, RideStatus.DRIVER_ARRIVING, actorUserId, RoleCode.DRIVER);
  }

  async markArrived(rideId: string, actorUserId: string) {
    return this.transition(rideId, RideStatus.DRIVER_ARRIVED, actorUserId, RoleCode.DRIVER);
  }

  async start(rideId: string, actorUserId: string) {
    return this.transition(rideId, RideStatus.IN_PROGRESS, actorUserId, RoleCode.DRIVER, {
      startedAt: new Date(),
    });
  }

  /**
   * Completes the ride and settles it.
   *
   * Each passenger's payment and each driver earning is written from that
   * passenger's own persisted FareQuote — the amounts were fixed when the quote
   * was created and are not recomputed here, so a pricing change mid-trip
   * cannot alter what someone was quoted.
   */
  async complete(rideId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const ride = await this.repository.lockRide(tx, rideId);
      if (!ride) throw DomainError.notFound('Ride');

      this.assertTransition(ride.status, RideStatus.COMPLETED);

      if (!ride.driver_id) {
        throw new DomainError(
          DomainErrorCode.INVALID_RIDE_STATE,
          'This ride has no assigned driver.',
        );
      }

      const passengers = await tx.ridePassenger.findMany({
        where: {
          rideId,
          status: {
            in: [
              RidePassengerStatus.ONBOARD,
              RidePassengerStatus.AWAITING_PICKUP,
              RidePassengerStatus.CONFIRMED,
            ],
          },
        },
        include: { fareQuote: true, payment: true },
      });

      const now = new Date();
      let driverNetTotal = new Prisma.Decimal(0);
      let commissionTotal = new Prisma.Decimal(0);

      for (const passenger of passengers) {
        await tx.ridePassenger.update({
          where: { id: passenger.id },
          data: { status: RidePassengerStatus.DROPPED_OFF, droppedOffAt: now },
        });

        const quote = passenger.fareQuote;
        if (!quote) {
          this.logger.error(
            `Passenger ${passenger.id} completed without a fare quote — settlement skipped`,
          );
          continue;
        }

        // --- passenger side ---
        if (passenger.payment) {
          const settledStatus =
            passenger.payment.method === PaymentMethod.CASH
              ? PaymentStatus.PAID
              : passenger.payment.status;

          await tx.payment.update({
            where: { id: passenger.payment.id },
            data: { status: settledStatus, paidAt: now },
          });

          await tx.paymentTransaction.create({
            data: {
              paymentId: passenger.payment.id,
              type: PaymentTransactionType.CHARGE,
              status: settledStatus,
              amount: quote.passengerTotal,
              currency: quote.currency,
            },
          });
        }

        // --- driver side, computed independently of the above ---
        const earning = await tx.driverEarning.create({
          data: {
            driverId: ride.driver_id,
            serviceType: quote.isShared ? ServiceType.SHARED_RIDE : ServiceType.RIDE,
            status: EarningStatus.AVAILABLE,
            rideId,
            ridePassengerId: passenger.id,
            fareQuoteId: quote.id,
            grossAmount: quote.driverGross,
            commissionAmount: quote.platformCommission,
            stopFeeAmount: quote.driverStopFees,
            bonusAmount: quote.driverBonus,
            adjustmentAmount: new Prisma.Decimal(0),
            netAmount: quote.driverNet,
            currency: quote.currency,
            isSharedIncrement: passenger.isSharedJoin,
          },
          select: { id: true },
        });

        await tx.platformCommission.create({
          data: {
            earningId: earning.id,
            serviceType: quote.isShared ? ServiceType.SHARED_RIDE : ServiceType.RIDE,
            ratePct: quote.driverGross.isZero()
              ? new Prisma.Decimal(0)
              : quote.platformCommission.dividedBy(quote.driverGross).times(100).toDecimalPlaces(2),
            amount: quote.platformCommission,
            currency: quote.currency,
          },
        });

        // --- promotion, redeemed only now that the ride actually happened ---
        //
        // Rides quote a discount at booking but the promotion is not consumed
        // until the trip completes, so a cancelled or expired ride gives the
        // code back. Food and parcel redeem at order time because those orders
        // are committed the moment they are placed.
        //
        // `promotion_redemptions` carries UNIQUE(promotion, referenceType,
        // referenceId) keyed on the passenger leg, so re-running settlement
        // cannot redeem twice, and each passenger on a shared ride redeems
        // their own code independently.
        if (shouldRedeem(quote.promotionId, quote.discountTotal)) {
          await this.promotions.redeem(tx, {
            promotionId: quote.promotionId as string,
            userId: passenger.userId,
            referenceType: 'RIDE_PASSENGER',
            referenceId: passenger.id,
            amount: quote.discountTotal,
          });
        }

        driverNetTotal = driverNetTotal.plus(quote.driverNet);
        commissionTotal = commissionTotal.plus(quote.platformCommission);
      }

      // A request still waiting on the driver when the ride ends never
      // happened. Closing it here keeps the passenger out of a state that
      // nothing would ever resolve.
      const abandoned = await tx.ridePassenger.findMany({
        where: { rideId, status: RidePassengerStatus.OFFERED },
        select: { id: true, seatsRequested: true },
      });

      for (const pending of abandoned) {
        await tx.ridePassenger.update({
          where: { id: pending.id },
          data: {
            status: RidePassengerStatus.REJECTED,
            cancelledAt: now,
            cancellationReason: 'The ride finished before the driver responded',
          },
        });

        await this.repository.releaseSeats(tx, rideId, pending.seatsRequested);
      }

      if (abandoned.length > 0) {
        await tx.sharedRideMatchRequest.updateMany({
          where: { matchedRidePassengerId: { in: abandoned.map((p) => p.id) } },
          data: { status: MatchRequestStatus.EXPIRED, matchedRidePassengerId: null },
        });
      }

      await tx.rideStop.updateMany({
        where: { rideId, status: StopStatus.PENDING },
        data: { status: StopStatus.COMPLETED, completedAt: now },
      });

      await tx.ride.update({
        where: { id: rideId },
        data: { status: RideStatus.COMPLETED, completedAt: now, joinable: false },
      });

      await tx.driver.update({
        where: { id: ride.driver_id },
        data: { completedTrips: { increment: 1 } },
      });

      await tx.driverAvailability.update({
        where: { driverId: ride.driver_id },
        data: { presence: DriverPresence.ONLINE },
      });

      await this.recordStatus(tx, rideId, ride.status, RideStatus.COMPLETED, actorUserId, RoleCode.DRIVER);

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'ride.complete',
          entityType: 'Ride',
          entityId: rideId,
          previousState: { status: ride.status },
          newState: {
            status: RideStatus.COMPLETED,
            passengersSettled: passengers.length,
            driverNetTotal: driverNetTotal.toFixed(2),
            platformCommissionTotal: commissionTotal.toFixed(2),
          },
        },
        tx,
      );

      return {
        rideId,
        status: RideStatus.COMPLETED,
        passengersSettled: passengers.length,
        driverNetTotal: driverNetTotal.toFixed(2),
      };
    }, TRANSACTION_OPTIONS).then(async (result) => {
      this.announce(rideId, RideStatus.COMPLETED);
      await this.notifyPassengers(rideId, RideStatus.COMPLETED);
      return result;
    });
  }

  /**
   * Cancels a whole ride, or withdraws a single passenger from a shared one.
   *
   * Withdrawing one passenger from a shared ride releases their seats and
   * re-opens capacity; it does not cancel the journey for anybody else.
   */
  async cancel(params: {
    rideId: string;
    actorUserId: string;
    actorRole: RoleCode;
    cancelledBy: CancelledBy;
    reason?: string;
    /** When set, only this passenger withdraws. */
    ridePassengerId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const ride = await this.repository.lockRide(tx, params.rideId);
      if (!ride) throw DomainError.notFound('Ride');

      if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
        throw new DomainError(
          DomainErrorCode.CANCELLATION_NOT_ALLOWED,
          'This ride can no longer be cancelled.',
        );
      }

      const now = new Date();

      if (params.ridePassengerId) {
        const passenger = await tx.ridePassenger.findUnique({
          where: { id: params.ridePassengerId },
          select: { id: true, rideId: true, userId: true, seatsRequested: true, status: true },
        });

        if (!passenger || passenger.rideId !== params.rideId) {
          throw DomainError.notFound('Passenger');
        }

        if (
          params.actorRole === RoleCode.USER &&
          passenger.userId !== params.actorUserId
        ) {
          throw DomainError.forbidden();
        }

        if (passenger.status === RidePassengerStatus.CANCELLED) {
          return { rideId: params.rideId, cancelled: 'passenger', alreadyCancelled: true };
        }

        await tx.ridePassenger.update({
          where: { id: passenger.id },
          data: {
            status: RidePassengerStatus.CANCELLED,
            cancelledAt: now,
            cancelledBy: params.cancelledBy,
            cancellationReason: params.reason,
          },
        });

        await tx.rideStop.updateMany({
          where: { ridePassengerId: passenger.id, status: StopStatus.PENDING },
          data: { status: StopStatus.SKIPPED },
        });

        await this.repository.releaseSeats(tx, params.rideId, passenger.seatsRequested);

        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            actorRole: params.actorRole,
            action: 'ride.passenger.cancel',
            entityType: 'RidePassenger',
            entityId: passenger.id,
            previousState: { status: passenger.status },
            newState: { status: RidePassengerStatus.CANCELLED, reason: params.reason },
          },
          tx,
        );

        const remaining = await tx.ridePassenger.count({
          where: {
            rideId: params.rideId,
            status: {
              in: [
                RidePassengerStatus.CONFIRMED,
                RidePassengerStatus.AWAITING_PICKUP,
                RidePassengerStatus.ONBOARD,
              ],
            },
          },
        });

        // The last passenger leaving ends the ride.
        if (remaining === 0) {
          await this.cancelWholeRide(tx, params, ride.status, now);
          return { rideId: params.rideId, cancelled: 'ride' as const };
        }

        return { rideId: params.rideId, cancelled: 'passenger' as const };
      }

      await this.cancelWholeRide(tx, params, ride.status, now);
      return { rideId: params.rideId, cancelled: 'ride' as const };
    }, TRANSACTION_OPTIONS);
  }

  private async cancelWholeRide(
    tx: Prisma.TransactionClient,
    params: {
      rideId: string;
      actorUserId: string;
      actorRole: RoleCode;
      cancelledBy: CancelledBy;
      reason?: string;
    },
    previousStatus: RideStatus,
    now: Date,
  ): Promise<void> {
    await tx.ridePassenger.updateMany({
      where: {
        rideId: params.rideId,
        status: {
          notIn: [
            RidePassengerStatus.CANCELLED,
            RidePassengerStatus.DROPPED_OFF,
            RidePassengerStatus.REJECTED,
          ],
        },
      },
      data: {
        status: RidePassengerStatus.CANCELLED,
        cancelledAt: now,
        cancelledBy: params.cancelledBy,
        cancellationReason: params.reason,
      },
    });

    await tx.rideStop.updateMany({
      where: { rideId: params.rideId, status: StopStatus.PENDING },
      data: { status: StopStatus.SKIPPED },
    });

    await tx.payment.updateMany({
      where: {
        ridePassenger: { rideId: params.rideId },
        status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] },
      },
      data: { status: PaymentStatus.CANCELLED },
    });

    const ride = await tx.ride.update({
      where: { id: params.rideId },
      data: {
        status: RideStatus.CANCELLED,
        cancelledAt: now,
        cancelledBy: params.cancelledBy,
        cancellationReason: params.reason,
        joinable: false,
      },
      select: { driverId: true },
    });

    if (ride.driverId) {
      await tx.driverAvailability.updateMany({
        where: { driverId: ride.driverId, presence: DriverPresence.ON_TRIP },
        data: { presence: DriverPresence.ONLINE },
      });

      if (params.cancelledBy === CancelledBy.DRIVER) {
        await tx.driver.update({
          where: { id: ride.driverId },
          data: { cancelledTrips: { increment: 1 } },
        });
      }
    }

    await this.recordStatus(
      tx,
      params.rideId,
      previousStatus,
      RideStatus.CANCELLED,
      params.actorUserId,
      params.actorRole,
      params.reason,
    );

    await this.audit.record(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'ride.cancel',
        entityType: 'Ride',
        entityId: params.rideId,
        previousState: { status: previousStatus },
        newState: { status: RideStatus.CANCELLED, cancelledBy: params.cancelledBy },
      },
      tx,
    );
  }

  private async transition(
    rideId: string,
    to: RideStatus,
    actorUserId: string,
    actorRole: RoleCode,
    extra: Prisma.RideUpdateInput = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ride = await this.repository.lockRide(tx, rideId);
      if (!ride) throw DomainError.notFound('Ride');

      this.assertTransition(ride.status, to);

      await tx.ride.update({ where: { id: rideId }, data: { status: to, ...extra } });

      if (to === RideStatus.IN_PROGRESS) {
        await tx.ridePassenger.updateMany({
          where: { rideId, status: RidePassengerStatus.AWAITING_PICKUP },
          data: { status: RidePassengerStatus.ONBOARD, boardedAt: new Date() },
        });
      }

      await this.recordStatus(tx, rideId, ride.status, to, actorUserId, actorRole);

      return { rideId, status: to };
    }, TRANSACTION_OPTIONS)
      // After commit, deliberately. Announcing inside the transaction would
      // tell a passenger the driver had arrived and then, on a rollback, be
      // wrong — and a client that re-reads on the event would still see the
      // old row.
      .then(async (result) => {
        this.announce(rideId, to);
        await this.notifyPassengers(rideId, to);
        return result;
      });
  }

  /** The realtime event that corresponds to a ride status. */
  private announce(rideId: string, to: RideStatus): void {
    const event = RIDE_STATUS_EVENTS[to];
    if (event) this.realtime.toRide(rideId, event, { status: to });
  }

  /**
   * Tells the passengers on a ride that it moved.
   *
   * Best-effort and outside the transaction: a notification that fails to write
   * must not undo a driver's arrival. The dedupe key is derived from the ride
   * and the status, so a retried transition produces one notification.
   */
  private async notifyPassengers(rideId: string, to: RideStatus): Promise<void> {
    const copy = RIDE_STATUS_NOTIFICATIONS[to];
    if (!copy) return;

    try {
      const passengers = await this.prisma.ridePassenger.findMany({
        where: {
          rideId,
          status: {
            in: [
              RidePassengerStatus.CONFIRMED,
              RidePassengerStatus.AWAITING_PICKUP,
              RidePassengerStatus.ONBOARD,
              RidePassengerStatus.DROPPED_OFF,
            ],
          },
        },
        select: { userId: true },
      });

      await this.notifications.notifyMany(
        passengers.map((passenger) => ({
          userId: passenger.userId,
          type: copy.type,
          title: copy.title,
          body: copy.body,
          data: { rideId },
          dedupeKey: `ride.${to}:${rideId}:${passenger.userId}`,
        })),
      );
    } catch (error) {
      this.logger.warn(
        `Could not notify passengers of ride ${rideId} reaching ${to}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private assertTransition(from: RideStatus, to: RideStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new DomainError(
        DomainErrorCode.INVALID_RIDE_STATE,
        `A ride that is ${from.toLowerCase().replace(/_/g, ' ')} cannot move to ${to
          .toLowerCase()
          .replace(/_/g, ' ')}.`,
      );
    }
  }

  private async recordStatus(
    tx: Prisma.TransactionClient,
    rideId: string,
    from: RideStatus,
    to: RideStatus,
    actorUserId: string,
    actorRole: RoleCode,
    reason?: string,
  ): Promise<void> {
    await tx.rideStatusHistory.create({
      data: { rideId, fromStatus: from, toStatus: to, actorUserId, actorRole, reason },
    });
  }
}
