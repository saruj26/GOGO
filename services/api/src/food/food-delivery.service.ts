import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryStatus,
  EarningStatus,
  FoodOrderStatus,
  PaymentMethod,
  Prisma,
  RoleCode,
  ServiceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { DeliveryAssignmentService } from '../deliveries/delivery-assignment.service';
import { NOTIFICATION_TYPES } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { FOOD_ORDER_AWAITING_COURIER, assertFoodTransition } from './food-order.state';
import { FOOD_TRANSACTION_OPTIONS, FoodOrdersService } from './food-orders.service';

/**
 * Legal courier progress through a delivery. The order's own status machine is
 * separate and is advanced alongside it, because the two answer different
 * questions: where the courier is, and where the food is.
 */
const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.UNASSIGNED]: [DeliveryStatus.ASSIGNED, DeliveryStatus.CANCELLED],
  [DeliveryStatus.ASSIGNED]: [
    DeliveryStatus.HEADING_TO_PICKUP,
    DeliveryStatus.UNASSIGNED,
    DeliveryStatus.CANCELLED,
  ],
  [DeliveryStatus.HEADING_TO_PICKUP]: [
    DeliveryStatus.AT_PICKUP,
    DeliveryStatus.UNASSIGNED,
    DeliveryStatus.CANCELLED,
  ],
  [DeliveryStatus.AT_PICKUP]: [DeliveryStatus.PICKED_UP, DeliveryStatus.CANCELLED],
  [DeliveryStatus.PICKED_UP]: [DeliveryStatus.DELIVERING, DeliveryStatus.FAILED],
  [DeliveryStatus.DELIVERING]: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED],
  [DeliveryStatus.DELIVERED]: [],
  [DeliveryStatus.CANCELLED]: [],
  [DeliveryStatus.FAILED]: [],
};

