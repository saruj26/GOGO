import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentStatus, PaymentTransactionType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider, VerifiedWebhookEvent } from './providers/payment.types';
import {
  assertAmountMatches,
  assertRefundable,
  assertWebhookTransition,
  refundStatusFor,
} from './webhook-rules';

// A dozen round trips to a managed database in another region routinely
// exceed Prisma's 5-second default; see rides.service.ts's TRANSACTION_OPTIONS.
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/**
 * Where the provider tells us what actually happened.
 *
 * This is the only path that may mark a payment PAID. A client reporting
 * success is a hint that a redirect completed, nothing more — the money moved
 * when the provider says it moved, verified by signature.
 */
@Injectable()
export class PaymentWebhooksService {
  private readonly logger = new Logger(PaymentWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  get isConfigured(): boolean {
    return this.provider.isConfigured;
  }

  /**
   * Handles one delivery.
   *
   * The order is the point: verify the signature, record the event id, then act.
   * Recording before acting is what makes a retried delivery a no-op — the
   * unique key rejects the second insert and the handler returns without
   * touching the payment again.
   */
  async handle(rawBody: string, signature: string | undefined): Promise<{ handled: boolean }> {
    const event = this.provider.verifyWebhook(rawBody, signature);
    if (!event) return { handled: false };

    try {
      return await this.prisma.$transaction(async (tx) => {
        try {
          await tx.paymentWebhookEvent.create({
            data: {
              provider: this.provider.name,
              eventId: event.eventId,
              eventType: event.type,
              payload: event.redactedPayload as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            // Already handled. A 2xx stops the provider retrying.
            this.logger.log(`Ignoring repeat delivery of ${event.eventId}`);
            return { handled: false };
          }
          throw error;
        }

        await this.apply(tx, event);
        return { handled: true };
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof DomainError) throw error;

      this.logger.error(
        `Webhook ${event.eventId} failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }

  private async apply(tx: Prisma.TransactionClient, event: VerifiedWebhookEvent): Promise<void> {
    // Locked so two deliveries racing on the same payment serialise rather
    // than both reading the pre-update row.
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: PaymentStatus;
        amount: Prisma.Decimal;
        refunded_amount: Prisma.Decimal;
        currency: string;
        user_id: string;
      }>
    >`
      SELECT id, status, amount, refunded_amount, currency, user_id
      FROM payments
      WHERE provider_ref = ${event.providerRef}
      FOR UPDATE
    `;

    const payment = rows[0];

    if (!payment) {
      // A signed event for a charge we have no record of is a real problem —
      // but not one a retry fixes, so it is recorded and accepted.
      this.logger.error(`Webhook referenced unknown charge ${event.providerRef}`);
      return;
    }

    await tx.paymentWebhookEvent.updateMany({
      where: { provider: this.provider.name, eventId: event.eventId },
      data: { paymentId: payment.id },
    });

    const isRefund =
      event.status === PaymentStatus.REFUNDED ||
      event.status === PaymentStatus.PARTIALLY_REFUNDED;

    if (isRefund) {
      assertRefundable(
        { amount: payment.amount.toFixed(2), refundedAmount: payment.refunded_amount.toFixed(2) },
        { amount: event.amount },
      );

      const status = refundStatusFor(
        { amount: payment.amount.toFixed(2), refundedAmount: payment.refunded_amount.toFixed(2) },
        { amount: event.amount },
      );

      assertWebhookTransition(payment.status, status);

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status,
          refundedAmount: { increment: new Prisma.Decimal(event.amount) },
        },
      });

      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: PaymentTransactionType.REFUND,
          status,
          amount: new Prisma.Decimal(event.amount),
          currency: event.currency,
          providerRef: event.eventId,
          providerResponse: event.redactedPayload as Prisma.InputJsonValue,
        },
      });
    } else {
      // For anything that is not a refund the provider must be talking about
      // the amount we actually charged.
      assertAmountMatches(
        { amount: payment.amount.toFixed(2), currency: payment.currency },
        { amount: event.amount, currency: event.currency },
      );

      assertWebhookTransition(payment.status, event.status as PaymentStatus);

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: event.status as PaymentStatus,
          ...(event.status === 'PAID' ? { paidAt: new Date() } : {}),
          ...(event.status === 'AUTHORIZED' ? { authorizedAt: new Date() } : {}),
          ...(event.status === 'FAILED'
            ? { failedAt: new Date(), failureReason: event.failureReason ?? null }
            : {}),
        },
      });

      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: PaymentTransactionType.CHARGE,
          status: event.status as PaymentStatus,
          amount: new Prisma.Decimal(event.amount),
          currency: event.currency,
          providerRef: event.eventId,
          providerResponse: event.redactedPayload as Prisma.InputJsonValue,
          errorMessage: event.failureReason ?? null,
        },
      });
    }

    await this.audit.record(
      {
        actorUserId: null,
        actorRole: null,
        action: 'payment.webhook',
        entityType: 'Payment',
        entityId: payment.id,
        previousState: { status: payment.status },
        newState: { status: event.status, provider: this.provider.name },
        metadata: { eventId: event.eventId, eventType: event.type },
      },
      tx,
    );
  }
}
