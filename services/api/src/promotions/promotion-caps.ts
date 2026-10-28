import { DomainError, DomainErrorCode } from '../common/errors/domain.error';

export interface PromotionCaps {
  /** Global uses already recorded, after this redemption's increment. */
  usedCount: number;
  usageLimit: number | null;
  /** Redemptions this user already holds, excluding the one being made. */
  alreadyUsedByUser: number;
  perUserLimit: number;
}

/**
 * The two caps a promotion carries, checked as one rule.
 *
 * Both are re-checked at redemption rather than trusted from validation time.
 * For a ride those two moments are far apart — the code is applied at booking
 * and consumed when the trip completes — so a customer could otherwise book
 * several rides on a one-per-customer code and have all of them honoured.
 */
export function assertWithinCaps(caps: PromotionCaps): void {
  if (caps.usageLimit !== null && caps.usedCount > caps.usageLimit) {
    throw new DomainError(
      DomainErrorCode.PROMOTION_INVALID,
      'This promotion has just reached its limit.',
    );
  }

  if (caps.alreadyUsedByUser >= caps.perUserLimit) {
    throw new DomainError(
      DomainErrorCode.PROMOTION_INVALID,
      'You have already used this promotion.',
    );
  }
}

/**
 * Whether a completed job should consume a promotion at all.
 *
 * A quote that carries a code but no actual discount — because the order fell
 * under the minimum, say — must not burn one of the customer's uses.
 */
export function shouldRedeem(promotionId: string | null, discount: { isZero(): boolean; isNegative(): boolean }): boolean {
  if (!promotionId) return false;
  return !discount.isZero() && !discount.isNegative();
}
