import { Injectable, Logger } from '@nestjs/common';
import {
  CancelledBy,
  FoodOrderStatus,
  PaymentMethod,
  Prisma,
  RoleCode,
  ServiceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { Money, money, nonNegative, percentOf, round2, sum } from '../common/utils/money';
import { NOTIFICATION_TYPES } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../payments/wallet.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RoutingService } from '../routing/routing.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import { CheckoutFoodOrderDto } from './dto/food.dto';
import { assertFoodTransition } from './food-order.state';

/** Multi-step transactions against a managed database need more than 5 seconds. */
export const FOOD_TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

@Injectable()
export class FoodOrdersService {
  private readonly logger = new Logger(FoodOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly routing: RoutingService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly promotions: PromotionsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Turns a cart into a placed order.
   *
   * **Nothing the client sends about money is used.** The DTO has no total
   * field. Every line is re-priced from the menu as it stands right now, the
   * delivery fee is derived from the routed distance, and fees, tax and any
   * promotion are applied server-side. A stale cart price or a tampered request
   * changes nothing.
   *
   * Availability, opening state and delivery range are all re-checked at this
   * moment, because a cart may have been sitting for hours.
   */
  async checkout(userId: string, restaurantId: string, dto: CheckoutFoodOrderDto) {
    this.payments.assertMethodSupported(dto.paymentMethod);

    const restaurant = await this.restaurants.assertOrderable(restaurantId);

    const cart = await this.prisma.foodOrder.findFirst({
      where: { userId, restaurantId, status: FoodOrderStatus.DRAFT },
      select: {
        id: true,
        currency: true,
        items: {
          select: {
            id: true,
            menuItemId: true,
            quantity: true,
            notes: true,
            nameSnapshot: true,
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Your cart is empty. Add something before checking out.',
      );
    }

    // ---- re-price every line from the live menu -------------------------
    const menuItemIds = cart.items
      .map((i) => i.menuItemId)
      .filter((id): id is string => id !== null);

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId, deletedAt: null },
      select: { id: true, name: true, price: true, available: true, prepMinutes: true },
    });

    const byId = new Map(menuItems.map((i) => [i.id, i]));
    const unavailable: string[] = [];
    const repriced: Array<{
      cartItemId: string;
      menuItemId: string;
      name: string;
      unitPrice: Money;
      quantity: number;
      lineTotal: Money;
      notes: string | null;
    }> = [];

    for (const line of cart.items) {
      const menuItem = line.menuItemId ? byId.get(line.menuItemId) : undefined;

      if (!menuItem) {
        unavailable.push(line.nameSnapshot);
        continue;
      }
      if (!menuItem.available) {
        unavailable.push(menuItem.name);
        continue;
      }
      if (line.quantity < 1) {
        throw new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          `Invalid quantity for ${menuItem.name}.`,
        );
      }

      repriced.push({
        cartItemId: line.id,
        menuItemId: menuItem.id,
        name: menuItem.name,
        unitPrice: menuItem.price,
        quantity: line.quantity,
        // Rounded per line, because `food_order_items_line_total_reconciles`
        // requires line_total = unit_price × quantity exactly.
        lineTotal: round2(menuItem.price.times(line.quantity)),
        notes: line.notes,
      });
    }

    if (unavailable.length > 0) {
      throw new DomainError(
        DomainErrorCode.MENU_ITEM_UNAVAILABLE,
        unavailable.length === 1
          ? `${unavailable[0]} is no longer available. Please remove it and try again.`
          : `${unavailable.join(', ')} are no longer available. Please update your cart.`,
        undefined,
        { unavailableItems: unavailable },
      );
    }

    const itemsSubtotal = sum(repriced.map((l) => l.lineTotal));

    if (itemsSubtotal.lessThan(restaurant.minOrderAmount)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `${restaurant.name} has a minimum order of ${restaurant.minOrderAmount.toFixed(2)}.`,
      );
    }

    // ---- delivery reach and distance ------------------------------------
    const destination = { lat: dto.deliveryAddress.lat, lng: dto.deliveryAddress.lng };
    const reach = await this.restaurants.deliveryDistanceM(restaurantId, destination);

    const platformMaxRadius = await this.settings.getNumber(
      SETTING_KEYS.FOOD_MAX_DELIVERY_RADIUS_M,
    );

