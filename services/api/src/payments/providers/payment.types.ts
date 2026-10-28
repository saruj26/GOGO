/**
 * The seam between the platform and whichever payment vendor is configured.
 *
 * Nothing outside this folder references a vendor SDK or a vendor payload. The
 * important consequence is that the *decision* about whether money moved is
 * always made here, from a verified provider response — never from something a
 * browser or a phone reported.
 */
export interface ChargeRequest {
  paymentId: string;
  amount: string;
  currency: string;
  /** Makes a retried charge safe at the vendor as well as in our own table. */
  idempotencyKey: string;
  description: string;
  /** Where the provider sends the customer back to. */
  returnUrl?: string;
}

export interface ChargeResult {
  /** The vendor's identifier for this charge. */
  providerRef: string;
  /**
   * Where the customer must be sent to authorise, when the vendor needs it.
   * Its presence is what tells the client this is not settled yet.
   */
  authorisationUrl?: string;
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED';
  failureReason?: string;
}

export interface RefundRequest {
  providerRef: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  reason?: string;
}

export interface RefundResult {
  providerRef: string;
  status: 'PENDING' | 'REFUNDED' | 'FAILED';
}

/** A webhook, after the adapter has verified and normalised it. */
export interface VerifiedWebhookEvent {
  /** The provider's own event id, used for idempotency. */
  eventId: string;
  type: string;
  providerRef: string;
  status: 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';
  /** As reported by the provider, so it can be checked against what we expect. */
  amount: string;
  currency: string;
  failureReason?: string;
  /** Card data already stripped by the adapter. */
  redactedPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when no credentials are configured. Callers must not pretend. */
  readonly isConfigured: boolean;

  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(request: RefundRequest): Promise<RefundResult>;

  /**
   * Verifies a raw webhook body against its signature and normalises it.
   *
   * Throws when the signature does not match. Returning null is reserved for a
   * well-formed event the platform has no interest in.
   */
  verifyWebhook(rawBody: string, signature: string | undefined): VerifiedWebhookEvent | null;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
