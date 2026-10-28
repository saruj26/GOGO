import { PaymentStatus } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import {
  assertAmountMatches,
  assertRefundable,
  assertWebhookTransition,
  refundStatusFor,
} from './webhook-rules';

/**
 * A verified webhook has been proved to come from the provider. That is not the
 * same as being safe to act on, and these are the checks in between.
 */
describe('payment webhook rules', () => {
  const expectRefused = (act: () => void, contains: string) => {
    let thrown: unknown;
    try {
      act();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe(DomainErrorCode.PAYMENT_FAILED);
    expect((thrown as DomainError).message).toContain(contains);
  };

  describe('the states a provider event may move a payment into', () => {
    it('allows the ordinary settlement path', () => {
      expect(() =>
        assertWebhookTransition(PaymentStatus.PENDING, PaymentStatus.AUTHORIZED),
      ).not.toThrow();
      expect(() =>
        assertWebhookTransition(PaymentStatus.AUTHORIZED, PaymentStatus.PAID),
      ).not.toThrow();
    });

    it('treats a duplicate event as a no-op', () => {
      // The ordinary case: providers retry until they get a 2xx.
      expect(() => assertWebhookTransition(PaymentStatus.PAID, PaymentStatus.PAID)).not.toThrow();
    });

    it('refuses to un-pay a settled payment', () => {
      expectRefused(
        () => assertWebhookTransition(PaymentStatus.PAID, PaymentStatus.PENDING),
        'cannot become',
      );
      expectRefused(
        () => assertWebhookTransition(PaymentStatus.PAID, PaymentStatus.FAILED),
        'cannot become',
      );
    });

    it('refuses to re-pay a refunded payment', () => {
      // A late-arriving success event after a refund must not reverse it.
      expectRefused(
        () => assertWebhookTransition(PaymentStatus.REFUNDED, PaymentStatus.PAID),
        'cannot become',
      );
    });

    it('refuses to revive a cancelled payment', () => {
      expectRefused(
        () => assertWebhookTransition(PaymentStatus.CANCELLED, PaymentStatus.PAID),
        'cannot become',
      );
    });

    it('allows a payment to go from paid to refunded', () => {
      expect(() =>
        assertWebhookTransition(PaymentStatus.PAID, PaymentStatus.REFUNDED),
      ).not.toThrow();
      expect(() =>
        assertWebhookTransition(PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED),
      ).not.toThrow();
    });
  });

  describe('the amount the provider reported', () => {
    it('accepts the same amount written differently', () => {
      expect(() =>
        assertAmountMatches(
          { amount: '1500.00', currency: 'LKR' },
          { amount: '1500', currency: 'lkr' },
        ),
      ).not.toThrow();

      expect(() =>
        assertAmountMatches(
          { amount: '1500.50', currency: 'LKR' },
          { amount: '1500.5', currency: 'LKR' },
        ),
      ).not.toThrow();
    });

    it('refuses a different amount', () => {
      // Settling a large order against a small charge is the manipulation this
      // check exists for.
      expectRefused(
        () =>
          assertAmountMatches(
            { amount: '1500.00', currency: 'LKR' },
            { amount: '15.00', currency: 'LKR' },
          ),
        'amount',
      );
    });

    it('refuses a one-cent discrepancy', () => {
      expectRefused(
        () =>
          assertAmountMatches(
            { amount: '1500.00', currency: 'LKR' },
            { amount: '1500.01', currency: 'LKR' },
          ),
        'amount',
      );
    });

    it('refuses a different currency', () => {
      expectRefused(
        () =>
          assertAmountMatches(
            { amount: '1500.00', currency: 'LKR' },
            { amount: '1500.00', currency: 'USD' },
          ),
        'currency',
      );
    });
  });

  describe('refunds', () => {
    it('allows a full refund of an untouched payment', () => {
      expect(() =>
        assertRefundable({ amount: '1000.00', refundedAmount: '0.00' }, { amount: '1000.00' }),
      ).not.toThrow();
    });

    it('allows a second partial refund within the balance', () => {
      expect(() =>
        assertRefundable({ amount: '1000.00', refundedAmount: '400.00' }, { amount: '600.00' }),
      ).not.toThrow();
    });

    it('refuses refunding more than was charged', () => {
      expectRefused(
        () =>
          assertRefundable({ amount: '1000.00', refundedAmount: '0.00' }, { amount: '1000.01' }),
        'more than the remaining balance',
      );
    });

    it('refuses a duplicate refund that would exceed the balance', () => {
      // A repeated refund webhook is the ordinary way this happens.
      expectRefused(
        () =>
          assertRefundable({ amount: '1000.00', refundedAmount: '1000.00' }, { amount: '1000.00' }),
        'more than the remaining balance',
      );
    });

    it('refuses a zero or negative refund', () => {
      expectRefused(
        () => assertRefundable({ amount: '1000.00', refundedAmount: '0.00' }, { amount: '0.00' }),
        'positive amount',
      );
    });

    it('reports the resulting status', () => {
      expect(
        refundStatusFor({ amount: '1000.00', refundedAmount: '0.00' }, { amount: '1000.00' }),
      ).toBe(PaymentStatus.REFUNDED);

      expect(
        refundStatusFor({ amount: '1000.00', refundedAmount: '0.00' }, { amount: '250.00' }),
      ).toBe(PaymentStatus.PARTIALLY_REFUNDED);

      expect(
        refundStatusFor({ amount: '1000.00', refundedAmount: '750.00' }, { amount: '250.00' }),
      ).toBe(PaymentStatus.REFUNDED);
    });
  });
});
