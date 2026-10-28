import { Prisma, PricingRule, ServiceType } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service';
import { FareComponentCode } from '../pricing/pricing.types';

const D = (v: string | number) => new Prisma.Decimal(v);

/**
 * Parcel pricing reuses the shared engine rather than duplicating it. These
 * tests pin the behaviour that matters for parcels specifically: surcharges are
 * additive, are never multiplied by demand pricing, are never swallowed by the
 * minimum fare, and the sender's charge and the courier's pay stay separate.
 */
function parcelRule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'parcel-rule-1',
    serviceType: ServiceType.PARCEL,
    vehicleTypeId: null,
    version: 1,
    active: true,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    currency: 'LKR',

    baseFare: D(150),
    perKmFare: D(40),
    perMinuteFare: D(2),
    minimumFare: D(220),
    bookingFee: D(0),
    waitingPerMinuteFee: D(3),
    freeWaitingMinutes: 5,
    sharedDiscountPct: D(0),
    maxPassengerDiscountPct: D(50),
    serviceFeePct: D(0),
    taxPct: D(0),
    cancellationFee: D(80),
    freeCancellationSeconds: 120,

    platformCommissionPct: D(18),
    sharedPassengerDriverSharePct: D(0),
    additionalStopFee: D(0),
    minimumDriverEarning: D(0),

    createdByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PricingRule;
}

describe('parcel pricing', () => {
  const pricing = new PricingService(null as never, null as never);
  const noSurge = D(1);

  const TEN_KM = 10_000;
  const TWENTY_MIN = 1_200;

  const baseInput = {
    serviceType: ServiceType.PARCEL,
    vehicleTypeId: null,
    distanceM: TEN_KM,
    durationS: TWENTY_MIN,
    isShared: false,
  };

  it('prices distance and time from the parcel rule', () => {
    const quote = pricing.calculate(parcelRule(), baseInput, noSurge);

    // 150 base + (10 km × 40) + (20 min × 2) = 590
    expect(quote.grossFare.toFixed(2)).toBe('590.00');
    expect(quote.passengerTotal.toFixed(2)).toBe('590.00');
  });

  it('adds a weight surcharge to the charge', () => {
    const quote = pricing.calculate(
      parcelRule(),
      {
        ...baseInput,
        surcharges: [{ label: 'Weight surcharge', amount: D(120) }],
      },
      noSurge,
    );

    expect(quote.grossFare.toFixed(2)).toBe('710.00');
    const line = quote.components.find((c) => c.code === FareComponentCode.SURCHARGE);
    expect(line?.amount.toFixed(2)).toBe('120.00');
  });

  it('adds several surcharges independently', () => {
    const quote = pricing.calculate(
      parcelRule(),
      {
        ...baseInput,
        surcharges: [
          { label: 'Weight surcharge', amount: D(120) },
          { label: 'Signature on delivery', amount: D(50) },
        ],
      },
      noSurge,
    );

    expect(quote.grossFare.toFixed(2)).toBe('760.00');
    expect(quote.components.filter((c) => c.code === FareComponentCode.SURCHARGE)).toHaveLength(2);
  });

  it('does not multiply a surcharge by demand pricing', () => {
    const surged = pricing.calculate(
      parcelRule(),
      { ...baseInput, surcharges: [{ label: 'Weight surcharge', amount: D(100) }] },
      D('2'),
    );

    // metered 590 doubles to 1180; the surcharge stays at 100.
    expect(surged.grossFare.toFixed(2)).toBe('1280.00');
  });

  it('does not let the minimum fare swallow a surcharge', () => {
    const quote = pricing.calculate(
      parcelRule({ minimumFare: D(500) }),
      {
        ...baseInput,
        distanceM: 500,
        durationS: 120,
        surcharges: [{ label: 'Weight surcharge', amount: D(80) }],
      },
      noSurge,
    );

    // The short journey is lifted to the 500 minimum, then the surcharge is
    // added on top — a heavy parcel on a short trip still costs more.
    expect(quote.grossFare.toFixed(2)).toBe('580.00');
  });

  it('ignores a zero or negative surcharge', () => {
    const quote = pricing.calculate(
      parcelRule(),
      {
        ...baseInput,
        surcharges: [
          { label: 'Nothing', amount: D(0) },
          { label: 'Nonsense', amount: D(-50) },
        ],
      },
      noSurge,
    );

    expect(quote.grossFare.toFixed(2)).toBe('590.00');
    expect(quote.components.filter((c) => c.code === FareComponentCode.SURCHARGE)).toHaveLength(0);
  });

  it('keeps the sender’s charge and the courier’s pay separate', () => {
    const quote = pricing.calculate(
      parcelRule(),
      { ...baseInput, surcharges: [{ label: 'Weight surcharge', amount: D(120) }] },
      noSurge,
    );

    expect(quote.passengerTotal.toFixed(2)).toBe('710.00');
    expect(quote.platformCommission.toFixed(2)).toBe('127.80'); // 18% of 710
    expect(quote.driverNet.toFixed(2)).toBe('582.20');
    expect(quote.driverNet.equals(quote.passengerTotal)).toBe(false);
  });

  it('pays the courier on the surcharge too — a heavier parcel is more work', () => {
    const light = pricing.calculate(parcelRule(), baseInput, noSurge);
    const heavy = pricing.calculate(
      parcelRule(),
      { ...baseInput, surcharges: [{ label: 'Weight surcharge', amount: D(200) }] },
      noSurge,
    );

    expect(heavy.driverNet.greaterThan(light.driverNet)).toBe(true);
  });

  it('reconciles both sides, as the database constraints require', () => {
    const quote = pricing.calculate(
      parcelRule({ serviceFeePct: D(5), taxPct: D(8), minimumDriverEarning: D(300) }),
      {
        ...baseInput,
        surcharges: [
          { label: 'Weight surcharge', amount: D(120) },
          { label: 'Signature on delivery', amount: D(50) },
        ],
      },
      D('1.3'),
    );

    expect(quote.passengerTotal.toFixed(2)).toBe(
      quote.grossFare.minus(quote.discountTotal).plus(quote.serviceFee).plus(quote.taxTotal).toFixed(2),
    );
    expect(quote.driverNet.toFixed(2)).toBe(
      quote.driverGross
        .minus(quote.platformCommission)
        .plus(quote.driverStopFees)
        .plus(quote.driverBonus)
        .toFixed(2),
    );
  });

  it('leaves a fare with no surcharges completely unchanged', () => {
    const withEmptyList = pricing.calculate(parcelRule(), { ...baseInput, surcharges: [] }, noSurge);
    const withoutField = pricing.calculate(parcelRule(), baseInput, noSurge);

    expect(withEmptyList.grossFare.toFixed(2)).toBe(withoutField.grossFare.toFixed(2));
    expect(withEmptyList.components).toHaveLength(withoutField.components.length);
  });
});
