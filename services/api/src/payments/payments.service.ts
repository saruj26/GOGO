import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  ServiceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { Money } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment.types';

export interface CreatePaymentInput {
  userId: string;
  serviceType: ServiceType;
  method: PaymentMethod;
  amount: Money;
  currency: string;
  /** Makes a retried checkout safe: the same key returns the same payment. */
  idempotencyKey?: string;
}

/**
 * Payment lifecycle, shared by every service line.
 *
 * This is a thin, honest layer over the existing `payments` /
 * `payment_transactions` tables — not a second payment architecture. It exists
 * so food, parcel and (in a later phase) rides all move money through the same
 * state machine and leave the same audit trail.
 *
 * Two rules matter most:
 *
 *  1. **A client never declares that payment succeeded.** `settle` is called by
 *     the server at the point the service was actually delivered (cash) or by a
 *     verified provider callback (online). There is no endpoint a client can
 *     call to mark its own payment paid.
 *
 *  2. **Every state change writes a transaction row.** The payment row carries
 *     the current state; the transaction rows carry how it got there.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  /**
   * Transitions the payment state machine permits. Anything absent is refused.
   */
  private static readonly ALLOWED: Record<PaymentStatus, PaymentStatus[]> = {
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
    [PaymentStatus.PAID]: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
    [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
    [PaymentStatus.FAILED]: [PaymentStatus.PENDING],
    [PaymentStatus.REFUNDED]: [],
    [PaymentStatus.CANCELLED]: [],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Opens a payment in PENDING and records the intent.
   *
   * Which provider ultimately handles it is resolved from the method, so adding
   * a gateway later is an adapter change rather than a change here.
   */
  async createPending(
    tx: Prisma.TransactionClient,
    input: CreatePaymentInput,
  ): Promise<{ id: string; status: PaymentStatus }> {
    if (input.amount.lessThanOrEqualTo(0)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'A payment must be for a positive amount',
      );
    }

    if (input.idempotencyKey) {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, status: true },
      });
      if (existing) return existing;
    }

    const payment = await tx.payment.create({
      data: {
        userId: input.userId,
        serviceType: input.serviceType,
        method: input.method,
        status: PaymentStatus.PENDING,
        amount: input.amount,
        currency: input.currency,
        provider: this.providerFor(input.method),
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true, status: true },
    });

    await tx.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        type: PaymentTransactionType.AUTHORIZE,
        status: PaymentStatus.PENDING,
        amount: input.amount,
        currency: input.currency,
      },
    });

    return payment;
  }

  /**
   * Marks a payment settled. Called by the server when the service was
   * delivered — never in response to a client asserting that it paid.
   */
  async settle(
    tx: Prisma.TransactionClient,
    paymentId: string,
    context: { actorUserId?: string; providerRef?: string },
  ): Promise<PaymentStatus> {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, amount: true, currency: true, method: true, userId: true },
    });

    if (!payment) throw DomainError.notFound('Payment');

    // Already settled: return the current state rather than double-charging.
    if (payment.status === PaymentStatus.PAID) return PaymentStatus.PAID;

    this.assertTransition(payment.status, PaymentStatus.PAID);

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.PAID, paidAt: new Date(), providerRef: context.providerRef },
    });

    await tx.paymentTransaction.create({
      data: {
        paymentId,
        type: PaymentTransactionType.CAPTURE,
        status: PaymentStatus.PAID,
        amount: payment.amount,
        currency: payment.currency,
        providerRef: context.providerRef,
      },
    });

    await this.audit.record(
      {
        actorUserId: context.actorUserId ?? null,
        action: 'payment.settle',
        entityType: 'Payment',
        entityId: paymentId,
        previousState: { status: payment.status },
        newState: { status: PaymentStatus.PAID, amount: payment.amount.toFixed(2) },
      },
      tx,
    );

    return PaymentStatus.PAID;
  }

  async fail(
    tx: Prisma.TransactionClient,
    paymentId: string,
    reason: string,
    errorCode?: string,
  ): Promise<void> {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, amount: true, currency: true },
    });
    if (!payment) throw DomainError.notFound('Payment');

    this.assertTransition(payment.status, PaymentStatus.FAILED);

    await tx.payment.update({
      where: { id: paymentId },
      // The reason is stored for support, and is deliberately not the string
      // shown to the customer.
      data: { status: PaymentStatus.FAILED, failedAt: new Date(), failureReason: reason },
    });

    await tx.paymentTransaction.create({
      data: {
        paymentId,
        type: PaymentTransactionType.CHARGE,
        status: PaymentStatus.FAILED,
        amount: payment.amount,
        currency: payment.currency,
        errorCode,
        errorMessage: reason,
      },
    });
  }

  async cancel(
    tx: Prisma.TransactionClient,
    paymentId: string,
    reason: string,
  ): Promise<void> {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, amount: true, currency: true },
    });
    if (!payment) return;

    // Cancelling an already-settled payment is a refund, not a cancellation.
    if (payment.status === PaymentStatus.PAID) {
      await this.refund(tx, paymentId, payment.amount, reason);
      return;
    }

    if (
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return;
    }

    this.assertTransition(payment.status, PaymentStatus.CANCELLED);

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.CANCELLED },
    });

    await tx.paymentTransaction.create({
      data: {
        paymentId,
        type: PaymentTransactionType.VOID,
        status: PaymentStatus.CANCELLED,
        amount: payment.amount,
        currency: payment.currency,
        errorMessage: reason,
      },
    });
  }

  async refund(
    tx: Prisma.TransactionClient,
    paymentId: string,
    amount: Money,
    reason: string,
  ): Promise<PaymentStatus> {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, amount: true, refundedAmount: true, currency: true },
    });
    if (!payment) throw DomainError.notFound('Payment');

    const alreadyRefunded = payment.refundedAmount;
    const remaining = payment.amount.minus(alreadyRefunded);

    if (amount.greaterThan(remaining)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'A refund cannot exceed what remains of the payment',
      );
    }

    const totalRefunded = alreadyRefunded.plus(amount);
    const status = totalRefunded.equals(payment.amount)
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;

    this.assertTransition(payment.status, status);

    await tx.payment.update({
      where: { id: paymentId },
      data: { status, refundedAmount: totalRefunded },
    });

    await tx.paymentTransaction.create({
      data: {
        paymentId,
        type: PaymentTransactionType.REFUND,
        status,
        amount,
        currency: payment.currency,
        errorMessage: reason,
      },
    });

    return status;
  }

  /**
   * Whether a payment method can be committed to at booking time.
   *
   * Cash and wallet settle at delivery. Card and online methods require a
   * gateway that is not integrated in this phase, so they are refused at the
   * point of booking rather than accepted and silently never charged.
   */
  assertMethodSupported(method: PaymentMethod): void {
    if (method === PaymentMethod.CASH || method === PaymentMethod.WALLET) return;

    // Card and online settle through a gateway. When none is configured the
    // method is refused at the point of booking rather than accepted and never
    // charged — the customer finds out now, not when the driver asks for money.
    if (this.provider.isConfigured) return;

    throw new DomainError(
      DomainErrorCode.PAYMENT_FAILED,
      'Card and online payments are not available yet. Please choose cash or wallet.',
    );
  }

  private providerFor(method: PaymentMethod): string {
    switch (method) {
      case PaymentMethod.CASH:
        return 'cash';
      case PaymentMethod.WALLET:
        return 'wallet';
      default:
        return 'unconfigured';
    }
  }

  private assertTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (!PaymentsService.ALLOWED[from]?.includes(to)) {
      throw new DomainError(
        DomainErrorCode.PAYMENT_FAILED,
        `This payment cannot move from ${from.toLowerCase()} to ${to.toLowerCase()}.`,
      );
    }
  }
}
