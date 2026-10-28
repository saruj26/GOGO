import { Prisma, PromotionType, ServiceType } from '@prisma/client';
import { Money } from '../common/utils/money';

/** Stable identifiers for fare components — the audit trail keys off these. */
export enum FareComponentCode {
  BASE_FARE = 'BASE_FARE',
  DISTANCE_FARE = 'DISTANCE_FARE',
  TIME_FARE = 'TIME_FARE',
  WAITING_FEE = 'WAITING_FEE',
  ADDITIONAL_STOP_FEE = 'ADDITIONAL_STOP_FEE',
  SURGE_ADJUSTMENT = 'SURGE_ADJUSTMENT',
  MINIMUM_FARE_TOP_UP = 'MINIMUM_FARE_TOP_UP',
  BOOKING_FEE = 'BOOKING_FEE',
  SURCHARGE = 'SURCHARGE',
  SHARED_RIDE_DISCOUNT = 'SHARED_RIDE_DISCOUNT',
  PROMOTION_DISCOUNT = 'PROMOTION_DISCOUNT',
  DISCOUNT_CAP_ADJUSTMENT = 'DISCOUNT_CAP_ADJUSTMENT',
  SERVICE_FEE = 'SERVICE_FEE',
  TAX = 'TAX',
  DRIVER_GROSS = 'DRIVER_GROSS',
  PLATFORM_COMMISSION = 'PLATFORM_COMMISSION',
  DRIVER_STOP_FEE = 'DRIVER_STOP_FEE',
  DRIVER_MINIMUM_TOP_UP = 'DRIVER_MINIMUM_TOP_UP',
}

export type FareComponentSide = 'PASSENGER' | 'DRIVER';

export interface FareComponent {
  code: FareComponentCode;
  label: string;
  side: FareComponentSide;
  /** Signed: negative for discounts and for the commission deducted. */
  amount: Money;
  /** Inputs that produced this line, for dispute resolution. */
  detail?: Record<string, string | number>;
}

export interface PromotionInput {
  id: string;
  code: string;
  type: PromotionType;
  value: Prisma.Decimal;
  maxDiscount: Prisma.Decimal | null;
  minOrderAmount: Prisma.Decimal;
}

/**
 * A service-specific addition to the metered fare — a parcel's weight, a
 * signature requirement, and so on.
 *
 * Surcharges are supplied by the calling module rather than modelled in
 * `pricing_rules`, because what warrants one differs per service line. They are
 * added to the gross fare after demand pricing and the minimum-fare floor, so
 * they are never multiplied by surge and never absorbed by the minimum.
 */
export interface FareSurcharge {
  label: string;
  amount: Prisma.Decimal;
  detail?: Record<string, string | number>;
}

export interface FareInput {
  serviceType: ServiceType;
  vehicleTypeId: string | null;
  distanceM: number;
  durationS: number;
  /** True when this passenger is riding as part of a shared ride. */
  isShared: boolean;
  /**
   * True when this passenger JOINED an already-planned route. Their driver
   * earning is computed from the shared-passenger share rather than from the
   * standard commission, because the driver was making this journey anyway.
   */
  isSharedJoin?: boolean;
  waitingMinutes?: number;
  /** Extra stops this passenger causes the driver to serve. */
  additionalStops?: number;
  surgeMultiplier?: number;
  promotion?: PromotionInput | null;
  surcharges?: FareSurcharge[];
}

export interface FareBreakdown {
  pricingRuleId: string;
  pricingRuleVersion: number;
  currency: string;
  distanceM: number;
  durationS: number;
  waitingMinutes: number;
  additionalStops: number;
  surgeMultiplier: Prisma.Decimal;
  isShared: boolean;

  // passenger side
  grossFare: Money;
  discountTotal: Money;
  promotionId: string | null;
  serviceFee: Money;
  taxTotal: Money;
  passengerTotal: Money;

  // driver side — derived independently of the passenger total
  driverGross: Money;
  platformCommission: Money;
  driverStopFees: Money;
  driverBonus: Money;
  driverNet: Money;

  components: FareComponent[];
  inputs: Record<string, unknown>;
}