@Injectable()
export class FoodDeliveryService {
  private readonly logger = new Logger(FoodDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignment: DeliveryAssignmentService,
    private readonly orders: FoodOrdersService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Food jobs a courier could take right now.
   *
   * Restricted to orders the kitchen has already accepted — offering a courier
   * a job the restaurant might still decline wastes their time.
   */
  async availableJobs(driverId: string) {
    const free = await this.assignment.isCourierFree(driverId);
    if (!free) {
      throw new DomainError(
        DomainErrorCode.DRIVER_UNAVAILABLE,
        'Finish your current job before taking another.',
      );
    }

    const jobs = await this.prisma.foodDelivery.findMany({
      where: {
        status: DeliveryStatus.UNASSIGNED,
        driverId: null,
        order: { status: { in: FOOD_ORDER_AWAITING_COURIER } },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: {
        id: true,
        distanceM: true,
        durationS: true,
        order: {
          select: {
            id: true,
            reference: true,
            status: true,
            deliveryFee: true,
            currency: true,
            prepMinutes: true,
            readyAt: true,
            // The courier needs to know where to collect from and roughly where
            // they are going. The customer's exact address and phone number are
            // withheld until the job is theirs.
            restaurant: {
              select: { id: true, name: true, addressLine: true, latitude: true, longitude: true },
            },
            fareQuote: { select: { driverNet: true, currency: true } },
          },
        },
      },
    });

    return jobs.map((job) => ({
      deliveryId: job.id,
      orderId: job.order.id,
      reference: job.order.reference,
      orderStatus: job.order.status,
      collectFrom: {
        name: job.order.restaurant.name,
        address: job.order.restaurant.addressLine,
        lat: Number(job.order.restaurant.latitude),
        lng: Number(job.order.restaurant.longitude),
      },
      distanceM: job.distanceM,
      durationS: job.durationS,
      readyAt: job.order.readyAt,
      estimatedReadyInMinutes: job.order.prepMinutes,
      // What the courier will actually be paid, not what the customer pays.
      yourEarning: job.order.fareQuote?.driverNet.toFixed(2) ?? null,
      currency: job.order.fareQuote?.currency ?? job.order.currency,
    }));
  }

  /**
   * A courier claims a job.
   *
   * The claim is a single guarded UPDATE: it only succeeds while the delivery is
   * still unassigned, so two couriers pressing accept at the same moment are
   * resolved by the database rather than by whoever's request arrived first.
   * `food_deliveries_one_active_per_driver` independently prevents one courier
   * from holding two.
   */
  async accept(driverId: string, deliveryId: string, actorUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const availability = await tx.driverAvailability.findUnique({
        where: { driverId },
        select: { presence: true, activeVehicleId: true, acceptsFood: true },
      });

      if (!availability?.acceptsFood || availability.presence === 'OFFLINE') {
        throw new DomainError(
          DomainErrorCode.DRIVER_UNAVAILABLE,
          'Go online and enable food deliveries before accepting jobs.',
        );
      }

      if (!availability.activeVehicleId) {
        throw new DomainError(
          DomainErrorCode.DRIVER_UNAVAILABLE,
          'Select the vehicle you are using before accepting jobs.',
        );
      }

      // `food_deliveries_one_active_per_driver` is the real guarantee, but a
      // raw index violation reaches the client as an opaque error. Checking
      // first turns "we already have you on a job" into a sentence a courier
      // can act on, without weakening the constraint behind it.
      if (!(await this.assignment.isCourierFree(driverId))) {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          'You are already on a job. Finish it before taking another.',
        );
      }

      const claimed = await tx.$executeRaw`
        UPDATE food_deliveries
        SET driver_id   = ${driverId}::uuid,
            vehicle_id  = ${availability.activeVehicleId}::uuid,
            status      = 'ASSIGNED',
            assigned_at = now()
        WHERE id = ${deliveryId}::uuid
          AND driver_id IS NULL
          AND status = 'UNASSIGNED'
      `;

      if (claimed !== 1) {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          'Another courier has just taken this delivery.',
        );
      }

      const delivery = await tx.foodDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
        select: {
          orderId: true,
          order: {
            select: {
              id: true,
              status: true,
              reference: true,
              userId: true,
              restaurantId: true,
            },
          },
        },
      });

      // The order only becomes ASSIGNED once the food is actually ready; a
      // courier claiming during preparation simply waits.
      if (delivery.order.status === FoodOrderStatus.READY_FOR_PICKUP) {
        assertFoodTransition(
          FoodOrderStatus.READY_FOR_PICKUP,
          FoodOrderStatus.ASSIGNED,
          RoleCode.DRIVER,
        );

        await tx.foodOrder.update({
          where: { id: delivery.orderId },
          data: { status: FoodOrderStatus.ASSIGNED },
        });

        await tx.foodOrderStatusHistory.create({
          data: {
            orderId: delivery.orderId,
            fromStatus: FoodOrderStatus.READY_FOR_PICKUP,
            toStatus: FoodOrderStatus.ASSIGNED,
            actorUserId,
            actorRole: RoleCode.DRIVER,
            reason: 'Courier accepted',
          },
        });
      }

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'food.delivery.accept',
          entityType: 'FoodDelivery',
          entityId: deliveryId,
          newState: { driverId, orderId: delivery.orderId },
        },
        tx,
      );

      return delivery.order;
    }, FOOD_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.userId,
      type: NOTIFICATION_TYPES.FOOD_ORDER_COURIER_ASSIGNED,
      title: 'A courier is on the way',
      body: `A courier has picked up the job for ${result.reference}.`,
      data: { orderId: result.id, deliveryId },
      dedupeKey: `food.order.courier_assigned:${result.id}`,
    });

    return { deliveryId, orderId: result.id, status: DeliveryStatus.ASSIGNED };
  }

  /** Courier is en route to the restaurant. */
  headingToPickup(driverId: string, deliveryId: string, actorUserId: string) {
    return this.advance(driverId, deliveryId, actorUserId, DeliveryStatus.HEADING_TO_PICKUP);
  }

  /** Courier has arrived at the restaurant. */
  arrivedAtPickup(driverId: string, deliveryId: string, actorUserId: string) {
    return this.advance(driverId, deliveryId, actorUserId, DeliveryStatus.AT_PICKUP);
  }

  /**
   * Courier has the food. This moves the ORDER on too, because collection is
   * the moment responsibility passes from the kitchen to the road.
   */
  async confirmPickup(driverId: string, deliveryId: string, actorUserId: string) {
    return this.advance(driverId, deliveryId, actorUserId, DeliveryStatus.PICKED_UP, {
      orderStatus: FoodOrderStatus.PICKED_UP,
      notify: {
        type: NOTIFICATION_TYPES.FOOD_ORDER_PICKED_UP,
        title: 'Your food has been collected',
        body: 'Your courier has your order and is on the way.',
      },
      alsoNotifyRestaurant: {
        type: NOTIFICATION_TYPES.RESTAURANT_ORDER_COLLECTED,
        title: 'Order collected',
        body: 'A courier has collected the order.',
      },
    });
  }

  /** Courier is on the way to the customer. */
  startDelivering(driverId: string, deliveryId: string, actorUserId: string) {
    return this.advance(driverId, deliveryId, actorUserId, DeliveryStatus.DELIVERING, {
      orderStatus: FoodOrderStatus.DELIVERING,
      notify: {
        type: NOTIFICATION_TYPES.FOOD_ORDER_DELIVERING,
        title: 'Out for delivery',
        body: 'Your order is on its way to you.',
      },
    });
  }

  /**
   * Delivery complete: settle the customer's payment, pay the courier, and
   * record the platform's cut — each from the persisted quote, so the amounts
   * are the ones that were agreed at checkout.
   */
  async completeDelivery(driverId: string, deliveryId: string, actorUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const delivery = await this.lockDelivery(tx, deliveryId, driverId);

      this.assertDeliveryTransition(
        delivery.status as DeliveryStatus,
        DeliveryStatus.DELIVERED,
      );

      const order = await tx.foodOrder.findUniqueOrThrow({
        where: { id: delivery.order_id },
        select: {
          id: true,
          status: true,
          userId: true,
          reference: true,
          restaurantId: true,
          paymentId: true,
          payment: { select: { id: true, method: true, status: true } },
          fareQuote: true,
        },
      });

      assertFoodTransition(
        order.status as FoodOrderStatus,
        FoodOrderStatus.DELIVERED,
        RoleCode.DRIVER,
      );

      const now = new Date();

      await tx.foodDelivery.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.DELIVERED, deliveredAt: now },
      });

      await tx.foodOrder.update({
        where: { id: order.id },
        data: { status: FoodOrderStatus.DELIVERED, deliveredAt: now },
      });

      // Cash is collected at the door, so this is the point it is settled.
      // Wallet payments already settled at checkout and `settle` is a no-op.
      if (order.payment && order.payment.method === PaymentMethod.CASH) {
        await this.payments.settle(tx, order.payment.id, { actorUserId });
      }

      let courierNet = new Prisma.Decimal(0);

      if (order.fareQuote) {
        const quote = order.fareQuote;

        const earning = await tx.driverEarning.create({
          data: {
            driverId,
            serviceType: ServiceType.FOOD_DELIVERY,
            status: EarningStatus.AVAILABLE,
            foodOrderId: order.id,
            fareQuoteId: quote.id,
            grossAmount: quote.driverGross,
            commissionAmount: quote.platformCommission,
            stopFeeAmount: quote.driverStopFees,
            bonusAmount: quote.driverBonus,
            adjustmentAmount: new Prisma.Decimal(0),
            netAmount: quote.driverNet,
            currency: quote.currency,
          },
          select: { id: true },
        });

        await tx.platformCommission.create({
          data: {
            earningId: earning.id,
            serviceType: ServiceType.FOOD_DELIVERY,
            ratePct: quote.driverGross.isZero()
              ? new Prisma.Decimal(0)
              : quote.platformCommission
                  .dividedBy(quote.driverGross)
                  .times(100)
                  .toDecimalPlaces(2),
            amount: quote.platformCommission,
            currency: quote.currency,
          },
        });

        courierNet = quote.driverNet;
      } else {
        // A delivered order with no quote cannot be paid correctly. Loudly
        // logged rather than silently paying zero.
        this.logger.error(
          `Food order ${order.id} was delivered without a fare quote — courier settlement skipped`,
        );
      }

      await tx.foodOrderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status as FoodOrderStatus,
          toStatus: FoodOrderStatus.DELIVERED,
          actorUserId,
          actorRole: RoleCode.DRIVER,
        },
      });

      await tx.driver.update({
        where: { id: driverId },
        data: { completedTrips: { increment: 1 } },
      });

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'food.delivery.complete',
          entityType: 'FoodOrder',
          entityId: order.id,
          previousState: { status: order.status },
          newState: {
            status: FoodOrderStatus.DELIVERED,
            courierNet: courierNet.toFixed(2),
            paymentMethod: order.payment?.method ?? null,
          },
        },
        tx,
      );

      return {
        orderId: order.id,
        reference: order.reference,
        customerUserId: order.userId,
        courierNet: courierNet.toFixed(2),
      };
    }, FOOD_TRANSACTION_OPTIONS);

    await this.notifications.notify({
      userId: result.customerUserId,
      type: NOTIFICATION_TYPES.FOOD_ORDER_DELIVERED,
      title: 'Delivered',
      body: `Your order ${result.reference} has arrived. Enjoy.`,
      data: { orderId: result.orderId },
      dedupeKey: `food.order.delivered:${result.orderId}`,
    });

    return {
      deliveryId,
      orderId: result.orderId,
      status: DeliveryStatus.DELIVERED,
      yourEarning: result.courierNet,
    };
  }

  /**
   * A courier gives up a job they cannot complete.
   *
   * Only possible before collection — once the courier has the food, walking
   * away is a failed delivery, not a release. The order returns to waiting for a
   * courier rather than being cancelled: the customer's food is unaffected.
   */
  async release(driverId: string, deliveryId: string, actorUserId: string, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const delivery = await this.lockDelivery(tx, deliveryId, driverId);

      const releasable: DeliveryStatus[] = [
        DeliveryStatus.ASSIGNED,
        DeliveryStatus.HEADING_TO_PICKUP,
      ];

      if (!releasable.includes(delivery.status as DeliveryStatus)) {
        throw new DomainError(
          DomainErrorCode.ORDER_NOT_MODIFIABLE,
          'You already have the food. Report a failed delivery instead of releasing the job.',
        );
      }

      await tx.foodDelivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.UNASSIGNED,
          driverId: null,
          vehicleId: null,
          assignedAt: null,
        },
      });

      const order = await tx.foodOrder.findUniqueOrThrow({
        where: { id: delivery.order_id },
        select: { id: true, status: true, userId: true },
      });

      // An order already marked ASSIGNED goes back to waiting; one still being
      // prepared never moved, so there is nothing to undo.
      if (order.status === FoodOrderStatus.ASSIGNED) {
        assertFoodTransition(
          FoodOrderStatus.ASSIGNED,
          FoodOrderStatus.READY_FOR_PICKUP,
          RoleCode.DRIVER,
        );

        await tx.foodOrder.update({
          where: { id: order.id },
          data: { status: FoodOrderStatus.READY_FOR_PICKUP },
        });

        await tx.foodOrderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: FoodOrderStatus.ASSIGNED,
            toStatus: FoodOrderStatus.READY_FOR_PICKUP,
            actorUserId,
            actorRole: RoleCode.DRIVER,
            reason: reason ?? 'Courier released the job',
          },
        });
      }

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.DRIVER,
          action: 'food.delivery.release',
          entityType: 'FoodDelivery',
          entityId: deliveryId,
          previousState: { driverId, status: delivery.status },
          newState: { driverId: null, status: DeliveryStatus.UNASSIGNED, reason },
        },
        tx,
      );

      return { orderId: order.id };
    }, FOOD_TRANSACTION_OPTIONS);

    return { deliveryId, orderId: result.orderId, status: DeliveryStatus.UNASSIGNED };
  }

  /** The courier's current job, with everything they need to complete it. */
  async currentJob(driverId: string) {
    const delivery = await this.prisma.foodDelivery.findFirst({
      where: {
        driverId,
        status: {
          in: [
            DeliveryStatus.ASSIGNED,
            DeliveryStatus.HEADING_TO_PICKUP,
            DeliveryStatus.AT_PICKUP,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.DELIVERING,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        distanceM: true,
        durationS: true,
        encodedPolyline: true,
        assignedAt: true,
        pickedUpAt: true,
        order: {
          select: {
            id: true,
            reference: true,
            status: true,
            deliveryAddress: true,
            deliveryLatitude: true,
            deliveryLongitude: true,
            deliveryNote: true,
            total: true,
            currency: true,
            restaurant: {
              select: { name: true, phone: true, addressLine: true, latitude: true, longitude: true },
            },
            items: { select: { nameSnapshot: true, quantity: true } },
            payment: { select: { method: true, status: true } },
            fareQuote: { select: { driverNet: true } },
            // Released only because this courier is carrying this order.
            user: { select: { firstName: true, phone: true } },
          },
        },
      },
    });

    if (!delivery) return null;

    const order = delivery.order;
    const collectOnDelivery =
      order.payment?.method === PaymentMethod.CASH && order.payment.status !== 'PAID';

    return {
      deliveryId: delivery.id,
      status: delivery.status,
      order: {
        id: order.id,
        reference: order.reference,
        status: order.status,
        itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
        items: order.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity })),
      },
      collectFrom: {
        name: order.restaurant.name,
        phone: order.restaurant.phone,
        address: order.restaurant.addressLine,
        lat: Number(order.restaurant.latitude),
        lng: Number(order.restaurant.longitude),
      },
      deliverTo: {
        customerFirstName: order.user.firstName,
        phone: order.user.phone,
        address: order.deliveryAddress,
        lat: Number(order.deliveryLatitude),
        lng: Number(order.deliveryLongitude),
        note: order.deliveryNote,
      },
      cashToCollect: collectOnDelivery ? order.total.toFixed(2) : null,
      yourEarning: order.fareQuote?.driverNet.toFixed(2) ?? null,
      currency: order.currency,
      route: {
        distanceM: delivery.distanceM,
        durationS: delivery.durationS,
        polyline: delivery.encodedPolyline,
      },
    };
  }

  async history(driverId: string, pagination: CursorPaginationDto) {
    const rows = await this.prisma.foodDelivery.findMany({
      where: { driverId },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        assignedAt: true,
        deliveredAt: true,
        distanceM: true,
        order: {
          select: {
            reference: true,
            restaurant: { select: { name: true } },
            fareQuote: { select: { driverNet: true, currency: true } },
          },
        },
      },
    });

    return buildCursorPage(rows, pagination.limit);
  }

  // ------------------------------------------------------------------ internals

  /**
   * Advances the courier's own status, optionally moving the order with it.
   * Every step re-verifies that this delivery is this courier's.
   */
  private async advance(
    driverId: string,
    deliveryId: string,
    actorUserId: string,
    to: DeliveryStatus,
    options: {
      orderStatus?: FoodOrderStatus;
      notify?: { type: string; title: string; body: string };
      alsoNotifyRestaurant?: { type: string; title: string; body: string };
    } = {},
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const delivery = await this.lockDelivery(tx, deliveryId, driverId);

      this.assertDeliveryTransition(delivery.status as DeliveryStatus, to);

      await tx.foodDelivery.update({
        where: { id: deliveryId },
        data: {
          status: to,
          ...(to === DeliveryStatus.PICKED_UP ? { pickedUpAt: new Date() } : {}),
        },
      });

      let customerUserId: string | null = null;
      let restaurantId: string | null = null;
      let orderId = delivery.order_id;

      if (options.orderStatus) {
        const order = await tx.foodOrder.findUniqueOrThrow({
          where: { id: delivery.order_id },
          select: { id: true, status: true, userId: true, restaurantId: true },
        });

        assertFoodTransition(
          order.status as FoodOrderStatus,
          options.orderStatus,
          RoleCode.DRIVER,
        );

        await tx.foodOrder.update({
          where: { id: order.id },
          data: { status: options.orderStatus },
        });

        await tx.foodOrderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status as FoodOrderStatus,
            toStatus: options.orderStatus,
            actorUserId,
            actorRole: RoleCode.DRIVER,
          },
        });

        customerUserId = order.userId;
        restaurantId = order.restaurantId;
        orderId = order.id;
      }

      return { orderId, customerUserId, restaurantId };
    }, FOOD_TRANSACTION_OPTIONS);

    if (options.notify && result.customerUserId) {
      await this.notifications.notify({
        userId: result.customerUserId,
        type: options.notify.type as never,
        title: options.notify.title,
        body: options.notify.body,
        data: { orderId: result.orderId, deliveryId },
        dedupeKey: `${options.notify.type}:${result.orderId}`,
      });
    }

    if (options.alsoNotifyRestaurant && result.restaurantId) {
      const staff = await this.prisma.restaurantUser.findMany({
        where: { restaurantId: result.restaurantId },
        select: { userId: true },
      });

      await this.notifications.notifyMany(
        staff.map((member) => ({
          userId: member.userId,
          type: options.alsoNotifyRestaurant!.type as never,
          title: options.alsoNotifyRestaurant!.title,
          body: options.alsoNotifyRestaurant!.body,
          data: { orderId: result.orderId },
          dedupeKey: `${options.alsoNotifyRestaurant!.type}:${result.orderId}`,
        })),
      );
    }

    return { deliveryId, orderId: result.orderId, status: to };
  }

  /**
   * Locks a delivery and asserts it belongs to this courier.
   *
   * Scoping the lookup by driver means another courier's delivery id simply
   * does not resolve — there is no leak about whether it exists.
   */
  private async lockDelivery(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    driverId: string,
  ): Promise<{ id: string; order_id: string; status: string; driver_id: string }> {
    const rows = await tx.$queryRaw<
      Array<{ id: string; order_id: string; status: string; driver_id: string }>
    >`
      SELECT id, order_id, status::text AS status, driver_id
      FROM food_deliveries
      WHERE id = ${deliveryId}::uuid
        AND driver_id = ${driverId}::uuid
      FOR UPDATE
    `;

    const delivery = rows[0];
    if (!delivery) throw DomainError.notFound('Delivery');
    return delivery;
  }

  private assertDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus): void {
    if (!DELIVERY_TRANSITIONS[from]?.includes(to)) {
      const human = (s: DeliveryStatus) => s.toLowerCase().replace(/_/g, ' ');
      throw new DomainError(
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
        `A delivery that is ${human(from)} cannot become ${human(to)}.`,
      );
    }
  }
}
