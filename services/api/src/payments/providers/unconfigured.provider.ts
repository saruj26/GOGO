import { DomainError, DomainErrorCode } from '../../common/errors/domain.error';
import {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RefundRequest,
  RefundResult,
  VerifiedWebhookEvent,
} from './payment.types';

/**
 * What runs when no payment credentials are configured.
 *
 * Every operation refuses. It would be trivial to return a successful-looking
 * charge here and have the whole flow appear to work — which is exactly why it
 * does not: an order marked paid that nobody was charged for is worse than an
 * order that could not be placed.
 */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'unconfigured';
  readonly isConfigured = false;

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    throw new DomainError(
      DomainErrorCode.PAYMENT_FAILED,
      'Card and online payments are not available yet. Please choose cash or wallet.',
    );
  }

  async refund(_request: RefundRequest): Promise<RefundResult> {
    throw new DomainError(
      DomainErrorCode.PAYMENT_FAILED,
      'Refunds through a payment provider are not available.',
    );
  }

  verifyWebhook(): VerifiedWebhookEvent | null {
    // No provider is configured, so nothing can legitimately be sending us
    // webhooks. Rejecting rather than ignoring keeps the endpoint from being a
    // silent hole.
    throw DomainError.forbidden('No payment provider is configured.');
  }
}
