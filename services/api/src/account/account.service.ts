import { Injectable } from '@nestjs/common';
import { Prisma, ServiceType } from '@prisma/client';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The customer's own money and promotions.
 *
 * Everything here is scoped to the signed-in user. Nothing exposes another
 * customer's balance, another customer's payments, or a promotion the user is
 * not entitled to use.
 */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async wallet(userId: string, pagination: CursorPaginationDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, currency: true, frozen: true },
    });

    if (!wallet) {
      return { balance: '0.00', currency: 'LKR', frozen: false, transactions: null };
    }

    const rows = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        description: true,
        referenceType: true,
        createdAt: true,
      },
    });

    const page = buildCursorPage(rows, pagination.limit);

    return {
      balance: wallet.balance.toFixed(2),
      currency: wallet.currency,
      frozen: wallet.frozen,
      transactions: {
        ...page,
        items: page.items.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount.toFixed(2),
          balanceAfter: t.balanceAfter.toFixed(2),
          description: t.description,
          reference: t.referenceType,
          at: t.createdAt,
        })),
      },
    };
  }

  async payments(userId: string, pagination: CursorPaginationDto, serviceType?: ServiceType) {
    const rows = await this.prisma.payment.findMany({
      where: { userId, ...(serviceType ? { serviceType } : {}) },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serviceType: true,
        method: true,
        status: true,
        amount: true,
        refundedAmount: true,
        currency: true,
        paidAt: true,
        createdAt: true,
        ridePassenger: { select: { ride: { select: { reference: true } } } },
        foodOrder: { select: { reference: true, restaurant: { select: { name: true } } } },
        parcelOrder: { select: { reference: true } },
      },
    });

    const page = buildCursorPage(rows, pagination.limit);

    return {
      ...page,
      items: page.items.map((p) => ({
        id: p.id,
        serviceType: p.serviceType,
        method: p.method,
        status: p.status,
        amount: p.amount.toFixed(2),
        refunded: p.refundedAmount.toFixed(2),
        currency: p.currency,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        reference:
          p.ridePassenger?.ride.reference ??
          p.foodOrder?.reference ??
          p.parcelOrder?.reference ??
          null,
        description: p.foodOrder?.restaurant.name ?? null,
      })),
    };
  }

  /**
   * Promotions this customer can still use.
   *
   * Filtered by validity window, service applicability and the customer's own
   * remaining allowance — a code they have already exhausted is not advertised
   * to them as available.
   */
  async availablePromotions(userId: string) {
    const now = new Date();

    const promotions = await this.prisma.promotion.findMany({
      where: {
        active: true,
        validFrom: { lte: now },
        validTo: { gte: now },
      },
      orderBy: { validTo: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        type: true,
        value: true,
        maxDiscount: true,
        minOrderAmount: true,
        serviceTypes: true,
        perUserLimit: true,
        usageLimit: true,
        usedCount: true,
        validTo: true,
      },
    });

    if (promotions.length === 0) return [];

    // One grouped query rather than one per promotion.
    const redemptions = await this.prisma.promotionRedemption.groupBy({
      by: ['promotionId'],
      where: { userId, promotionId: { in: promotions.map((p) => p.id) } },
      _count: true,
    });

    const usedByMe = new Map(redemptions.map((r) => [r.promotionId, r._count]));

    return promotions
      .filter((p) => (usedByMe.get(p.id) ?? 0) < p.perUserLimit)
      .filter((p) => p.usageLimit === null || p.usedCount < p.usageLimit)
      .map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        type: p.type,
        value: p.value.toFixed(2),
        maxDiscount: p.maxDiscount?.toFixed(2) ?? null,
        minOrderAmount: p.minOrderAmount.toFixed(2),
        // An empty list means the promotion applies to every service.
        appliesTo: p.serviceTypes.length > 0 ? p.serviceTypes : null,
        expiresAt: p.validTo,
        usesLeft: p.perUserLimit - (usedByMe.get(p.id) ?? 0),
      }));
  }

  /** Counts for the home screen, in one round trip each. */
  async summary(userId: string) {
    const [rides, foodOrders, parcels, unreadNotifications, wallet] = await Promise.all([
      this.prisma.ridePassenger.count({ where: { userId } }),
      this.prisma.foodOrder.count({ where: { userId, status: { not: 'DRAFT' } } }),
      this.prisma.parcelOrder.count({ where: { userId, status: { not: 'DRAFT' } } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.wallet.findUnique({
        where: { userId },
        select: { balance: true, currency: true },
      }),
    ]);

    return {
      rides,
      foodOrders,
      parcels,
      unreadNotifications,
      wallet: {
        balance: (wallet?.balance ?? new Prisma.Decimal(0)).toFixed(2),
        currency: wallet?.currency ?? 'LKR',
      },
    };
  }
}
