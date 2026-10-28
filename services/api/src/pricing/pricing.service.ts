import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PricingRule, PromotionType, ServiceType } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import {
  Money,
  ZERO,
  minMoney,
  money,
  nonNegative,
  percentOf,
  round2,
  sum,
} from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import {
  FareBreakdown,
  FareComponent,
  FareComponentCode,
  FareInput,
} from './pricing.types';

/**
 * The single place any money is calculated.
 *
 * Two rules govern everything here:
 *
 *  1. The PASSENGER CHARGE and the DRIVER EARNING are computed independently
 *     from the same rule version. Neither is derived from the other, so a
 *     discount given to a passenger never silently reduces a driver's pay and a
 *     driver bonus never silently inflates a passenger's bill.
 *
 *  2. Every component is rounded to 2dp as it is produced, and totals are the
 *     sum of already-rounded components. The database CHECK constraints
 *     `fare_quotes_passenger_total_reconciles` and
 *     `fare_quotes_driver_net_reconciles` reject any quote where that fails.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Resolves the rule to price against, most specific first:
   *   service + vehicle type → service (any vehicle) → RIDE + vehicle type →
   *   RIDE (any vehicle)
   * The RIDE fallbacks let an operator run shared rides without maintaining a
   * separate rule set until they want to.
   */
  async resolveRule(serviceType: ServiceType, vehicleTypeId: string | null): Promise<PricingRule> {
    const candidates: Array<{ serviceType: ServiceType; vehicleTypeId: string | null }> = [
      { serviceType, vehicleTypeId },
      { serviceType, vehicleTypeId: null },
    ];

    if (serviceType === ServiceType.SHARED_RIDE) {
      candidates.push({ serviceType: ServiceType.RIDE, vehicleTypeId });
      candidates.push({ serviceType: ServiceType.RIDE, vehicleTypeId: null });
    }

    for (const candidate of candidates) {
      const rule = await this.prisma.pricingRule.findFirst({
        where: {
          serviceType: candidate.serviceType,
          vehicleTypeId: candidate.vehicleTypeId,
          active: true,
          effectiveTo: null,
          effectiveFrom: { lte: new Date() },
        },
        orderBy: { version: 'desc' },
      });
      if (rule) return rule;
    }

    throw new DomainError(
      DomainErrorCode.PRICING_RULE_MISSING,
      'Pricing is not configured for this service. Please try a different vehicle or contact support.',
      undefined,
      { serviceType },
    );
  }

  async quote(input: FareInput): Promise<FareBreakdown> {
    const rule = await this.resolveRule(input.serviceType, input.vehicleTypeId);
    const surge = await this.resolveSurge(input.surgeMultiplier);
    return this.calculate(rule, input, surge);
  }

  /**
   * Pure function over an explicit rule — no I/O, so it is directly unit
   * testable and reproducible from an archived rule version.
   */
  calculate(rule: PricingRule, input: FareInput, surgeMultiplier: Prisma.Decimal): FareBreakdown {
    const components: FareComponent[] = [];
    const km = new Prisma.Decimal(input.distanceM).dividedBy(1000);
    const minutes = new Prisma.Decimal(input.durationS).dividedBy(60);
    const waitingMinutes = Math.max(0, input.waitingMinutes ?? 0);
    const additionalStops = Math.max(0, input.additionalStops ?? 0);

    // ---------------------------------------------------------------- metered
    const baseFare = round2(rule.baseFare);
    const distanceFare = round2(new Prisma.Decimal(rule.perKmFare).times(km));
    const timeFare = round2(new Prisma.Decimal(rule.perMinuteFare).times(minutes));

    const chargeableWaiting = Math.max(0, waitingMinutes - rule.freeWaitingMinutes);
    const waitingFee = round2(new Prisma.Decimal(rule.waitingPerMinuteFee).times(chargeableWaiting));
    const stopFee = round2(new Prisma.Decimal(rule.additionalStopFee).times(additionalStops));

    components.push(
      this.component(FareComponentCode.BASE_FARE, 'Base fare', 'PASSENGER', baseFare),
      this.component(FareComponentCode.DISTANCE_FARE, 'Distance', 'PASSENGER', distanceFare, {
        distanceKm: km.toFixed(3),
        perKm: rule.perKmFare.toFixed(2),
      }),
      this.component(FareComponentCode.TIME_FARE, 'Travel time', 'PASSENGER', timeFare, {
        minutes: minutes.toFixed(2),
        perMinute: rule.perMinuteFare.toFixed(2),
      }),
    );

    if (waitingFee.greaterThan(0)) {
      components.push(
        this.component(FareComponentCode.WAITING_FEE, 'Waiting time', 'PASSENGER', waitingFee, {
          chargeableMinutes: chargeableWaiting,
          freeMinutes: rule.freeWaitingMinutes,
        }),
      );
    }
    if (stopFee.greaterThan(0)) {
      components.push(
        this.component(
          FareComponentCode.ADDITIONAL_STOP_FEE,
          'Additional stops',
          'PASSENGER',
          stopFee,
          { stops: additionalStops },
        ),
      );
    }

    const metered = sum([baseFare, distanceFare, timeFare, waitingFee, stopFee]);

    // ----------------------------------------------------------------- surge
    let surgeAdjustment = ZERO;
    if (surgeMultiplier.greaterThan(1)) {
      surgeAdjustment = round2(metered.times(surgeMultiplier.minus(1)));
      components.push(
        this.component(
          FareComponentCode.SURGE_ADJUSTMENT,
          'Demand adjustment',
          'PASSENGER',
          surgeAdjustment,
          { multiplier: surgeMultiplier.toFixed(2) },
        ),
      );
    }

    // ---------------------------------------------------------- minimum fare
    const afterSurge = metered.plus(surgeAdjustment);
    let minimumTopUp = ZERO;
    if (afterSurge.lessThan(rule.minimumFare)) {
      minimumTopUp = round2(new Prisma.Decimal(rule.minimumFare).minus(afterSurge));
      components.push(
        this.component(
          FareComponentCode.MINIMUM_FARE_TOP_UP,
          'Minimum fare adjustment',
          'PASSENGER',
          minimumTopUp,
          { minimumFare: rule.minimumFare.toFixed(2) },
        ),
      );
    }

    const bookingFee = round2(rule.bookingFee);
    if (bookingFee.greaterThan(0)) {
      components.push(
        this.component(FareComponentCode.BOOKING_FEE, 'Booking fee', 'PASSENGER', bookingFee),
      );
    }

    // Service-specific additions — a parcel's weight, a required signature.
    // Deliberately applied after surge and after the minimum-fare floor, so a
    // surcharge is never multiplied by demand pricing nor swallowed by the
    // minimum.
    let surchargeTotal = ZERO;
    for (const surcharge of input.surcharges ?? []) {
      const amount = round2(surcharge.amount);
      if (amount.lessThanOrEqualTo(0)) continue;

      surchargeTotal = surchargeTotal.plus(amount);
      components.push(
        this.component(
          FareComponentCode.SURCHARGE,
          surcharge.label,
          'PASSENGER',
          amount,
          surcharge.detail,
        ),
      );
    }

    const grossFare = sum([afterSurge, minimumTopUp, bookingFee, surchargeTotal]);

    // ------------------------------------------------------------- discounts
    let sharedDiscount = ZERO;
    if (input.isShared && rule.sharedDiscountPct.greaterThan(0)) {
      sharedDiscount = percentOf(grossFare, rule.sharedDiscountPct);
      components.push(
        this.component(
          FareComponentCode.SHARED_RIDE_DISCOUNT,
          'Shared ride saving',
          'PASSENGER',
          sharedDiscount.negated(),
          { percent: rule.sharedDiscountPct.toFixed(2) },
        ),
      );
    }

    let promotionDiscount = ZERO;
    let promotionId: string | null = null;
    const promo = input.promotion;
    if (promo) {
      const eligibleBase = nonNegative(grossFare.minus(sharedDiscount));
      if (eligibleBase.greaterThanOrEqualTo(promo.minOrderAmount)) {
        promotionDiscount =
          promo.type === PromotionType.PERCENT
            ? percentOf(eligibleBase, promo.value)
            : round2(promo.value);
        if (promo.maxDiscount) {
          promotionDiscount = minMoney(promotionDiscount, round2(promo.maxDiscount));
        }
        promotionDiscount = minMoney(promotionDiscount, eligibleBase);
        promotionId = promo.id;
        components.push(
          this.component(
            FareComponentCode.PROMOTION_DISCOUNT,
            `Promotion ${promo.code}`,
            'PASSENGER',
            promotionDiscount.negated(),
            { code: promo.code },
          ),
        );
      }
    }

    // The configured cap is a hard ceiling: no combination of shared saving and
    // promotion may discount a fare beyond it.
    let discountTotal = sum([sharedDiscount, promotionDiscount]);
    const discountCeiling = percentOf(grossFare, rule.maxPassengerDiscountPct);
    if (discountTotal.greaterThan(discountCeiling)) {
      const clawback = round2(discountTotal.minus(discountCeiling));
      components.push(
        this.component(
          FareComponentCode.DISCOUNT_CAP_ADJUSTMENT,
          'Maximum discount applied',
          'PASSENGER',
          clawback,
          { capPercent: rule.maxPassengerDiscountPct.toFixed(2) },
        ),
      );
      discountTotal = discountCeiling;
    }

    // ------------------------------------------------------------ fees & tax
    const netOfDiscount = nonNegative(grossFare.minus(discountTotal));
    const serviceFee = percentOf(netOfDiscount, rule.serviceFeePct);
    if (serviceFee.greaterThan(0)) {
      components.push(
        this.component(FareComponentCode.SERVICE_FEE, 'Service fee', 'PASSENGER', serviceFee, {
          percent: rule.serviceFeePct.toFixed(2),
        }),
      );
    }

    const taxTotal = percentOf(netOfDiscount.plus(serviceFee), rule.taxPct);
    if (taxTotal.greaterThan(0)) {
      components.push(
        this.component(FareComponentCode.TAX, 'Tax', 'PASSENGER', taxTotal, {
          percent: rule.taxPct.toFixed(2),
        }),
      );
    }

    const passengerTotal = grossFare.minus(discountTotal).plus(serviceFee).plus(taxTotal);

    // ---------------------------------------------------------- driver side
    //
    // The driver earns on the METERED fare, not on what the passenger finally
    // pays: promotional discounts are a platform marketing cost and the service
    // fee and tax are never the driver's revenue.
    const driverGross = grossFare;

    // A passenger joining an existing route is priced differently for the
    // driver: they were making this journey anyway, so the configured
    // shared-passenger share replaces the standard commission split.
    const isSharedJoin = input.isSharedJoin === true;
    const commissionPct = isSharedJoin
      ? new Prisma.Decimal(100).minus(rule.sharedPassengerDriverSharePct)
      : new Prisma.Decimal(rule.platformCommissionPct);

    const platformCommission = percentOf(driverGross, commissionPct);
    const driverStopFees = round2(
      new Prisma.Decimal(rule.additionalStopFee).times(additionalStops),
    );

    components.push(
      this.component(
        FareComponentCode.DRIVER_GROSS,
        'Driver gross earning',
        'DRIVER',
        driverGross,
      ),
      this.component(
        FareComponentCode.PLATFORM_COMMISSION,
        'Platform commission',
        'DRIVER',
        platformCommission.negated(),
        {
          percent: commissionPct.toFixed(2),
          basis: isSharedJoin ? 'shared_passenger_share' : 'standard_commission',
        },
      ),
    );

    if (driverStopFees.greaterThan(0)) {
      components.push(
        this.component(
          FareComponentCode.DRIVER_STOP_FEE,
          'Additional stop payment',
          'DRIVER',
          driverStopFees,
          { stops: additionalStops },
        ),
      );
    }

    let driverBonus = ZERO;
    let driverNet = driverGross.minus(platformCommission).plus(driverStopFees);

    if (driverNet.lessThan(rule.minimumDriverEarning)) {
      driverBonus = round2(new Prisma.Decimal(rule.minimumDriverEarning).minus(driverNet));
      driverNet = driverNet.plus(driverBonus);
      components.push(
        this.component(
          FareComponentCode.DRIVER_MINIMUM_TOP_UP,
          'Minimum earning top-up',
          'DRIVER',
          driverBonus,
          { minimum: rule.minimumDriverEarning.toFixed(2) },
        ),
      );
    }

    return {
      pricingRuleId: rule.id,
      pricingRuleVersion: rule.version,
      currency: rule.currency,
      distanceM: input.distanceM,
      durationS: input.durationS,
      waitingMinutes,
      additionalStops,
      surgeMultiplier,
      isShared: input.isShared,

      grossFare,
      discountTotal,
      promotionId,
      serviceFee,
      taxTotal,
      passengerTotal,

      driverGross,
      platformCommission,
      driverStopFees,
      driverBonus,
      driverNet,

      components,
      inputs: {
        serviceType: input.serviceType,
        vehicleTypeId: input.vehicleTypeId,
        distanceM: input.distanceM,
        durationS: input.durationS,
        isShared: input.isShared,
        isSharedJoin,
        waitingMinutes,
        additionalStops,
        surgeMultiplier: surgeMultiplier.toFixed(2),
        promotionCode: promo?.code ?? null,
      },
    };
  }

  /** Persists a breakdown as an immutable quote row. */
  async persistQuote(
    tx: Prisma.TransactionClient,
    breakdown: FareBreakdown,
    ttlSeconds: number,
  ): Promise<string> {
    const quote = await tx.fareQuote.create({
      data: {
        serviceType: (breakdown.inputs.serviceType as ServiceType) ?? ServiceType.RIDE,
        pricingRuleId: breakdown.pricingRuleId,
        pricingRuleVersion: breakdown.pricingRuleVersion,
        currency: breakdown.currency,
        distanceM: breakdown.distanceM,
        durationS: breakdown.durationS,
        waitingMinutes: breakdown.waitingMinutes,
        additionalStops: breakdown.additionalStops,
        surgeMultiplier: breakdown.surgeMultiplier,
        isShared: breakdown.isShared,
        grossFare: breakdown.grossFare,
        discountTotal: breakdown.discountTotal,
        promotionId: breakdown.promotionId,
        serviceFee: breakdown.serviceFee,
        taxTotal: breakdown.taxTotal,
        passengerTotal: breakdown.passengerTotal,
        driverGross: breakdown.driverGross,
        platformCommission: breakdown.platformCommission,
        driverStopFees: breakdown.driverStopFees,
        driverBonus: breakdown.driverBonus,
        driverNet: breakdown.driverNet,
        components: breakdown.components.map((c) => ({
          code: c.code,
          label: c.label,
          side: c.side,
          amount: c.amount.toFixed(2),
          detail: c.detail ?? null,
        })) as Prisma.InputJsonValue,
        inputs: breakdown.inputs as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
      select: { id: true },
    });

    return quote.id;
  }

  private async resolveSurge(requested?: number): Promise<Prisma.Decimal> {
    const enabled = await this.settings.getBoolean(SETTING_KEYS.SURGE_ENABLED);
    if (!enabled) {
      return new Prisma.Decimal(1);
    }
    const max = await this.settings.getNumber(SETTING_KEYS.SURGE_MAX_MULTIPLIER);
    const value = new Prisma.Decimal(requested ?? 1);
    if (value.lessThan(1)) return new Prisma.Decimal(1);
    return value.greaterThan(max) ? new Prisma.Decimal(max) : value;
  }

  private component(
    code: FareComponentCode,
    label: string,
    side: 'PASSENGER' | 'DRIVER',
    amount: Money,
    detail?: Record<string, string | number>,
  ): FareComponent {
    return { code, label, side, amount: round2(amount), detail };
  }
}
