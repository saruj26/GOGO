import { Injectable, Logger } from '@nestjs/common';
import {
  EarningStatus,
  ParcelStatus,
  PaymentMethod,
  Prisma,
  RoleCode,
  ServiceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { LatLng } from '../common/utils/geo';
import { DeliveryAssignmentService } from '../deliveries/delivery-assignment.service';
import { NOTIFICATION_TYPES } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PARCEL_AWAITING_COURIER, assertParcelTransition } from './parcel-order.state';
import { PARCEL_TRANSACTION_OPTIONS, ParcelsService } from './parcels.service';

/**
 * Courier-facing parcel work.
 *
 * A courier sees only what they need to do the job, and only for jobs that are
 * theirs. Every state change writes a tracking row, which is what the customer's
 * progress view reads.
 */
@Injectable()
export class ParcelDeliveryService {
  private readonly logger = new Logger(ParcelDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parcels: ParcelsService,
    private readonly assignment: DeliveryAssignmentService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Parcel jobs this courier could take.
   *
   * Filtered to vehicle classes they are actually driving, so a bike courier is
   * never shown a job needing a van.
   */
  async availableJobs(driverId: string) {
    if (!(await this.assignment.isCourierFree(driverId))) {
      throw new DomainError(
        DomainErrorCode.DRIVER_UNAVAILABLE,
        'Finish your current job before taking another.',
      );
    }

    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId },
      select: {
        acceptsParcel: true,
        presence: true,
        activeVehicle: { select: { vehicleTypeId: true } },
      },
    });

    if (!availability?.acceptsParcel || availability.presence === 'OFFLINE') {
      return [];
    }

    const jobs = await this.prisma.parcelOrder.findMany({
      where: {
        driverId: null,
        status: { in: PARCEL_AWAITING_COURIER },
        ...(availability.activeVehicle
          ? { vehicleTypeId: availability.activeVehicle.vehicleTypeId }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: {
        id: true,
        reference: true,
        status: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffAddress: true,
        distanceM: true,
        durationS: true,
        weightKg: true,
        scheduledFor: true,
        parcelType: { select: { code: true, name: true, requiresSignature: true } },
        fareQuote: { select: { driverNet: true, currency: true } },
      },
    });

    return jobs.map((job) => ({
      parcelId: job.id,
      reference: job.reference,
      parcelType: job.parcelType.name,
      requiresSignature: job.parcelType.requiresSignature,
      weightKg: job.weightKg?.toFixed(2) ?? null,
      // The full collection point is needed to decide whether to take the job.
      // The receiver's name and phone number are withheld until it is theirs.
      collectFrom: {
        address: job.pickupAddress,
        lat: Number(job.pickupLatitude),
        lng: Number(job.pickupLongitude),
      },
      deliverToArea: job.dropoffAddress,
      distanceM: job.distanceM,
      durationS: job.durationS,
      scheduledFor: job.scheduledFor,
      yourEarning: job.fareQuote?.driverNet.toFixed(2) ?? null,
      currency: job.fareQuote?.currency ?? 'LKR',
    }));
  }

  /**
   * A courier claims a parcel.
   *
   * The claim is one guarded UPDATE that only matches while the parcel is still
   * unassigned, so simultaneous claims resolve to exactly one winner.
   * `parcel_orders_one_active_per_driver` separately prevents a courier holding
   * two parcels at once.
   */
  async accept(driverId: string, parcelId: string, actorUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const availability = await tx.driverAvailability.findUnique({
        where: { driverId },
        select: {
          presence: true,
          acceptsParcel: true,
          activeVehicle: { select: { vehicleTypeId: true } },
        },
      });

      if (!availability?.acceptsParcel || availability.presence === 'OFFLINE') {
        throw new DomainError(
          DomainErrorCode.DRIVER_UNAVAILABLE,
          'Go online and enable parcel jobs before accepting.',
        );
      }

      const parcel = await tx.parcelOrder.findUnique({
        where: { id: parcelId },
        select: { vehicleTypeId: true, status: true },
      });

      if (!parcel) throw DomainError.notFound('Parcel');

      // The vehicle actually being driven must match the class booked.
      if (
        availability.activeVehicle &&
        availability.activeVehicle.vehicleTypeId !== parcel.vehicleTypeId
      ) {
        throw new DomainError(
          DomainErrorCode.PARCEL_VEHICLE_UNAVAILABLE,
          'This parcel needs a different vehicle class from the one you are driving.',
        );
      }

      assertParcelTransition(
        parcel.status as ParcelStatus,
        ParcelStatus.ASSIGNED,
        RoleCode.DRIVER,
      );

      // As with food: the partial unique index is the guarantee, this check is
      // what makes the refusal legible.
      if (!(await this.assignment.isCourierFree(driverId))) {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          'You are already on a job. Finish it before taking another.',
        );
      }

      const claimed = await tx.$executeRaw`
        UPDATE parcel_orders
        SET driver_id   = ${driverId}::uuid,
            status      = 'ASSIGNED',
            assigned_at = now()
        WHERE id = ${parcelId}::uuid
          AND driver_id IS NULL
          AND status IN ('PLACED', 'SEARCHING_DRIVER')
      `;

      if (claimed !== 1) {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          'Another courier has just taken this parcel.',
        );
      }

      const full = await tx.parcelOrder.findUniqueOrThrow({
        where: { id: parcelId },
        select: { id: true, userId: true, reference: true },
      });

      await this.parcels.recordTracking(tx, {
        parcelOrderId: parcelId,
        status: ParcelStatus.ASSIGNED,
        note: 'Courier assigned',
        actorUserId,
      });

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'parcel.accept',
          entityType: 'ParcelOrder',
          entityId: parcelId,
          newState: { driverId, status: ParcelStatus.ASSIGNED },
        },
        tx,
      );

      return full;
    }, PARCEL_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.userId,
      type: NOTIFICATION_TYPES.PARCEL_COURIER_ASSIGNED,
      title: 'Courier assigned',
      body: `A courier is coming to collect ${result.reference}.`,
      data: { parcelId },
      dedupeKey: `parcel.courier_assigned:${parcelId}`,
    });

    return { parcelId, status: ParcelStatus.ASSIGNED };
  }

  headingToPickup(driverId: string, parcelId: string, actorUserId: string, location?: LatLng) {
    return this.advance(driverId, parcelId, actorUserId, ParcelStatus.HEADING_TO_PICKUP, {
      note: 'Courier on the way to collect',
      location,
      notify: {
        type: NOTIFICATION_TYPES.PARCEL_COURIER_ARRIVING,
        title: 'Courier on the way',
        body: 'Your courier is heading to the collection point.',
      },
    });
  }

  confirmPickup(driverId: string, parcelId: string, actorUserId: string, location?: LatLng) {
    return this.advance(driverId, parcelId, actorUserId, ParcelStatus.PICKED_UP, {
      note: 'Parcel collected',
      location,
      timestampField: 'pickedUpAt',
      notify: {
        type: NOTIFICATION_TYPES.PARCEL_PICKED_UP,
        title: 'Parcel collected',
        body: 'Your parcel is with the courier.',
      },
    });
  }

  startTransit(driverId: string, parcelId: string, actorUserId: string, location?: LatLng) {
    return this.advance(driverId, parcelId, actorUserId, ParcelStatus.IN_TRANSIT, {
      note: 'In transit to the receiver',
      location,
      notify: {
        type: NOTIFICATION_TYPES.PARCEL_IN_TRANSIT,
        title: 'On the way',
        body: 'Your parcel is on its way to the receiver.',
      },
    });
  }

  /**
   * Delivery complete: settle the customer's payment, pay the courier, record
   * the commission — all from the quote agreed at booking.
   */
  async completeDelivery(
    driverId: string,
    parcelId: string,
    actorUserId: string,
    location?: LatLng,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const parcel = await this.parcels.lockParcel(tx, parcelId);
      this.assertOwnedByCourier(parcel.driver_id, driverId);

      assertParcelTransition(
        parcel.status as ParcelStatus,
        ParcelStatus.DELIVERED,
        RoleCode.DRIVER,
      );

      const full = await tx.parcelOrder.findUniqueOrThrow({
        where: { id: parcelId },
        select: {
          id: true,
          userId: true,
          reference: true,
          payment: { select: { id: true, method: true, status: true } },
          fareQuote: true,
        },
      });

      const now = new Date();

      await tx.parcelOrder.update({
        where: { id: parcelId },
        data: { status: ParcelStatus.DELIVERED, deliveredAt: now },
      });

      if (full.payment && full.payment.method === PaymentMethod.CASH) {
        await this.payments.settle(tx, full.payment.id, { actorUserId });
      }

      let courierNet = new Prisma.Decimal(0);

      if (full.fareQuote) {
        const quote = full.fareQuote;

        const earning = await tx.driverEarning.create({
          data: {
            driverId,
            serviceType: ServiceType.PARCEL,
            status: EarningStatus.AVAILABLE,
            parcelOrderId: parcelId,
            fareQuoteId: quote.id,
            grossAmount: quote.driverGross,
            commissionAmount: quote.platformCommission,
            stopFeeAmount: quote.driverStopFees,
            bonusAmount: quote.driverBonus,
            adjustmentAmount: new Prisma.Decimal(0),
            netAmount: quote.driverNet,
            currency: quote.currency,
          },
          select: { id: true },
        });

        await tx.platformCommission.create({
          data: {
            earningId: earning.id,
            serviceType: ServiceType.PARCEL,
            ratePct: quote.driverGross.isZero()
              ? new Prisma.Decimal(0)
              : quote.platformCommission
                  .dividedBy(quote.driverGross)
                  .times(100)
                  .toDecimalPlaces(2),
            amount: quote.platformCommission,
            currency: quote.currency,
          },
        });

        courierNet = quote.driverNet;
      } else {
        this.logger.error(
          `Parcel ${parcelId} was delivered without a fare quote — courier settlement skipped`,
        );
      }

      await this.parcels.recordTracking(tx, {
        parcelOrderId: parcelId,
        status: ParcelStatus.DELIVERED,
        note: 'Delivered to the receiver',
        actorUserId,
        location,
      });

      await tx.driver.update({
        where: { id: driverId },
        data: { completedTrips: { increment: 1 } },
      });

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'parcel.deliver',
          entityType: 'ParcelOrder',
          entityId: parcelId,
          previousState: { status: parcel.status },
          newState: {
            status: ParcelStatus.DELIVERED,
            courierNet: courierNet.toFixed(2),
          },
        },
        tx,
      );

      return { customerUserId: full.userId, reference: full.reference, courierNet };
    }, PARCEL_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.customerUserId,
      type: NOTIFICATION_TYPES.PARCEL_DELIVERED,
      title: 'Parcel delivered',
      body: `${result.reference} has been delivered.`,
      data: { parcelId },
      dedupeKey: `parcel.delivered:${parcelId}`,
    });

    return {
      parcelId,
      status: ParcelStatus.DELIVERED,
      yourEarning: result.courierNet.toFixed(2),
    };
  }

  /**
   * The courier could not complete the delivery.
   *
   * The parcel is marked FAILED rather than silently abandoned, and the payment
   * is left open for support to resolve — the courier is not the right party to
   * decide who is owed what.
   */
  async reportFailure(
    driverId: string,
    parcelId: string,
    actorUserId: string,
    reason: string,
    location?: LatLng,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.parcels.lockParcel(tx, parcelId);
      this.assertOwnedByCourier(parcel.driver_id, driverId);

      assertParcelTransition(parcel.status as ParcelStatus, ParcelStatus.FAILED, RoleCode.DRIVER);

      await tx.parcelOrder.update({
        where: { id: parcelId },
        data: { status: ParcelStatus.FAILED, cancellationReason: reason },
      });

      await this.parcels.recordTracking(tx, {
        parcelOrderId: parcelId,
        status: ParcelStatus.FAILED,
        note: reason,
        actorUserId,
        location,
      });

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'parcel.fail',
          entityType: 'ParcelOrder',
          entityId: parcelId,
          previousState: { status: parcel.status },
          newState: { status: ParcelStatus.FAILED, reason },
        },
        tx,
      );

      return { parcelId, status: ParcelStatus.FAILED };
    }, PARCEL_TRANSACTION_OPTIONS);
  }

  /**
   * A courier gives up a parcel they cannot collect.
   *
   * Only possible before collection. Afterwards the parcel is physically with
   * the courier and the honest outcome is a reported failure, not a release.
   */
  async release(driverId: string, parcelId: string, actorUserId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.parcels.lockParcel(tx, parcelId);
      this.assertOwnedByCourier(parcel.driver_id, driverId);

      assertParcelTransition(
        parcel.status as ParcelStatus,
        ParcelStatus.SEARCHING_DRIVER,
        RoleCode.DRIVER,
      );

      await tx.parcelOrder.update({
        where: { id: parcelId },
        data: { status: ParcelStatus.SEARCHING_DRIVER, driverId: null, assignedAt: null },
      });

      await this.parcels.recordTracking(tx, {
        parcelOrderId: parcelId,
        status: ParcelStatus.SEARCHING_DRIVER,
        note: reason ?? 'Courier released the job; finding another',
        actorUserId,
      });

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'parcel.release',
          entityType: 'ParcelOrder',
          entityId: parcelId,
          previousState: { driverId, status: parcel.status },
          newState: { driverId: null, status: ParcelStatus.SEARCHING_DRIVER, reason },
        },
        tx,
      );

      return { parcelId, status: ParcelStatus.SEARCHING_DRIVER };
    }, PARCEL_TRANSACTION_OPTIONS);
  }

  /** The courier's current parcel, with the details needed to complete it. */
  async currentJob(driverId: string) {
    const parcel = await this.prisma.parcelOrder.findFirst({
      where: {
        driverId,
        status: {
          in: [
            ParcelStatus.ASSIGNED,
            ParcelStatus.HEADING_TO_PICKUP,
            ParcelStatus.PICKED_UP,
            ParcelStatus.IN_TRANSIT,
          ],
        },
      },
      select: {
        id: true,
        reference: true,
        status: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        pickupContactName: true,
        pickupContactPhone: true,
        dropoffAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        receiverName: true,
        receiverPhone: true,
        weightKg: true,
        notes: true,
        distanceM: true,
        durationS: true,
        encodedPolyline: true,
        parcelType: { select: { name: true, requiresSignature: true } },
        payment: { select: { method: true, status: true, amount: true } },
        fareQuote: { select: { driverNet: true, currency: true } },
      },
    });

    if (!parcel) return null;

    const collectCash =
      parcel.payment?.method === PaymentMethod.CASH && parcel.payment.status !== 'PAID';

    return {
      parcelId: parcel.id,
      reference: parcel.reference,
      status: parcel.status,
      parcelType: parcel.parcelType.name,
      requiresSignature: parcel.parcelType.requiresSignature,
      weightKg: parcel.weightKg?.toFixed(2) ?? null,
      notes: parcel.notes,
      collectFrom: {
        name: parcel.pickupContactName,
        phone: parcel.pickupContactPhone,
        address: parcel.pickupAddress,
        lat: Number(parcel.pickupLatitude),
        lng: Number(parcel.pickupLongitude),
      },
      deliverTo: {
        name: parcel.receiverName,
        phone: parcel.receiverPhone,
        address: parcel.dropoffAddress,
        lat: Number(parcel.dropoffLatitude),
        lng: Number(parcel.dropoffLongitude),
      },
      cashToCollect: collectCash ? parcel.payment?.amount.toFixed(2) ?? null : null,
      yourEarning: parcel.fareQuote?.driverNet.toFixed(2) ?? null,
      currency: parcel.fareQuote?.currency ?? 'LKR',
      route: {
        distanceM: parcel.distanceM,
        durationS: parcel.durationS,
        polyline: parcel.encodedPolyline,
      },
    };
  }

  async history(driverId: string, pagination: CursorPaginationDto) {
    const rows = await this.prisma.parcelOrder.findMany({
      where: { driverId },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        status: true,
        assignedAt: true,
        deliveredAt: true,
        distanceM: true,
        fareQuote: { select: { driverNet: true, currency: true } },
      },
    });

    return buildCursorPage(rows, pagination.limit);
  }

  // ------------------------------------------------------------------ internals

  private async advance(
    driverId: string,
    parcelId: string,
    actorUserId: string,
    to: ParcelStatus,
    options: {
      note: string;
      location?: LatLng;
      timestampField?: 'pickedUpAt';
      notify?: { type: string; title: string; body: string };
    },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const parcel = await this.parcels.lockParcel(tx, parcelId);
      this.assertOwnedByCourier(parcel.driver_id, driverId);

      assertParcelTransition(parcel.status as ParcelStatus, to, RoleCode.DRIVER);

      await tx.parcelOrder.update({
        where: { id: parcelId },
        data: {
          status: to,
          ...(options.timestampField ? { [options.timestampField]: new Date() } : {}),
        },
      });

      await this.parcels.recordTracking(tx, {
        parcelOrderId: parcelId,
        status: to,
        note: options.note,
        actorUserId,
        location: options.location,
      });

      return { customerUserId: parcel.user_id, reference: parcel.reference };
    }, PARCEL_TRANSACTION_OPTIONS);

    if (options.notify) {
      await this.notifications.notify({
        userId: result.customerUserId,
        type: options.notify.type as never,
        title: options.notify.title,
        body: options.notify.body,
        data: { parcelId },
        dedupeKey: `${options.notify.type}:${parcelId}`,
      });
    }

    return { parcelId, status: to };
  }

  /** A parcel that is not this courier's simply does not resolve. */
  private assertOwnedByCourier(parcelDriverId: string | null, driverId: string): void {
    if (parcelDriverId !== driverId) {
      throw DomainError.notFound('Parcel');
    }
  }
}
