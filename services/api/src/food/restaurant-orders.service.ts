import { Injectable } from '@nestjs/common';
import {
  CancelledBy,
  DeliveryStatus,
  FoodOrderStatus,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { NOTIFICATION_TYPES } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { AcceptOrderDto, RejectOrderDto } from '../restaurants/dto/restaurants.dto';
import { assertFoodTransition } from './food-order.state';
import { FOOD_TRANSACTION_OPTIONS, FoodOrdersService } from './food-orders.service';

/**
 * The restaurant's side of an order.
 *
 * Every method confirms two things before doing anything: that the signed-in
 * user works for this restaurant, and that the order belongs to it. An order id
 * from another restaurant does not resolve, so there is nothing to probe.
 */
@Injectable()
export class RestaurantOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly orders: FoodOrdersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Orders needing attention now, newest first. */
  async activeOrders(restaurantId: string, userId: string) {
    await this.restaurants.assertMember(restaurantId, userId);

    const orders = await this.prisma.foodOrder.findMany({
      where: {
        restaurantId,
        status: {
          in: [
            FoodOrderStatus.PLACED,
            FoodOrderStatus.ACCEPTED,
            FoodOrderStatus.PREPARING,
            FoodOrderStatus.READY_FOR_PICKUP,
            FoodOrderStatus.ASSIGNED,
          ],
        },
      },
      orderBy: { placedAt: 'asc' },
      select: this.orderSelect(),
    });

    return orders.map((order) => this.presentForRestaurant(order));
  }

  async history(restaurantId: string, userId: string, pagination: CursorPaginationDto) {
    await this.restaurants.assertMember(restaurantId, userId);

    const rows = await this.prisma.foodOrder.findMany({
      where: {
        restaurantId,
        status: {
          in: [
            FoodOrderStatus.DELIVERED,
            FoodOrderStatus.CANCELLED,
            FoodOrderStatus.REJECTED,
          ],
        },
      },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: this.orderSelect(),
    });

    return buildCursorPage(rows.map((o) => this.presentForRestaurant(o)), pagination.limit);
  }

  async findOne(restaurantId: string, userId: string, orderId: string) {
    await this.restaurants.assertMember(restaurantId, userId);

    const order = await this.prisma.foodOrder.findFirst({
      where: { id: orderId, restaurantId },
      select: this.orderSelect(),
    });

    if (!order) throw DomainError.notFound('Order');
    return this.presentForRestaurant(order);
  }

  /**
   * Accept an order and commit to a preparation time.
   *
   * The transition itself asserts the actor's role, so a customer or courier
   * calling this endpoint is refused even before the ownership check matters.
   */
  async accept(restaurantId: string, userId: string, orderId: string, dto: AcceptOrderDto) {
    await this.restaurants.assertMember(restaurantId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.orders.lockOrder(tx, orderId);
      this.assertBelongs(order.restaurant_id, restaurantId);

      assertFoodTransition(
        order.status as FoodOrderStatus,
        FoodOrderStatus.ACCEPTED,
        RoleCode.RESTAURANT,
      );

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { defaultPrepMinutes: true },
      });

      const prepMinutes = dto.prepMinutes ?? restaurant.defaultPrepMinutes;

      await tx.foodOrder.update({
        where: { id: orderId },
        data: {
          status: FoodOrderStatus.ACCEPTED,
          acceptedAt: new Date(),
          prepMinutes,
        },
      });

      await this.recordTransition(tx, {
        orderId,
        from: order.status as FoodOrderStatus,
        to: FoodOrderStatus.ACCEPTED,
        actorUserId: userId,
        actorRole: RoleCode.RESTAURANT,
      });

      return { orderId, prepMinutes, customerUserId: order.user_id, reference: order.reference };
    }, FOOD_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.customerUserId,
      type: NOTIFICATION_TYPES.FOOD_ORDER_ACCEPTED,
      title: 'Order confirmed',
      body: `The restaurant is preparing ${result.reference}. About ${result.prepMinutes} minutes.`,
      data: { orderId, prepMinutes: result.prepMinutes },
      dedupeKey: `food.order.accepted:${orderId}`,
    });

    return { orderId, status: FoodOrderStatus.ACCEPTED, prepMinutes: result.prepMinutes };
  }

  /** Reject an order. The customer is refunded in the same transaction. */
  async reject(restaurantId: string, userId: string, orderId: string, dto: RejectOrderDto) {
    await this.restaurants.assertMember(restaurantId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.orders.lockOrder(tx, orderId);
      this.assertBelongs(order.restaurant_id, restaurantId);

      assertFoodTransition(
        order.status as FoodOrderStatus,
        FoodOrderStatus.REJECTED,
        RoleCode.RESTAURANT,
      );

      // A rejection is a cancellation with a different label and a different
      // author, so it reuses the same money-unwinding path.
      await this.orders.applyCancellation(tx, {
        orderId,
        fromStatus: order.status as FoodOrderStatus,
        actorUserId: userId,
        actorRole: RoleCode.RESTAURANT,
        cancelledBy: CancelledBy.ADMIN,
        reason: dto.reason,
      });

      await tx.foodOrder.update({
        where: { id: orderId },
        data: { status: FoodOrderStatus.REJECTED, rejectionReason: dto.reason },
      });

      return { customerUserId: order.user_id, reference: order.reference };
    }, FOOD_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.customerUserId,
      type: NOTIFICATION_TYPES.FOOD_ORDER_REJECTED,
      title: 'Order could not be accepted',
      body: `${result.reference} was declined: ${dto.reason}. Any payment has been refunded.`,
      data: { orderId, reason: dto.reason },
      dedupeKey: `food.order.rejected:${orderId}`,
    });

    return { orderId, status: FoodOrderStatus.REJECTED };
  }

  async startPreparing(restaurantId: string, userId: string, orderId: string) {
    await this.restaurants.assertMember(restaurantId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.orders.lockOrder(tx, orderId);
      this.assertBelongs(order.restaurant_id, restaurantId);

      assertFoodTransition(
        order.status as FoodOrderStatus,
        FoodOrderStatus.PREPARING,
        RoleCode.RESTAURANT,
      );

      await tx.foodOrder.update({
        where: { id: orderId },
        data: { status: FoodOrderStatus.PREPARING },
      });

      await this.recordTransition(tx, {
        orderId,
        from: order.status as FoodOrderStatus,
        to: FoodOrderStatus.PREPARING,
        actorUserId: userId,
        actorRole: RoleCode.RESTAURANT,
      });

      return { customerUserId: order.user_id, reference: order.reference };
    }, FOOD_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.customerUserId,
      type: NOTIFICATION_TYPES.FOOD_ORDER_PREPARING,
      title: 'Your food is being prepared',
      body: `${result.reference} is on the stove.`,
      data: { orderId },
      dedupeKey: `food.order.preparing:${orderId}`,
    });

    return { orderId, status: FoodOrderStatus.PREPARING };
  }

  /**
   * The food is ready.
   *
   * If a courier has already claimed the job, the order goes straight to
   * ASSIGNED rather than sitting at READY_FOR_PICKUP with nobody to wait for.
   */
  async markReady(restaurantId: string, userId: string, orderId: string) {
    await this.restaurants.assertMember(restaurantId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.orders.lockOrder(tx, orderId);
      this.assertBelongs(order.restaurant_id, restaurantId);

      const delivery = await tx.foodDelivery.findUnique({
        where: { orderId },
        select: { driverId: true, status: true },
      });

      const courierWaiting =
        delivery?.driverId !== null && delivery?.status !== DeliveryStatus.UNASSIGNED;

      const target = courierWaiting
        ? FoodOrderStatus.ASSIGNED
        : FoodOrderStatus.READY_FOR_PICKUP;

      assertFoodTransition(order.status as FoodOrderStatus, target, RoleCode.RESTAURANT);

      await tx.foodOrder.update({
        where: { id: orderId },
        data: { status: target, readyAt: new Date() },
      });

      await this.recordTransition(tx, {
        orderId,
        from: order.status as FoodOrderStatus,
        to: target,
        actorUserId: userId,
        actorRole: RoleCode.RESTAURANT,
        reason: courierWaiting ? 'Ready, courier already assigned' : 'Ready for collection',
      });

      return {
        target,
        customerUserId: order.user_id,
        reference: order.reference,
        courierUserId: null as string | null,
      };
    }, FOOD_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.customerUserId,
      type: NOTIFICATION_TYPES.FOOD_ORDER_READY,
      title: 'Your food is ready',
      body: `${result.reference} is ready and waiting for a courier.`,
      data: { orderId },
      dedupeKey: `food.order.ready:${orderId}`,
    });

    return { orderId, status: result.target };
  }

  /** Aggregated takings, computed in the database rather than in memory. */
  async earnings(restaurantId: string, userId: string, from?: Date, to?: Date) {
    await this.restaurants.assertMember(restaurantId, userId, 'OWNER');

    const where: Prisma.FoodOrderWhereInput = {
      restaurantId,
      status: FoodOrderStatus.DELIVERED,
      ...(from || to
        ? { deliveredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };

    const totals = await this.prisma.foodOrder.aggregate({
      where,
      _sum: {
        itemsSubtotal: true,
        restaurantCommission: true,
        restaurantPayout: true,
        deliveryFee: true,
      },
      _count: true,
    });

    const zero = new Prisma.Decimal(0);

    return {
      orders: totals._count,
      foodSales: (totals._sum.itemsSubtotal ?? zero).toFixed(2),
      platformCommission: (totals._sum.restaurantCommission ?? zero).toFixed(2),
      payout: (totals._sum.restaurantPayout ?? zero).toFixed(2),
      // Shown for context; delivery fees are the courier's and the platform's,
      // never the restaurant's.
      deliveryFeesCollected: (totals._sum.deliveryFee ?? zero).toFixed(2),
    };
  }

  // ------------------------------------------------------------------ helpers

  private assertBelongs(orderRestaurantId: string, restaurantId: string): void {
    if (orderRestaurantId !== restaurantId) {
      // Not "forbidden": a restaurant should not learn that an order exists
      // elsewhere by guessing identifiers.
      throw DomainError.notFound('Order');
    }
  }

  private async recordTransition(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      from: FoodOrderStatus;
      to: FoodOrderStatus;
      actorUserId: string;
      actorRole: RoleCode;
      reason?: string;
    },
  ): Promise<void> {
    await tx.foodOrderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.from,
        toStatus: params.to,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        reason: params.reason,
      },
    });

    await this.audit.record(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: `food.order.${params.to.toLowerCase()}`,
        entityType: 'FoodOrder',
        entityId: params.orderId,
        previousState: { status: params.from },
        newState: { status: params.to },
      },
      tx,
    );
  }

  private orderSelect() {
    return {
      id: true,
      reference: true,
      status: true,
      currency: true,
      itemsSubtotal: true,
      deliveryFee: true,
      total: true,
      restaurantCommission: true,
      restaurantPayout: true,
      prepMinutes: true,
      placedAt: true,
      acceptedAt: true,
      readyAt: true,
      deliveredAt: true,
      deliveryNote: true,
      cancellationReason: true,
      rejectionReason: true,
      items: {
        select: { nameSnapshot: true, quantity: true, unitPrice: true, lineTotal: true, notes: true },
      },
      // The kitchen needs a name to call out and nothing else. No phone number,
      // no address: the courier carries the food, not the restaurant.
      user: { select: { firstName: true } },
      delivery: {
        select: {
          status: true,
          assignedAt: true,
          pickedUpAt: true,
          driver: { select: { user: { select: { firstName: true } } } },
        },
      },
      payment: { select: { method: true, status: true } },
    } satisfies Prisma.FoodOrderSelect;
  }

  private presentForRestaurant(
    order: Prisma.FoodOrderGetPayload<{
      select: ReturnType<RestaurantOrdersService['orderSelect']>;
    }>,
  ) {
    return {
      id: order.id,
      reference: order.reference,
      status: order.status,
      currency: order.currency,
      customerFirstName: order.user.firstName,
      items: order.items.map((item) => ({
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        notes: item.notes,
      })),
      money: {
        foodTotal: order.itemsSubtotal.toFixed(2),
        commission: order.restaurantCommission.toFixed(2),
        yourPayout: order.restaurantPayout.toFixed(2),
      },
      prepMinutes: order.prepMinutes,
      deliveryNote: order.deliveryNote,
      courier: order.delivery?.driver
        ? { firstName: order.delivery.driver.user.firstName, status: order.delivery.status }
        : { firstName: null, status: order.delivery?.status ?? null },
      paymentMethod: order.payment?.method ?? null,
      timeline: {
        placedAt: order.placedAt,
        acceptedAt: order.acceptedAt,
        readyAt: order.readyAt,
        deliveredAt: order.deliveredAt,
      },
      cancellationReason: order.cancellationReason,
      rejectionReason: order.rejectionReason,
    };
  }
}
