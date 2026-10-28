import { Prisma, PricingRule, PromotionType, ServiceType } from '@prisma/client';
import { PricingService } from './pricing.service';
import { FareComponentCode } from './pricing.types';

const D = (v: string | number) => new Prisma.Decimal(v);

/**
 * `calculate` is a pure function over an explicit rule, so these tests need no
 * database and no settings service — exactly the property that makes fare
 * disputes reproducible from an archived rule version.
 */
function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'rule-1',
    serviceType: ServiceType.RIDE,
    vehicleTypeId: 'vt-car',
    version: 1,
    active: true,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    currency: 'LKR',

    baseFare: D(150),
    perKmFare: D(60),
    perMinuteFare: D(4),
    minimumFare: D(300),
    bookingFee: D(0),
    waitingPerMinuteFee: D(5),
    freeWaitingMinutes: 5,
    sharedDiscountPct: D(0),
    maxPassengerDiscountPct: D(50),
    serviceFeePct: D(0),
    taxPct: D(0),
    cancellationFee: D(100),
    freeCancellationSeconds: 120,

    platformCommissionPct: D(20),
    sharedPassengerDriverSharePct: D(0),
    additionalStopFee: D(0),
    minimumDriverEarning: D(0),

    createdByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PricingRule;
}

describe('pricing engine', () => {
  // The service is exercised through its pure method; the constructor
  // dependencies are only used by the I/O paths, which are covered elsewhere.
  const pricing = new PricingService(null as never, null as never);
  const noSurge = D(1);

  const TEN_KM = 10_000;
  const TWENTY_MIN = 1_200;

  describe('solo ride fare', () => {
    it('charges base plus distance plus time', () => {
      const q = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
        },
        noSurge,
      );

      // 150 base + (10km × 60) + (20min × 4) = 830
      expect(q.grossFare.toFixed(2)).toBe('830.00');
      expect(q.passengerTotal.toFixed(2)).toBe('830.00');
    });

    it('applies the minimum fare to a very short trip', () => {
      const q = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: 500,
          durationS: 120,
          isShared: false,
        },
        noSurge,
      );

      expect(q.grossFare.toFixed(2)).toBe('300.00');
      expect(q.components.map((c) => c.code)).toContain(FareComponentCode.MINIMUM_FARE_TOP_UP);
    });

    it('charges waiting time only beyond the free allowance', () => {
      const q = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
          waitingMinutes: 12,
        },
        noSurge,
      );

      // 7 chargeable minutes × 5 = 35
      const waiting = q.components.find((c) => c.code === FareComponentCode.WAITING_FEE);
      expect(waiting?.amount.toFixed(2)).toBe('35.00');
      expect(q.grossFare.toFixed(2)).toBe('865.00');
    });

    it('applies a demand multiplier to the metered fare only', () => {
      const q = pricing.calculate(
        rule({ bookingFee: D(50) }),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
        },
        D('1.5'),
      );

      // metered 830 → surge adds 415; booking fee is not multiplied.
      const surge = q.components.find((c) => c.code === FareComponentCode.SURGE_ADJUSTMENT);
      expect(surge?.amount.toFixed(2)).toBe('415.00');
      expect(q.grossFare.toFixed(2)).toBe('1295.00');
    });
  });

  describe('driver earnings are computed separately from the passenger charge', () => {
    it('deducts commission from the driver’s gross, not from the passenger', () => {
      const q = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
        },
        noSurge,
      );

      expect(q.passengerTotal.toFixed(2)).toBe('830.00');
      expect(q.driverGross.toFixed(2)).toBe('830.00');
      expect(q.platformCommission.toFixed(2)).toBe('166.00'); // 20%
      expect(q.driverNet.toFixed(2)).toBe('664.00');
      expect(q.driverNet.equals(q.passengerTotal)).toBe(false);
    });

    it('does not reduce driver pay when the passenger uses a promotion', () => {
      const withPromo = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
          promotion: {
            id: 'promo-1',
            code: 'WELCOME',
            type: PromotionType.PERCENT,
            value: D(20),
            maxDiscount: null,
            minOrderAmount: D(0),
          },
        },
        noSurge,
      );

      const without = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
        },
        noSurge,
      );

      expect(withPromo.passengerTotal.toFixed(2)).toBe('664.00'); // 830 − 166
      expect(withPromo.driverNet.toFixed(2)).toBe(without.driverNet.toFixed(2));
    });

    it('tops the driver up to the configured minimum earning', () => {
      const q = pricing.calculate(
        rule({ minimumDriverEarning: D(500), minimumFare: D(0) }),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: 1_000,
          durationS: 180,
          isShared: false,
        },
        noSurge,
      );

      expect(q.driverNet.toFixed(2)).toBe('500.00');
      expect(q.components.map((c) => c.code)).toContain(
        FareComponentCode.DRIVER_MINIMUM_TOP_UP,
      );
    });
  });

  describe('shared ride pricing', () => {
    const sharedRule = rule({
      serviceType: ServiceType.SHARED_RIDE,
      sharedDiscountPct: D(25),
      sharedPassengerDriverSharePct: D(10),
    });

    it('discounts the passenger for sharing', () => {
      const q = pricing.calculate(
        sharedRule,
        {
          serviceType: ServiceType.SHARED_RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: true,
        },
        noSurge,
      );

      expect(q.grossFare.toFixed(2)).toBe('830.00');
      expect(q.discountTotal.toFixed(2)).toBe('207.50'); // 25%
      expect(q.passengerTotal.toFixed(2)).toBe('622.50');
    });

    it('pays a joining passenger’s driver the configured share, not the standard split', () => {
      const joined = pricing.calculate(
        sharedRule,
        {
          serviceType: ServiceType.SHARED_RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: true,
          isSharedJoin: true,
        },
        noSurge,
      );

      // The driver was making this journey anyway, so they receive the
      // shared-passenger share of 10%: 830 × 10% = 83.
      expect(joined.driverNet.toFixed(2)).toBe('83.00');
      expect(joined.platformCommission.toFixed(2)).toBe('747.00');
    });

    it('is configurable — raising the share raises the driver’s uplift', () => {
      const generous = pricing.calculate(
        rule({
          serviceType: ServiceType.SHARED_RIDE,
          sharedPassengerDriverSharePct: D(40),
        }),
        {
          serviceType: ServiceType.SHARED_RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: true,
          isSharedJoin: true,
        },
        noSurge,
      );

      expect(generous.driverNet.toFixed(2)).toBe('332.00'); // 830 × 40%
    });

    it('pays an additional stop fee on top of the share', () => {
      const q = pricing.calculate(
        rule({
          serviceType: ServiceType.SHARED_RIDE,
          sharedPassengerDriverSharePct: D(10),
          additionalStopFee: D(25),
        }),
        {
          serviceType: ServiceType.SHARED_RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: true,
          isSharedJoin: true,
          additionalStops: 2,
        },
        noSurge,
      );

      // gross 830 + 50 stop fee = 880; driver gets 10% of 880 plus the 50.
      expect(q.driverStopFees.toFixed(2)).toBe('50.00');
      expect(q.driverNet.toFixed(2)).toBe('138.00');
    });
  });

  describe('discount limits', () => {
    it('never discounts beyond the configured maximum', () => {
      const q = pricing.calculate(
        rule({ sharedDiscountPct: D(40), maxPassengerDiscountPct: D(30) }),
        {
          serviceType: ServiceType.SHARED_RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: true,
          promotion: {
            id: 'promo-2',
            code: 'BIG',
            type: PromotionType.PERCENT,
            value: D(50),
            maxDiscount: null,
            minOrderAmount: D(0),
          },
        },
        noSurge,
      );

      expect(q.discountTotal.toFixed(2)).toBe('249.00'); // 30% of 830
      expect(q.passengerTotal.toFixed(2)).toBe('581.00');
    });

    it('honours a promotion’s own cap', () => {
      const q = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
          promotion: {
            id: 'promo-3',
            code: 'CAP100',
            type: PromotionType.PERCENT,
            value: D(50),
            maxDiscount: D(100),
            minOrderAmount: D(0),
          },
        },
        noSurge,
      );

      expect(q.discountTotal.toFixed(2)).toBe('100.00');
    });

    it('ignores a promotion below its minimum spend', () => {
      const q = pricing.calculate(
        rule(),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: TEN_KM,
          durationS: TWENTY_MIN,
          isShared: false,
          promotion: {
            id: 'promo-4',
            code: 'BIGSPEND',
            type: PromotionType.FIXED,
            value: D(200),
            maxDiscount: null,
            minOrderAmount: D(5_000),
          },
        },
        noSurge,
      );

      expect(q.discountTotal.toFixed(2)).toBe('0.00');
      expect(q.promotionId).toBeNull();
    });
  });

  describe('audit invariants — these mirror the database CHECK constraints', () => {
    const scenarios = [
      { label: 'plain solo', input: { isShared: false } },
      { label: 'shared', input: { isShared: true } },
      { label: 'shared join with stops', input: { isShared: true, isSharedJoin: true, additionalStops: 3 } },
      { label: 'with waiting', input: { isShared: false, waitingMinutes: 30 } },
    ];

    for (const scenario of scenarios) {
      it(`reconciles the passenger total (${scenario.label})`, () => {
        const q = pricing.calculate(
          rule({
            sharedDiscountPct: D(20),
            serviceFeePct: D(5),
            taxPct: D(8),
            additionalStopFee: D(25),
            sharedPassengerDriverSharePct: D(15),
          }),
          {
            serviceType: ServiceType.RIDE,
            vehicleTypeId: 'vt-car',
            distanceM: TEN_KM,
            durationS: TWENTY_MIN,
            ...scenario.input,
          },
          D('1.2'),
        );

        const expected = q.grossFare
          .minus(q.discountTotal)
          .plus(q.serviceFee)
          .plus(q.taxTotal);
        expect(q.passengerTotal.toFixed(2)).toBe(expected.toFixed(2));
      });

      it(`reconciles the driver net (${scenario.label})`, () => {
        const q = pricing.calculate(
          rule({
            sharedDiscountPct: D(20),
            additionalStopFee: D(25),
            minimumDriverEarning: D(400),
            sharedPassengerDriverSharePct: D(15),
          }),
          {
            serviceType: ServiceType.RIDE,
            vehicleTypeId: 'vt-car',
            distanceM: TEN_KM,
            durationS: TWENTY_MIN,
            ...scenario.input,
          },
          noSurge,
        );

        const expected = q.driverGross
          .minus(q.platformCommission)
          .plus(q.driverStopFees)
          .plus(q.driverBonus);
        expect(q.driverNet.toFixed(2)).toBe(expected.toFixed(2));
      });
    }

    it('produces components that sum to the gross fare', () => {
      const q = pricing.calculate(
        rule({ bookingFee: D(50) }),
        {
          serviceType: ServiceType.RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: 7_300,
          durationS: 940,
          isShared: false,
        },
        D('1.35'),
      );

      const grossCodes = [
        FareComponentCode.BASE_FARE,
        FareComponentCode.DISTANCE_FARE,
        FareComponentCode.TIME_FARE,
        FareComponentCode.WAITING_FEE,
        FareComponentCode.ADDITIONAL_STOP_FEE,
        FareComponentCode.SURGE_ADJUSTMENT,
        FareComponentCode.MINIMUM_FARE_TOP_UP,
        FareComponentCode.BOOKING_FEE,
      ];

      const summed = q.components
        .filter((c) => grossCodes.includes(c.code))
        .reduce((acc, c) => acc.plus(c.amount), D(0));

      expect(summed.toFixed(2)).toBe(q.grossFare.toFixed(2));
    });

    it('never produces a negative charge or a negative driver payment', () => {
      const q = pricing.calculate(
        rule({ sharedDiscountPct: D(50), maxPassengerDiscountPct: D(100) }),
        {
          serviceType: ServiceType.SHARED_RIDE,
          vehicleTypeId: 'vt-car',
          distanceM: 300,
          durationS: 60,
          isShared: true,
          promotion: {
            id: 'promo-5',
            code: 'HUGE',
            type: PromotionType.FIXED,
            value: D(100_000),
            maxDiscount: null,
            minOrderAmount: D(0),
          },
        },
        noSurge,
      );

      expect(q.passengerTotal.greaterThanOrEqualTo(0)).toBe(true);
      expect(q.driverNet.greaterThanOrEqualTo(0)).toBe(true);
    });
  });
});
