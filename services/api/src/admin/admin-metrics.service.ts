import { Injectable } from '@nestjs/common';
import { Prisma, ServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);

/**
 * Operational metrics for the admin dashboard.
 *
 * Every figure is aggregated in the database from real rows. Nothing is
 * estimated or extrapolated — where the platform has no data yet, the honest
 * answer is zero.
 */
@Injectable()
export class AdminMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalUsers, newUsersThisWeek,
      totalDrivers, approvedDrivers, pendingDrivers, onlineDrivers,
      activeRides, ridesToday, sharedRidesToday,
      activeFoodOrders, foodOrdersToday,
      activeParcels, parcelsToday,
      restaurants, pendingRestaurants,
      commissionToday, commissionThisMonth,
      earningsAvailable, earningsPaid,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.driver.count({ where: { deletedAt: null } }),
      this.prisma.driver.count({ where: { deletedAt: null, approvalStatus: 'APPROVED' } }),
      this.prisma.driver.count({
        where: { deletedAt: null, approvalStatus: { in: ['PENDING', 'UNDER_REVIEW'] } },
      }),
      this.prisma.driverAvailability.count({ where: { presence: { not: 'OFFLINE' } } }),
      this.prisma.ride.count({
        where: { status: { in: ['ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS'] } },
      }),
      this.prisma.ride.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.ride.count({ where: { createdAt: { gte: startOfToday }, rideType: 'SHARED' } }),
      this.prisma.foodOrder.count({
        where: {
          status: {
            in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP', 'DELIVERING'],
          },
        },
      }),
      this.prisma.foodOrder.count({
        where: { placedAt: { gte: startOfToday }, status: { not: 'DRAFT' } },
      }),
      this.prisma.parcelOrder.count({
        where: {
          status: { in: ['PLACED', 'SEARCHING_DRIVER', 'ASSIGNED', 'HEADING_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT'] },
        },
      }),
      this.prisma.parcelOrder.count({
        where: { createdAt: { gte: startOfToday }, status: { not: 'DRAFT' } },
      }),
      this.prisma.restaurant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.restaurant.count({ where: { deletedAt: null, status: 'PENDING' } }),
      this.prisma.platformCommission.aggregate({
        where: { createdAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.platformCommission.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.driverEarning.aggregate({
        where: { status: 'AVAILABLE' },
        _sum: { netAmount: true },
      }),
      this.prisma.driverEarning.aggregate({ where: { status: 'PAID' }, _sum: { netAmount: true } }),
    ]);

    return {
      generatedAt: new Date(),
      users: { total: totalUsers, newThisWeek: newUsersThisWeek },
      drivers: {
        total: totalDrivers,
        approved: approvedDrivers,
        awaitingApproval: pendingDrivers,
        onlineNow: onlineDrivers,
      },
      rides: { activeNow: activeRides, today: ridesToday, sharedToday: sharedRidesToday },
      food: { activeNow: activeFoodOrders, today: foodOrdersToday },
      parcels: { activeNow: activeParcels, today: parcelsToday },
      restaurants: { active: restaurants, awaitingApproval: pendingRestaurants },
      money: {
        currency: 'LKR',
        commissionToday: (commissionToday._sum.amount ?? ZERO).toFixed(2),
        commissionThisMonth: (commissionThisMonth._sum.amount ?? ZERO).toFixed(2),
        driverEarningsAwaitingPayout: (earningsAvailable._sum.netAmount ?? ZERO).toFixed(2),
        driverEarningsPaid: (earningsPaid._sum.netAmount ?? ZERO).toFixed(2),
      },
    };
  }

  /** Commission and volume by service line. */
  async revenueByService(from?: Date, to?: Date) {
    const where: Prisma.PlatformCommissionWhereInput =
      from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

    const rows = await this.prisma.platformCommission.groupBy({
      by: ['serviceType'],
      where,
      _sum: { amount: true },
      _count: true,
    });

    const byService = new Map(rows.map((r) => [r.serviceType, r]));

    return Object.values(ServiceType).map((serviceType) => {
      const row = byService.get(serviceType);
      return {
        serviceType,
        transactions: row?._count ?? 0,
        commission: (row?._sum.amount ?? ZERO).toFixed(2),
      };
    });
  }

  /**
   * Daily commission for a trend chart, gap-filled in SQL so a day with no
   * activity is a zero rather than a missing point.
   */
  async revenueTrend(days = 14) {
    const bounded = Math.min(90, Math.max(1, days));

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; amount: string; count: bigint }>>`
      SELECT
        d.day::date                       AS day,
        COALESCE(SUM(pc.amount), 0)::text AS amount,
        COUNT(pc.id)                      AS count
      FROM generate_series(
             -- Prisma binds a JS number as bigint, and make_interval has no
             -- bigint overload, so the cast is required rather than cosmetic.
             (CURRENT_DATE - make_interval(days => ${bounded - 1}::int)),
             CURRENT_DATE,
             '1 day'
           ) AS d(day)
      LEFT JOIN platform_commissions pc
        ON pc.created_at >= d.day
       AND pc.created_at <  d.day + INTERVAL '1 day'
      GROUP BY d.day
      ORDER BY d.day ASC
    `;

    return rows.map((row) => ({
      date: row.day,
      commission: Number(row.amount).toFixed(2),
      transactions: Number(row.count),
    }));
  }
}
