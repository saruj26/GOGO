import { Injectable, Logger } from '@nestjs/common';
import {
  CancelledBy,
  ParcelStatus,
  PaymentMethod,
  Prisma,
  RoleCode,
  ServiceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { LatLng } from '../common/utils/geo';
import { Money, money, round2 } from '../common/utils/money';
import { NOTIFICATION_TYPES } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../payments/wallet.service';
import { PricingService } from '../pricing/pricing.service';
import { FareBreakdown, FareSurcharge } from '../pricing/pricing.types';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { RoutingService } from '../routing/routing.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import { CreateParcelDto, EstimateParcelDto } from './dto/parcels.dto';
import { assertParcelTransition } from './parcel-order.state';

export const PARCEL_TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

export interface ParcelQuote {
  vehicleTypeId: string;
  vehicleTypeCode: string;
  vehicleTypeName: string;
  distanceM: number;
  durationS: number;
  etaMinutes: number;
  currency: string;
  total: string;
  breakdown: Array<{ code: string; label: string; amount: string }>;
}

@Injectable()
export class ParcelsService {
  private readonly logger = new Logger(ParcelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly promotions: PromotionsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** The parcel classes a customer can choose from. */
  async parcelTypes() {
    const types = await this.prisma.parcelType.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        maxWeightKg: true,
        maxLengthCm: true,
        minVehicleTypeCode: true,
        requiresSignature: true,
      },
    });

    return types.map((type) => ({ ...type, maxWeightKg: type.maxWeightKg.toFixed(2) }));
  }

  /**
   * Prices a parcel journey for every vehicle class that can legally carry it.
   *
   * Compatibility is decided here, not by the client: a 60 kg parcel is simply
   * not offered a bike, whatever the request asks for.
   */
  async estimate(dto: EstimateParcelDto): Promise<ParcelQuote[]> {
    const parcelType = await this.loadParcelType(dto.parcelTypeId);
    this.assertWeightWithinType(parcelType, dto.weightKg);

    const eligible = await this.eligibleVehicleTypes(parcelType, dto.weightKg);

    if (eligible.length === 0) {
      throw new DomainError(
        DomainErrorCode.PARCEL_VEHICLE_UNAVAILABLE,
        'No vehicle class on the platform can carry a parcel of that size and weight.',
      );
    }

    const candidates = dto.vehicleTypeId
      ? eligible.filter((v) => v.id === dto.vehicleTypeId)
      : eligible;

    if (candidates.length === 0) {
      throw new DomainError(
        DomainErrorCode.PARCEL_VEHICLE_UNAVAILABLE,
        'That vehicle class cannot carry this parcel.',
      );
    }

    const route = await this.routeFor(dto.pickup, dto.dropoff);
    const surcharges = await this.surchargesFor(parcelType, dto.weightKg);

    const quotes: ParcelQuote[] = [];
    for (const vehicleType of candidates) {
      const fare = await this.pricing.quote({
        serviceType: ServiceType.PARCEL,
        vehicleTypeId: vehicleType.id,
        distanceM: route.distanceM,
        durationS: route.durationS,
        isShared: false,
        surcharges,
      });

      quotes.push({
        vehicleTypeId: vehicleType.id,
        vehicleTypeCode: vehicleType.code,
        vehicleTypeName: vehicleType.name,
        distanceM: route.distanceM,
        durationS: route.durationS,
        etaMinutes: Math.max(1, Math.round(route.durationS / 60)),
        currency: fare.currency,
        total: fare.passengerTotal.toFixed(2),
        breakdown: fare.components
          .filter((c) => c.side === 'PASSENGER')
          .map((c) => ({ code: c.code, label: c.label, amount: c.amount.toFixed(2) })),
      });
    }

    return quotes;
  }

  /**
   * Books a parcel.
   *
   * As with food, the client sends no price. Distance comes from the routing
   * provider, the fare from the versioned pricing rule, and surcharges from
   * admin settings — all server-side.
   */
  async create(userId: string, dto: CreateParcelDto) {
    this.payments.assertMethodSupported(dto.paymentMethod);

    const parcelType = await this.loadParcelType(dto.parcelTypeId);
    this.assertWeightWithinType(parcelType, dto.weightKg);

    const maxDeclared = await this.settings.getNumber(SETTING_KEYS.PARCEL_MAX_DECLARED_VALUE);
    if (dto.declaredValue !== undefined && dto.declaredValue > maxDeclared) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `Parcels declared above ${maxDeclared} must be arranged with support.`,
      );
    }

    const eligible = await this.eligibleVehicleTypes(parcelType, dto.weightKg);
    const vehicleType = eligible.find((v) => v.id === dto.vehicleTypeId);

    if (!vehicleType) {
      throw new DomainError(
        DomainErrorCode.PARCEL_VEHICLE_UNAVAILABLE,
        'That vehicle class cannot carry this parcel. Please choose another.',
      );
    }

    const scheduledFor = await this.validateSchedule(dto.scheduledFor);

    // Routed and priced before the transaction opens: no external call is made
    // while a lock is held.
    const route = await this.routeFor(dto.pickup, dto.dropoff);
    const surcharges = await this.surchargesFor(parcelType, dto.weightKg);

    const promotion = await this.promotions.resolve(
      dto.promotionCode,
      userId,
      ServiceType.PARCEL,
    );

    const fare = await this.pricing.quote({
      serviceType: ServiceType.PARCEL,
      vehicleTypeId: vehicleType.id,
      distanceM: route.distanceM,
      durationS: route.durationS,
      isShared: false,
      surcharges,
      promotion,
    });

    const quoteTtlS = await this.settings.getNumber(SETTING_KEYS.QUOTE_TTL_SECONDS);

    const created = await this.prisma.$transaction(async (tx) => {
      const fareQuoteId = await this.pricing.persistQuote(tx, fare, quoteTtlS);

      const parcel = await tx.parcelOrder.create({
        data: {
          reference: parcelReference(),
          userId,
          parcelTypeId: parcelType.id,
          vehicleTypeId: vehicleType.id,
          status: ParcelStatus.PLACED,
          pickupAddress: dto.pickup.address,
          pickupLatitude: dto.pickup.lat,
          pickupLongitude: dto.pickup.lng,
          pickupContactName: dto.pickup.contactName,
          pickupContactPhone: dto.pickup.contactPhone,
          dropoffAddress: dto.dropoff.address,
          dropoffLatitude: dto.dropoff.lat,
          dropoffLongitude: dto.dropoff.lng,
          receiverName: dto.dropoff.contactName,
          receiverPhone: dto.dropoff.contactPhone,
          weightKg: dto.weightKg,
          declaredValue: dto.declaredValue,
          notes: dto.notes,
          distanceM: route.distanceM,
          durationS: route.durationS,
          encodedPolyline: route.encodedPolyline,
          scheduledFor,
          fareQuoteId,
        },
        select: { id: true, reference: true, status: true },
      });

      const payment = await this.payments.createPending(tx, {
        userId,
        serviceType: ServiceType.PARCEL,
        method: dto.paymentMethod,
        amount: fare.passengerTotal,
        currency: fare.currency,
        idempotencyKey: `parcel:${parcel.id}`,
      });

      if (dto.paymentMethod === PaymentMethod.WALLET) {
        await this.wallet.debit(tx, userId, fare.passengerTotal, {
          type: 'PARCEL_ORDER',
          id: parcel.id,
          description: `Parcel ${parcel.reference}`,
        });
        await this.payments.settle(tx, payment.id, { actorUserId: userId });
      }

      if (promotion && fare.discountTotal.greaterThan(0)) {
        await this.promotions.redeem(tx, {
          promotionId: promotion.id,
          userId,
          referenceType: 'PARCEL_ORDER',
          referenceId: parcel.id,
          amount: fare.discountTotal,
        });
      }

      await tx.parcelOrder.update({
        where: { id: parcel.id },
        data: { paymentId: payment.id },
      });

      await this.recordTracking(tx, {
        parcelOrderId: parcel.id,
        status: ParcelStatus.PLACED,
        note: 'Booking created',
        actorUserId: userId,
      });

      await this.audit.record(
        {
          actorUserId: userId,
          actorRole: RoleCode.USER,
          action: 'parcel.create',
          entityType: 'ParcelOrder',
          entityId: parcel.id,
          newState: {
            parcelType: parcelType.code,
            vehicleType: vehicleType.code,
            distanceM: route.distanceM,
            total: fare.passengerTotal.toFixed(2),
            courierNet: fare.driverNet.toFixed(2),
            platformCommission: fare.platformCommission.toFixed(2),
            paymentMethod: dto.paymentMethod,
            pricingRuleVersion: fare.pricingRuleVersion,
          },
        },
        tx,
      );

      return parcel;
    }, PARCEL_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId,
      type: NOTIFICATION_TYPES.PARCEL_BOOKED,
      title: 'Parcel booked',
      body: `We are finding a courier for ${created.reference}.`,
      data: { parcelId: created.id, reference: created.reference },
      dedupeKey: `parcel.booked:${created.id}`,
    });

    return {
      parcelId: created.id,
      reference: created.reference,
      status: created.status,
      charge: this.publicCharge(fare),
      route: {
        distanceM: route.distanceM,
        durationS: route.durationS,
        polyline: route.encodedPolyline,
      },
      scheduledFor,
    };
  }

  /**
   * Customer cancellation.
   *
   * Permitted until the courier has the parcel — after collection there is a
   * physical object in somebody's hands and cancelling is not a thing the
   * system can do.
   */
  async cancel(userId: string, parcelId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.lockParcel(tx, parcelId);

      if (parcel.user_id !== userId) {
        throw DomainError.notFound('Parcel');
      }

      assertParcelTransition(
        parcel.status as ParcelStatus,
        ParcelStatus.CANCELLED,
        RoleCode.USER,
      );

      const full = await tx.parcelOrder.findUniqueOrThrow({
        where: { id: parcelId },
        select: {
          reference: true,
          paymentId: true,
          payment: { select: { id: true, method: true, status: true, amount: true } },
        },
      });

      await tx.parcelOrder.update({
        where: { id: parcelId },
        data: {
          status: ParcelStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: CancelledBy.USER,
          cancellationReason: reason,
          // Releases the courier slot so the partial unique index does not hold
          // a driver who no longer has work.
          driverId: null,
        },
      });

      if (full.payment) {
        await this.payments.cancel(tx, full.payment.id, reason ?? 'Parcel cancelled');

        if (full.payment.method === PaymentMethod.WALLET && full.payment.status === 'PAID') {
          await this.wallet.credit(tx, userId, full.payment.amount, {
            type: 'PARCEL_REFUND',
            id: parcelId,
            description: `Refund for cancelled parcel ${full.reference}`,
          });
        }
      }

      await this.recordTracking(tx, {
        parcelOrderId: parcelId,
        status: ParcelStatus.CANCELLED,
        note: reason ?? 'Cancelled by customer',
        actorUserId: userId,
      });

      await this.audit.record(
        {
          actorUserId: userId,
          actorRole: RoleCode.USER,
          action: 'parcel.cancel',
          entityType: 'ParcelOrder',
          entityId: parcelId,
          previousState: { status: parcel.status },
          newState: { status: ParcelStatus.CANCELLED },
        },
        tx,
      );

      await this.notifications.notify(
        {
          userId,
          type: NOTIFICATION_TYPES.PARCEL_CANCELLED,
          title: 'Parcel cancelled',
          body: `${full.reference} has been cancelled.`,
          data: { parcelId },
          dedupeKey: `parcel.cancelled:${parcelId}`,
        },
        tx,
      );

      return { parcelId, status: ParcelStatus.CANCELLED };
    }, PARCEL_TRANSACTION_OPTIONS);
  }

  // ------------------------------------------------------------------ helpers

  async lockParcel(
    tx: Prisma.TransactionClient,
    parcelId: string,
  ): Promise<{
    id: string;
    user_id: string;
    status: string;
    driver_id: string | null;
    reference: string;
  }> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        status: string;
        driver_id: string | null;
        reference: string;
      }>
    >`
      SELECT id, user_id, status::text AS status, driver_id, reference
      FROM parcel_orders
      WHERE id = ${parcelId}::uuid
      FOR UPDATE
    `;

    const parcel = rows[0];
    if (!parcel) throw DomainError.notFound('Parcel');
    return parcel;
  }

  async recordTracking(
    tx: Prisma.TransactionClient,
    params: {
      parcelOrderId: string;
      status: ParcelStatus;
      note?: string;
      actorUserId?: string | null;
      location?: LatLng | null;
    },
  ): Promise<void> {
    await tx.parcelTracking.create({
      data: {
        parcelOrderId: params.parcelOrderId,
        status: params.status,
        note: params.note,
        actorUserId: params.actorUserId ?? null,
        latitude: params.location?.lat,
        longitude: params.location?.lng,
      },
    });
  }

  private async loadParcelType(parcelTypeId: string) {
    const parcelType = await this.prisma.parcelType.findFirst({
      where: { id: parcelTypeId, active: true },
    });

    if (!parcelType) throw DomainError.notFound('Parcel type');
    return parcelType;
  }

  private assertWeightWithinType(
    parcelType: { name: string; maxWeightKg: Prisma.Decimal },
    weightKg?: number,
  ): void {
    if (weightKg === undefined) return;

    if (new Prisma.Decimal(weightKg).greaterThan(parcelType.maxWeightKg)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `${parcelType.name} covers parcels up to ${parcelType.maxWeightKg.toFixed(
          2,
        )} kg. Choose a larger class.`,
      );
    }
  }

  /**
   * Vehicle classes that can carry this parcel.
   *
   * A class qualifies when it is parcel-eligible, is at least the parcel class's
   * minimum (ordered by the same `sortOrder` the customer sees), and its own
   * weight limit covers the declared weight.
   */
  private async eligibleVehicleTypes(
    parcelType: { minVehicleTypeCode: string | null },
    weightKg?: number,
  ) {
    const vehicleTypes = await this.prisma.vehicleType.findMany({
      where: { active: true, parcelEligible: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        sortOrder: true,
        maxParcelWeightKg: true,
      },
    });

    const minimum = parcelType.minVehicleTypeCode
      ? vehicleTypes.find((v) => v.code === parcelType.minVehicleTypeCode)
      : undefined;

    return vehicleTypes.filter((vehicleType) => {
      if (minimum && vehicleType.sortOrder < minimum.sortOrder) return false;

      if (weightKg !== undefined && vehicleType.maxParcelWeightKg) {
        if (new Prisma.Decimal(weightKg).greaterThan(vehicleType.maxParcelWeightKg)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Weight and signature surcharges, both configurable and both zero by
   * default — an operator who does not charge for weight simply leaves the
   * setting alone.
   */
  private async surchargesFor(
    parcelType: { requiresSignature: boolean },
    weightKg?: number,
  ): Promise<FareSurcharge[]> {
    const [freeWeightKg, perKg, signatureFee] = await Promise.all([
      this.settings.getNumber(SETTING_KEYS.PARCEL_FREE_WEIGHT_KG),
      this.settings.getNumber(SETTING_KEYS.PARCEL_WEIGHT_SURCHARGE_PER_KG),
      this.settings.getNumber(SETTING_KEYS.PARCEL_SIGNATURE_SURCHARGE),
    ]);

    const surcharges: FareSurcharge[] = [];

    if (weightKg !== undefined && perKg > 0 && weightKg > freeWeightKg) {
      // Charged per whole kilogram over the included allowance.
      const chargeableKg = Math.ceil(weightKg - freeWeightKg);
      surcharges.push({
        label: 'Weight surcharge',
        amount: round2(new Prisma.Decimal(perKg).times(chargeableKg)),
        detail: { chargeableKg, includedKg: freeWeightKg, perKg },
      });
    }

    if (parcelType.requiresSignature && signatureFee > 0) {
      surcharges.push({
        label: 'Signature on delivery',
        amount: round2(signatureFee),
      });
    }

    return surcharges;
  }

  private async routeFor(pickup: LatLng, dropoff: LatLng) {
    return this.routing.route({
      waypoints: [
        { lat: pickup.lat, lng: pickup.lng },
        { lat: dropoff.lat, lng: dropoff.lng },
      ],
    });
  }

  private async validateSchedule(iso?: string): Promise<Date | null> {
    if (!iso) return null;

    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invalid collection time');
    }

    const maxDaysAhead = await this.settings.getNumber(SETTING_KEYS.SCHEDULING_MAX_DAYS_AHEAD);
    const latest = new Date(Date.now() + maxDaysAhead * 86_400_000);

    if (when < new Date()) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'A collection time cannot be in the past',
      );
    }
    if (when > latest) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `Collections can be booked up to ${maxDaysAhead} days ahead`,
      );
    }

    return when;
  }

  /** Only the customer's side of the money — never the courier's or the platform's. */
  private publicCharge(fare: FareBreakdown) {
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
}

/** Human-facing parcel reference, e.g. PC-4M8XQ2. */
function parcelReference(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `PC-${suffix}`;
}
