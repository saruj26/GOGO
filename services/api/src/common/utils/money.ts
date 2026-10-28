import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

/**
 * Money is exact decimal arithmetic — never IEEE floating point.
 *
 * ROUNDING POLICY: every stored monetary component is rounded to 2 decimal
 * places at the moment it is produced, and totals are computed by summing the
 * ALREADY-ROUNDED components. Rounding the total independently would break the
 * `fare_quotes_passenger_total_reconciles` and `driver_earnings_net_reconciles`
 * CHECK constraints, which is exactly the failure mode those constraints exist
 * to catch.
 */
export const DECIMAL_PLACES = 2;

export function money(value: Prisma.Decimal.Value): Money {
  return new Prisma.Decimal(value);
}

export const ZERO: Money = money(0);

/** Round half-up (away from zero) to 2dp — the convention used for LKR retail. */
export function round2(value: Prisma.Decimal.Value): Money {
  return new Prisma.Decimal(value).toDecimalPlaces(DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: readonly Money[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(v), money(0));
}

/** `percentOf(1000, 15)` → 150.00 */
export function percentOf(amount: Prisma.Decimal.Value, percent: Prisma.Decimal.Value): Money {
  return round2(new Prisma.Decimal(amount).times(new Prisma.Decimal(percent)).dividedBy(100));
}

export function maxMoney(a: Money, b: Money): Money {
  return a.greaterThan(b) ? a : b;
}

export function minMoney(a: Money, b: Money): Money {
  return a.lessThan(b) ? a : b;
}

/** Clamps to zero — used wherever a discount must not create a negative charge. */
export function nonNegative(value: Money): Money {
  return value.isNegative() ? money(0) : value;
}
