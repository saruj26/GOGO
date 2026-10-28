import { Prisma } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { assertWithinCaps, shouldRedeem } from './promotion-caps';

/**
 * Promotion caps at redemption time.
 *
 * The defect these cover: a ride validated a promotion at booking but never
 * redeemed it, so a one-per-customer code could be used on every ride the
 * customer ever took. Redemption now happens at completion, which puts real
 * distance between validation and redemption — so both caps have to be
 * re-checked here rather than trusted from earlier.
 */
describe('promotion caps', () => {
  const expectRefused = (caps: Parameters<typeof assertWithinCaps>[0], contains: string) => {
    let thrown: unknown;
    try {
      assertWithinCaps(caps);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe(DomainErrorCode.PROMOTION_INVALID);
    expect((thrown as DomainError).message).toContain(contains);
  };

  describe('the global usage limit', () => {
    it('allows a redemption that lands exactly on the limit', () => {
      expect(() =>
        assertWithinCaps({
          usedCount: 100,
          usageLimit: 100,
          alreadyUsedByUser: 0,
          perUserLimit: 1,
        }),
      ).not.toThrow();
    });

    it('refuses one past the limit', () => {
      expectRefused(
        { usedCount: 101, usageLimit: 100, alreadyUsedByUser: 0, perUserLimit: 1 },
        'reached its limit',
      );
    });

    it('treats a null limit as unlimited', () => {
      expect(() =>
        assertWithinCaps({
          usedCount: 999_999,
          usageLimit: null,
          alreadyUsedByUser: 0,
          perUserLimit: 5,
        }),
      ).not.toThrow();
    });
  });

  describe('the per-customer limit', () => {
    it('allows a first use on a one-per-customer code', () => {
      expect(() =>
        assertWithinCaps({
          usedCount: 1,
          usageLimit: null,
          alreadyUsedByUser: 0,
          perUserLimit: 1,
        }),
      ).not.toThrow();
    });

    it('refuses a second use of a one-per-customer code', () => {
      // The case the defect allowed: two rides booked before either completed.
      expectRefused(
        { usedCount: 2, usageLimit: null, alreadyUsedByUser: 1, perUserLimit: 1 },
        'already used',
      );
    });

    it('allows uses up to a higher per-customer allowance', () => {
      expect(() =>
        assertWithinCaps({
          usedCount: 3,
          usageLimit: null,
          alreadyUsedByUser: 2,
          perUserLimit: 3,
        }),
      ).not.toThrow();
    });

    it('refuses the one past that allowance', () => {
      expectRefused(
        { usedCount: 4, usageLimit: null, alreadyUsedByUser: 3, perUserLimit: 3 },
        'already used',
      );
    });
  });

  describe('whether a completed job consumes a promotion at all', () => {
    it('redeems when a discount was actually given', () => {
      expect(shouldRedeem('promo-1', new Prisma.Decimal('150.00'))).toBe(true);
    });

    it('does not burn a use when the discount came out at zero', () => {
      // e.g. the order fell under the promotion's minimum spend.
      expect(shouldRedeem('promo-1', new Prisma.Decimal('0.00'))).toBe(false);
    });

    it('does not redeem a negative discount', () => {
      expect(shouldRedeem('promo-1', new Prisma.Decimal('-10.00'))).toBe(false);
    });

    it('does nothing when no promotion was applied', () => {
      expect(shouldRedeem(null, new Prisma.Decimal('150.00'))).toBe(false);
    });
  });
});
