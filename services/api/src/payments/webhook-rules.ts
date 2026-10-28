import { PaymentStatus } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';

/**
 * What a verified webhook is allowed to do to a payment.
 *
 * A webhook is an untrusted message that has been proved to come from the
 * provider. Proving where it came from is not the same as accepting what it
 * says, and these are the checks that stand between the two.
 */

/** Payment statuses a provider event may legitimately move a payment into. */
const ALLOWED_AFTER: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.AUTHORIZED,
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.AUTHORIZED]: [
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  // A settled payment can only be refunded from here — never un-paid, and
  // never re-paid.
  [PaymentStatus.PAID]: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
  [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.FAILED]: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED],
  [PaymentStatus.CANCELLED]: [],
};

export function assertWebhookTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from === to) return;

  if (!ALLOWED_AFTER[from].includes(to)) {
    throw new DomainError(
      DomainErrorCode.PAYMENT_FAILED,
      `A payment that is ${from} cannot become ${to}.`,
    );
  }
}

/**
 * The amount and currency the provider reports must be the ones we asked for.
 *
 * Without this a forged-but-signed event, or a provider-side mistake, could
 * settle a large order against a small charge. Compared as exact decimal
 * strings: both sides are fixed-point, and parsing either into a float is how
 * a cent goes missing.
 */
export function assertAmountMatches(
  expected: { amount: string; currency: string },
  reported: { amount: string; currency: string },
): void {
  if (normaliseAmount(expected.amount) !== normaliseAmount(reported.amount)) {
    throw new DomainError(
      DomainErrorCode.PAYMENT_FAILED,
      'The amount the provider reported does not match this payment.',
    );
  }

  if (expected.currency.toUpperCase() !== reported.currency.toUpperCase()) {
    throw new DomainError(
      DomainErrorCode.PAYMENT_FAILED,
      'The currency the provider reported does not match this payment.',
    );
  }
}

/** `100`, `100.0` and `100.00` are the same amount; `100.01` is not. */
function normaliseAmount(value: string): string {
  const [whole, fraction = ''] = value.trim().split('.');
  const padded = `${fraction}00`.slice(0, 2);
  return `${whole.replace(/^0+(?=\d)/, '')}.${padded}`;
}

/**
 * Whether a refund event is consistent with what has already been refunded.
 *
 * Refunding more than was charged is the manipulation this exists to stop, and
 * it is not hypothetical: a duplicate refund webhook is the ordinary way it
 * would happen.
 */
export function assertRefundable(
  payment: { amount: string; refundedAmount: string },
  refund: { amount: string },
): void {
  const charged = toCents(payment.amount);
  const already = toCents(payment.refundedAmount);
  const requested = toCents(refund.amount);

  if (requested <= 0) {
    throw new DomainError(DomainErrorCode.PAYMENT_FAILED, 'A refund must be for a positive amount.');
  }

  if (already + requested > charged) {
    throw new DomainError(
      DomainErrorCode.PAYMENT_FAILED,
      'That refund is more than the remaining balance of this payment.',
    );
  }
}

export function refundStatusFor(
  payment: { amount: string; refundedAmount: string },
  refund: { amount: string },
): PaymentStatus {
  const charged = toCents(payment.amount);
  const total = toCents(payment.refundedAmount) + toCents(refund.amount);

  return total >= charged ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
}

/** Integer cents, so nothing here ever touches a float. */
function toCents(value: string): number {
  const [whole, fraction = ''] = value.trim().split('.');
  const padded = `${fraction}00`.slice(0, 2);
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(padded, 10);
}
