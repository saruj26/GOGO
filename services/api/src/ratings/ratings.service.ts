import { Injectable, Logger } from '@nestjs/common';
import {
  FoodOrderStatus,
  ParcelStatus,
  Prisma,
  RidePassengerStatus,
  ServiceType,
} from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitRatingDto } from './dto/ratings.dto';

const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/**
 * Customer ratings for rides, food orders and parcels.
 *
 * A rating can only be left by somebody who actually took the trip or placed the
 * order, only after it completed, and only once. Cached averages on the driver
 * and restaurant rows are recomputed from the ratings themselves rather than
 * incremented, so they cannot drift.
 */
@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async rateRide(userId: string, rideId: string, dto: SubmitRatingDto) {
    const leg = await this.prisma.ridePassenger.findFirst({
      where: { rideId, userId },
      select: {
        status: true,
        ride: { select: { id: true, driverId: true, driver: { select: { userId: true } } } },
      },
    });

    if (!leg) throw DomainError.notFound('Ride');

    if (leg.status !== RidePassengerStatus.DROPPED_OFF) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'You can rate a ride once it is complete.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertNotRated(tx, { authorUserId: userId, rideId });

      await tx.rating.create({
        data: {
          serviceType: ServiceType.RIDE,
          rideId,
          authorUserId: userId,
          subjectUserId: leg.ride.driver?.userId ?? null,
          score: dto.score,
          comment: dto.comment,
        },
      });

      if (leg.ride.driverId) {
        await this.recomputeDriverRating(tx, leg.ride.driverId);
      }

      return { rated: true, score: dto.score };
    }, TRANSACTION_OPTIONS);
  }

  async rateFoodOrder(userId: string, orderId: string, dto: SubmitRatingDto) {
    const order = await this.prisma.foodOrder.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        status: true,
        restaurantId: true,
        delivery: { select: { driver: { select: { id: true, userId: true } } } },
      },
    });

    if (!order) throw DomainError.notFound('Order');

    if (order.status !== FoodOrderStatus.DELIVERED) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'You can rate an order once it has been delivered.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertNotRated(tx, { authorUserId: userId, foodOrderId: orderId });

      await tx.rating.create({
        data: {
          serviceType: ServiceType.FOOD_DELIVERY,
          foodOrderId: orderId,
          authorUserId: userId,
          subjectUserId: order.delivery?.driver?.userId ?? null,
          restaurantId: order.restaurantId,
          score: dto.score,
          comment: dto.comment,
        },
      });

      await this.recomputeRestaurantRating(tx, order.restaurantId);

      if (order.delivery?.driver) {
        await this.recomputeDriverRating(tx, order.delivery.driver.id);
      }

      return { rated: true, score: dto.score };
    }, TRANSACTION_OPTIONS);
  }

  async rateParcel(userId: string, parcelId: string, dto: SubmitRatingDto) {
    const parcel = await this.prisma.parcelOrder.findFirst({
      where: { id: parcelId, userId },
      select: {
        id: true,
        status: true,
        driverId: true,
        driver: { select: { userId: true } },
      },
    });

    if (!parcel) throw DomainError.notFound('Parcel');

    if (parcel.status !== ParcelStatus.DELIVERED) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'You can rate a parcel once it has been delivered.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertNotRated(tx, { authorUserId: userId, parcelOrderId: parcelId });

      await tx.rating.create({
        data: {
          serviceType: ServiceType.PARCEL,
          parcelOrderId: parcelId,
          authorUserId: userId,
          subjectUserId: parcel.driver?.userId ?? null,
          score: dto.score,
          comment: dto.comment,
        },
      });

      if (parcel.driverId) {
        await this.recomputeDriverRating(tx, parcel.driverId);
      }

      return { rated: true, score: dto.score };
    }, TRANSACTION_OPTIONS);
  }

  /** Which of a customer's completed items still await a rating. */
  async pending(userId: string) {
    const [rides, foodOrders, parcels] = await Promise.all([
      this.prisma.ridePassenger.findMany({
        where: {
          userId,
          status: RidePassengerStatus.DROPPED_OFF,
          ride: { ratings: { none: { authorUserId: userId } } },
        },
        take: 5,
        orderBy: { droppedOffAt: 'desc' },
        select: { rideId: true, ride: { select: { reference: true } }, droppedOffAt: true },
      }),
      this.prisma.foodOrder.findMany({
        where: {
          userId,
          status: FoodOrderStatus.DELIVERED,
          ratings: { none: { authorUserId: userId } },
        },
        take: 5,
        orderBy: { deliveredAt: 'desc' },
        select: {
          id: true,
          reference: true,
          deliveredAt: true,
          restaurant: { select: { name: true } },
        },
      }),
      this.prisma.parcelOrder.findMany({
        where: {
          userId,
          status: ParcelStatus.DELIVERED,
          ratings: { none: { authorUserId: userId } },
        },
        take: 5,
        orderBy: { deliveredAt: 'desc' },
        select: { id: true, reference: true, deliveredAt: true },
      }),
    ]);

    return {
      rides: rides.map((r) => ({
        id: r.rideId,
        reference: r.ride.reference,
        completedAt: r.droppedOffAt,
      })),
      foodOrders: foodOrders.map((o) => ({
        id: o.id,
        reference: o.reference,
        restaurant: o.restaurant.name,
        completedAt: o.deliveredAt,
      })),
      parcels: parcels.map((p) => ({
        id: p.id,
        reference: p.reference,
        completedAt: p.deliveredAt,
      })),
    };
  }

  private async assertNotRated(
    tx: Prisma.TransactionClient,
    where: {
      authorUserId: string;
      rideId?: string;
      foodOrderId?: string;
      parcelOrderId?: string;
    },
  ): Promise<void> {
    const existing = await tx.rating.findFirst({ where, select: { id: true } });

    if (existing) {
      throw DomainError.conflict(DomainErrorCode.CONFLICT, 'You have already rated this.');
    }
  }

  /**
   * Recomputed from the ratings table rather than incremented, so the cached
   * average can never drift away from the underlying data.
   */
  private async recomputeDriverRating(
    tx: Prisma.TransactionClient,
    driverId: string,
  ): Promise<void> {
    const driver = await tx.driver.findUnique({
      where: { id: driverId },
      select: { userId: true },
    });
    if (!driver) return;

    const stats = await tx.rating.aggregate({
      where: { subjectUserId: driver.userId },
      _avg: { score: true },
      _count: true,
    });

    await tx.driver.update({
      where: { id: driverId },
      data: {
        ratingAverage: new Prisma.Decimal(stats._avg.score ?? 0).toDecimalPlaces(2),
        ratingCount: stats._count,
      },
    });
  }

  private async recomputeRestaurantRating(
    tx: Prisma.TransactionClient,
    restaurantId: string,
  ): Promise<void> {
    const stats = await tx.rating.aggregate({
      where: { restaurantId },
      _avg: { score: true },
      _count: true,
    });

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        ratingAverage: new Prisma.Decimal(stats._avg.score ?? 0).toDecimalPlaces(2),
        ratingCount: stats._count,
      },
    });
  }
}
