import { Injectable } from '@nestjs/common';
import { Prisma, ServiceType } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { Money } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionInput } from '../pricing/pricing.types';
import { assertWithinCaps } from './promotion-caps';

/**
 * Promotion validation and redemption, shared by every service line.
 *
 * Extracted from the ride module so food and parcel do not grow their own
 * copies of the same rules. The validation logic is behaviour-identical to what
 * the ride module previously did inline.
 */
@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates a code and returns it in the shape the pricing engine consumes.
   * Returns null when no code was supplied; throws when a supplied code is
   * unusable, so a customer is told why rather than silently charged full price.
   */
  async resolve(
    code: string | undefined,
    userId: string,
    serviceType?: ServiceType,
  ): Promise<PromotionInput | null> {
    if (!code) return null;

    const promotion = await this.prisma.promotion.findFirst({
      where: {
        code: code.toUpperCase(),
        active: true,
        validFrom: { lte: new Date() },
        validTo: { gte: new Date() },
      },
    });

    if (!promotion) {
      throw new DomainError(DomainErrorCode.PROMOTION_INVALID, 'That promotion code is not valid.');
    }

    if (
      serviceType &&
      promotion.serviceTypes.length > 0 &&
      !promotion.serviceTypes.includes(serviceType)
    ) {
      throw new DomainError(
        DomainErrorCode.PROMOTION_INVALID,
        'That promotion cannot be used for this service.',
      );
    }

    const used = await this.prisma.promotionRedemption.count({
      where: { promotionId: promotion.id, userId },
    });

    if (used >= promotion.perUserLimit) {
      throw new DomainError(
        DomainErrorCode.PROMOTION_INVALID,
        'You have already used this promotion.',
      );
    }

    if (promotion.usageLimit !== null && promotion.usedCount >= promotion.usageLimit) {
      throw new DomainError(DomainErrorCode.PROMOTION_INVALID, 'This promotion has ended.');
    }

    return {
      id: promotion.id,
      code: promotion.code,
      type: promotion.type,
      value: promotion.value,
      maxDiscount: promotion.maxDiscount,
      minOrderAmount: promotion.minOrderAmount,
    };
  }

  /**
   * Records that a promotion was actually used, inside the transaction that
   * created the order.
   *
   * `promotion_redemptions` carries UNIQUE(promotion, reference type, reference)
   * so a retried checkout cannot redeem twice, and the global counter is
   * incremented atomically against its own limit — a promotion capped at N uses
   * cannot be redeemed N+1 times by concurrent customers. The per-user cap is
   * re-checked under the same row lock, because validation happened earlier and
   * the world may have moved since.
   */
  async redeem(
    tx: Prisma.TransactionClient,
    params: {
      promotionId: string;
      userId: string;
      referenceType: string;
      referenceId: string;
      amount: Money;
    },
  ): Promise<void> {
    if (params.amount.lessThanOrEqualTo(0)) return;

    const claimed = await tx.$executeRaw`
      UPDATE promotions
      SET used_count = used_count + 1
      WHERE id = ${params.promotionId}::uuid
        AND active
        AND (usage_limit IS NULL OR used_count < usage_limit)
    `;

    if (claimed !== 1) {
      throw new DomainError(
        DomainErrorCode.PROMOTION_INVALID,
        'This promotion has just reached its limit.',
      );
    }

    // The per-user cap is re-checked here, not only at validation time.
    //
    // `resolve` runs when the code is applied, which for a ride is at booking
    // and can be minutes or hours before the redemption. Two bookings made
    // before either completes would both pass that check, so without this the
    // cap could be exceeded. The UPDATE above holds the promotion's row for the
    // rest of the transaction, which serialises every redemption of this
    // promotion and makes the count below safe to act on.
    const promotion = await tx.promotion.findUniqueOrThrow({
      where: { id: params.promotionId },
      select: { perUserLimit: true, usageLimit: true, usedCount: true },
    });

    const alreadyUsedByUser = await tx.promotionRedemption.count({
      where: { promotionId: params.promotionId, userId: params.userId },
    });

    assertWithinCaps({
      usedCount: promotion.usedCount,
      usageLimit: promotion.usageLimit,
      alreadyUsedByUser,
      perUserLimit: promotion.perUserLimit,
    });

    await tx.promotionRedemption.create({
      data: {
        promotionId: params.promotionId,
        userId: params.userId,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        amount: params.amount,
      },
    });
  }
}