    if (!reach.withinRange || reach.distanceM > platformMaxRadius) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `${restaurant.name} does not deliver to that address.`,
      );
    }

    // Routed outside the transaction: no external call is made while a lock is
    // held. The route is only used to price and estimate, so a stale-by-seconds
    // answer is acceptable.
    const origin = await this.restaurants.location(restaurantId);
    const route = await this.routing.route({
      waypoints: [{ lat: origin.lat, lng: origin.lng }, destination],
    });

    // ---- price the delivery leg -----------------------------------------
    //
    // The fare quote prices the COURIER LEG only: what the delivery costs, what
    // the courier earns and what the platform takes from it. The order's own
    // columns carry the food. Keeping them separate is what lets a courier be
    // paid correctly regardless of what was ordered.
    const deliveryQuote = await this.pricing.quote({
      serviceType: ServiceType.FOOD_DELIVERY,
      vehicleTypeId: null,
      distanceM: route.distanceM,
      durationS: route.durationS,
      isShared: false,
    });

    const deliveryFee = deliveryQuote.grossFare;
    const serviceFee = deliveryQuote.serviceFee;
    const taxTotal = deliveryQuote.taxTotal;

    // ---- promotion --------------------------------------------------------
    const promotion = await this.promotions.resolve(
      dto.promotionCode,
      userId,
      ServiceType.FOOD_DELIVERY,
    );

    let discountTotal = money(0);
    if (promotion) {
      const eligibleBase = itemsSubtotal.plus(deliveryFee);
      if (eligibleBase.greaterThanOrEqualTo(promotion.minOrderAmount)) {
        discountTotal =
          promotion.type === 'PERCENT'
            ? percentOf(eligibleBase, promotion.value)
            : round2(promotion.value);

        if (promotion.maxDiscount) {
          const cap = round2(promotion.maxDiscount);
          if (discountTotal.greaterThan(cap)) discountTotal = cap;
        }
        // A discount can reduce a bill to zero but never below it.
        if (discountTotal.greaterThan(eligibleBase)) discountTotal = eligibleBase;
      }
    }

    const total = nonNegative(
      itemsSubtotal.plus(deliveryFee).plus(serviceFee).plus(taxTotal).minus(discountTotal),
    );

    // ---- restaurant split -------------------------------------------------
    const restaurantCommission = percentOf(itemsSubtotal, restaurant.commissionPct);
    const restaurantPayout = itemsSubtotal.minus(restaurantCommission);

    const prepMinutes = restaurant.defaultPrepMinutes;
    const quoteTtlS = await this.settings.getNumber(SETTING_KEYS.QUOTE_TTL_SECONDS);

    // ---- commit -----------------------------------------------------------
    const placed = await this.prisma.$transaction(async (tx) => {
      // Re-read the cart under the transaction and confirm it is still a draft.
      // A second checkout request that arrived first will have moved it on, and
      // this is where that race is resolved.
      const current = await tx.foodOrder.findFirst({
        where: { id: cart.id, userId, status: FoodOrderStatus.DRAFT },
        select: { id: true, status: true },
      });

      if (!current) {
        throw DomainError.conflict(
          DomainErrorCode.ORDER_NOT_MODIFIABLE,
          'This cart has already been checked out.',
        );
      }

      assertFoodTransition(FoodOrderStatus.DRAFT, FoodOrderStatus.PLACED, RoleCode.USER);

      // Rewrite the lines at the prices actually charged.
      await tx.foodOrderItem.deleteMany({ where: { orderId: cart.id } });
      await tx.foodOrderItem.createMany({
        data: repriced.map((line) => ({
          orderId: cart.id,
          menuItemId: line.menuItemId,
          nameSnapshot: line.name,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          notes: line.notes,
        })),
      });

      const fareQuoteId = await this.pricing.persistQuote(tx, deliveryQuote, quoteTtlS);

      const payment = await this.payments.createPending(tx, {
        userId,
        serviceType: ServiceType.FOOD_DELIVERY,
        method: dto.paymentMethod,
        amount: total,
        currency: cart.currency,
        // Ties the payment to this cart, so a retried checkout reuses it rather
        // than opening a second one.
        idempotencyKey: `food:${cart.id}`,
      });

      // Wallet funds move now; cash settles on the doorstep. Either way the
      // customer never tells the server that payment succeeded.
      if (dto.paymentMethod === PaymentMethod.WALLET) {
        await this.wallet.debit(tx, userId, total, {
          type: 'FOOD_ORDER',
          id: cart.id,
          description: `Food order from ${restaurant.name}`,
        });
        await this.payments.settle(tx, payment.id, { actorUserId: userId });
      }

      if (promotion && discountTotal.greaterThan(0)) {
        await this.promotions.redeem(tx, {
          promotionId: promotion.id,
          userId,
          referenceType: 'FOOD_ORDER',
          referenceId: cart.id,
          amount: discountTotal,
        });
      }

      const order = await tx.foodOrder.update({
        where: { id: cart.id },
        data: {
          status: FoodOrderStatus.PLACED,
          deliveryAddress: dto.deliveryAddress.address,
          deliveryLatitude: destination.lat,
          deliveryLongitude: destination.lng,
          deliveryNote: dto.deliveryNote,
          itemsSubtotal,
          deliveryFee,
          serviceFee,
          taxTotal,
          discountTotal,
          total,
          restaurantCommission,
          restaurantPayout,
          promotionId: promotion?.id ?? null,
          fareQuoteId,
          paymentId: payment.id,
          prepMinutes,
          placedAt: new Date(),
        },
        select: { id: true, reference: true, total: true, currency: true, placedAt: true },
      });

      // The courier job is created now, unassigned, so it is visible to couriers
      // as soon as the kitchen accepts.
      await tx.foodDelivery.create({
        data: {
          orderId: order.id,
          distanceM: route.distanceM,
          durationS: route.durationS,
          encodedPolyline: route.encodedPolyline,
        },
      });

      await tx.foodOrderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: FoodOrderStatus.DRAFT,
          toStatus: FoodOrderStatus.PLACED,
          actorUserId: userId,
          actorRole: RoleCode.USER,
          reason: 'Checkout',
        },
      });

      await this.audit.record(
        {
          actorUserId: userId,
          actorRole: RoleCode.USER,
          action: 'food.order.place',
          entityType: 'FoodOrder',
          entityId: order.id,
          newState: {
            restaurantId,
            itemsSubtotal: itemsSubtotal.toFixed(2),
            deliveryFee: deliveryFee.toFixed(2),
            discountTotal: discountTotal.toFixed(2),
            total: total.toFixed(2),
            restaurantCommission: restaurantCommission.toFixed(2),
            courierNet: deliveryQuote.driverNet.toFixed(2),
            paymentMethod: dto.paymentMethod,
            pricingRuleVersion: deliveryQuote.pricingRuleVersion,
          },
        },
        tx,
      );

      return order;
    }, FOOD_TRANSACTION_OPTIONS);

    await this.announcePlaced(placed.id, userId, restaurantId, placed.reference);

    return {
      orderId: placed.id,
      reference: placed.reference,
      status: FoodOrderStatus.PLACED,
      placedAt: placed.placedAt,
      currency: placed.currency,
      charge: {
        itemsSubtotal: itemsSubtotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        serviceFee: serviceFee.toFixed(2),
        tax: taxTotal.toFixed(2),
        discount: discountTotal.toFixed(2),
        total: total.toFixed(2),
      },
      estimatedPrepMinutes: prepMinutes,
      estimatedDeliveryMinutes: prepMinutes + Math.round(route.durationS / 60),
    };
  }

  /**
   * Customer cancellation.
   *
   * Allowed until the kitchen starts cooking — the cut-off is configurable,
   * because "how late can somebody cancel" is a commercial decision, not a
   * technical one. Wallet payments are refunded as part of the same transaction.
   */
  async cancelByCustomer(userId: string, orderId: string, reason?: string) {
    const cutoff = await this.settings.getString(SETTING_KEYS.FOOD_CANCELLATION_CUTOFF_STATUS);

    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);

      if (order.user_id !== userId) {
        throw DomainError.notFound('Order');
      }

      // Statuses at or beyond the cut-off are the kitchen's work already.
      const past = this.statusesFrom(cutoff as FoodOrderStatus);
      if (past.includes(order.status as FoodOrderStatus)) {
        throw new DomainError(
          DomainErrorCode.CANCELLATION_NOT_ALLOWED,
          'Your order is already being prepared and can no longer be cancelled here. Please contact support.',
        );
      }

      assertFoodTransition(
        order.status as FoodOrderStatus,
        FoodOrderStatus.CANCELLED,
        RoleCode.USER,
      );

      await this.applyCancellation(tx, {
        orderId,
        fromStatus: order.status as FoodOrderStatus,
        actorUserId: userId,
        actorRole: RoleCode.USER,
        cancelledBy: CancelledBy.USER,
        reason,
      });

      return { orderId, status: FoodOrderStatus.CANCELLED };
    }, FOOD_TRANSACTION_OPTIONS);
  }

  /**
   * Shared cancellation body, used by the customer, the restaurant and admin.
   * Releases the courier job, voids or refunds the payment, and records history.
   */
  async applyCancellation(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      fromStatus: FoodOrderStatus;
      actorUserId: string;
      actorRole: RoleCode;
      cancelledBy: CancelledBy;
      reason?: string;
    },
  ): Promise<void> {
    const order = await tx.foodOrder.findUniqueOrThrow({
      where: { id: params.orderId },
      select: {
        id: true,
        userId: true,
        restaurantId: true,
        reference: true,
        total: true,
        paymentId: true,
        payment: { select: { id: true, method: true, status: true } },
      },
    });

    await tx.foodOrder.update({
      where: { id: params.orderId },
      data: {
        status: FoodOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: params.cancelledBy,
        cancellationReason: params.reason,
      },
    });

    await tx.foodDelivery.updateMany({
      where: { orderId: params.orderId, status: { not: 'DELIVERED' } },
      data: { status: 'CANCELLED' },
    });

    if (order.payment) {
      // `cancel` refunds instead of voiding when the payment has already
      // settled, so a wallet customer gets their money back.
      await this.payments.cancel(tx, order.payment.id, params.reason ?? 'Order cancelled');

      if (order.payment.method === PaymentMethod.WALLET && order.payment.status === 'PAID') {
        await this.wallet.credit(tx, order.userId, order.total, {
          type: 'FOOD_ORDER_REFUND',
          id: order.id,
          description: `Refund for cancelled order ${order.reference}`,
        });
      }
    }

    await tx.foodOrderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: FoodOrderStatus.CANCELLED,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        reason: params.reason,
      },
    });

    await this.audit.record(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'food.order.cancel',
        entityType: 'FoodOrder',
        entityId: params.orderId,
        previousState: { status: params.fromStatus },
        newState: { status: FoodOrderStatus.CANCELLED, cancelledBy: params.cancelledBy },
      },
      tx,
    );

    await this.notifications.notify(
      {
        userId: order.userId,
        type: NOTIFICATION_TYPES.FOOD_ORDER_CANCELLED,
        title: 'Order cancelled',
        body: `Your order ${order.reference} has been cancelled.`,
        data: { orderId: order.id, reference: order.reference },
        dedupeKey: `food.order.cancelled:${order.id}`,
      },
      tx,
    );
  }

  /** Exclusive lock on the order row, for any state-changing operation. */
  async lockOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<{
    id: string;
    user_id: string;
    restaurant_id: string;
    status: string;
    reference: string;
    payment_id: string | null;
  }> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        restaurant_id: string;
        status: string;
        reference: string;
        payment_id: string | null;
      }>
    >`
      SELECT id, user_id, restaurant_id, status::text AS status, reference, payment_id
      FROM food_orders
      WHERE id = ${orderId}::uuid
      FOR UPDATE
    `;

    const order = rows[0];
    if (!order) throw DomainError.notFound('Order');
    return order;
  }

  /** Every status at or after the given one in the kitchen sequence. */
  private statusesFrom(cutoff: FoodOrderStatus): FoodOrderStatus[] {
    const sequence: FoodOrderStatus[] = [
      FoodOrderStatus.PLACED,
      FoodOrderStatus.ACCEPTED,
      FoodOrderStatus.PREPARING,
      FoodOrderStatus.READY_FOR_PICKUP,
      FoodOrderStatus.ASSIGNED,
      FoodOrderStatus.PICKED_UP,
      FoodOrderStatus.DELIVERING,
    ];
    const index = sequence.indexOf(cutoff);
    return index === -1 ? [] : sequence.slice(index);
  }

  private async announcePlaced(
    orderId: string,
    customerUserId: string,
    restaurantId: string,
    reference: string,
  ): Promise<void> {
    const staff = await this.prisma.restaurantUser.findMany({
      where: { restaurantId },
      select: { userId: true },
    });

    await this.notifications.notifyMany([
      {
        userId: customerUserId,
        type: NOTIFICATION_TYPES.FOOD_ORDER_PLACED,
        title: 'Order placed',
        body: `We have sent order ${reference} to the restaurant.`,
        data: { orderId, reference },
        dedupeKey: `food.order.placed:${orderId}`,
      },
      ...staff.map((member) => ({
        userId: member.userId,
        type: NOTIFICATION_TYPES.RESTAURANT_ORDER_RECEIVED,
        title: 'New order',
        body: `Order ${reference} is waiting for you to accept it.`,
        data: { orderId, reference },
        dedupeKey: `restaurant.order.received:${orderId}`,
      })),
    ]);
  }
}
