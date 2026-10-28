import { Injectable } from '@nestjs/common';
import { DeliveryStatus, FoodOrderStatus, Prisma, RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { DomainError } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Customer-facing reads, with privacy projection.
 *
 * A customer sees their order, its progress and their courier's first name.
 * They never see the courier's phone number before collection, the courier's
 * live position beyond what the status implies, the restaurant's commission, or
 * anything about other customers.
 */
@Injectable()
export class FoodQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(orderId: string, viewer: AuthenticatedUser) {
    const order = await this.prisma.foodOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        status: true,
        currency: true,
        itemsSubtotal: true,
        deliveryFee: true,
        serviceFee: true,
        taxTotal: true,
        discountTotal: true,
        total: true,
        deliveryAddress: true,
        deliveryNote: true,
        prepMinutes: true,
        placedAt: true,
        acceptedAt: true,
        readyAt: true,
        deliveredAt: true,
        cancelledAt: true,
        cancellationReason: true,
        rejectionReason: true,
        userId: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            phone: true,
            addressLine: true,
            latitude: true,
            longitude: true,
          },
        },
        items: {
          select: {
            nameSnapshot: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            notes: true,
          },
        },
        payment: { select: { method: true, status: true } },
        delivery: {
          select: {
            id: true,
            status: true,
            assignedAt: true,
            pickedUpAt: true,
            deliveredAt: true,
            distanceM: true,
            durationS: true,
            encodedPolyline: true,
            driverId: true,
            driver: {
              select: {
                ratingAverage: true,
                user: { select: { firstName: true, phone: true, avatarUrl: true } },
                vehicles: {
                  where: { removedAt: null, isPrimary: true },
                  take: 1,
                  select: {
                    vehicle: { select: { make: true, model: true, colour: true, plateNumber: true } },
                  },
                },
              },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { toStatus: true, createdAt: true, reason: true },
        },
      },
    });

    if (!order) throw DomainError.notFound('Order');

    const isAdmin = viewer.roles.includes(RoleCode.ADMIN);
    const isCustomer = order.userId === viewer.id;
    const isCourier =
      viewer.driverId !== null && order.delivery?.driverId === viewer.driverId;

    if (!isAdmin && !isCustomer && !isCourier) {
      // Includes restaurant staff: they use the portal endpoint, which is
      // scoped to their own restaurant.
      throw DomainError.notFound('Order');
    }

    // The courier's phone number is released only once they are carrying the
    // order, and withdrawn again after delivery.
    const courierContactable =
      order.delivery?.status === DeliveryStatus.PICKED_UP ||
      order.delivery?.status === DeliveryStatus.DELIVERING;

    const vehicle = order.delivery?.driver?.vehicles[0]?.vehicle ?? null;

    return {
      id: order.id,
      reference: order.reference,
      status: order.status,
      restaurant: {
        id: order.restaurant.id,
        name: order.restaurant.name,
        slug: order.restaurant.slug,
        logoUrl: order.restaurant.logoUrl,
        address: order.restaurant.addressLine,
        lat: Number(order.restaurant.latitude),
        lng: Number(order.restaurant.longitude),
      },
      items: order.items.map((item) => ({
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        notes: item.notes,
      })),
      charge: {
        currency: order.currency,
        itemsSubtotal: order.itemsSubtotal.toFixed(2),
        deliveryFee: order.deliveryFee.toFixed(2),
        serviceFee: order.serviceFee.toFixed(2),
        tax: order.taxTotal.toFixed(2),
        discount: order.discountTotal.toFixed(2),
        total: order.total.toFixed(2),
      },
      payment: order.payment,
      delivery: {
        address: order.deliveryAddress,
        note: order.deliveryNote,
        status: order.delivery?.status ?? null,
        distanceM: order.delivery?.distanceM ?? null,
        durationS: order.delivery?.durationS ?? null,
        polyline: order.delivery?.encodedPolyline ?? null,
      },
      courier: order.delivery?.driver
        ? {
            firstName: order.delivery.driver.user.firstName,
            avatarUrl: order.delivery.driver.user.avatarUrl,
            rating: order.delivery.driver.ratingAverage.toFixed(2),
            phone: courierContactable ? order.delivery.driver.user.phone : null,
            vehicle: vehicle
              ? { make: vehicle.make, model: vehicle.model, colour: vehicle.colour }
              : null,
          }
        : null,
      timeline: {
        placedAt: order.placedAt,
        acceptedAt: order.acceptedAt,
        readyAt: order.readyAt,
        pickedUpAt: order.delivery?.pickedUpAt ?? null,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt,
      },
      progress: order.statusHistory.map((entry) => ({
        status: entry.toStatus,
        at: entry.createdAt,
        note: entry.reason,
      })),
      estimatedPrepMinutes: order.prepMinutes,
      cancellationReason: order.cancellationReason,
      rejectionReason: order.rejectionReason,
    };
  }

  /** The customer's own order history, cursor-paginated. */
  async history(userId: string, pagination: CursorPaginationDto) {
    const rows = await this.prisma.foodOrder.findMany({
      where: { userId, status: { not: FoodOrderStatus.DRAFT } },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        status: true,
        total: true,
        currency: true,
        placedAt: true,
        deliveredAt: true,
        restaurant: { select: { id: true, name: true, logoUrl: true } },
        // Counted in the database rather than by loading every line.
        _count: { select: { items: true } },
      },
    });

    const mapped = rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      total: row.total.toFixed(2),
      currency: row.currency,
      placedAt: row.placedAt,
      deliveredAt: row.deliveredAt,
      restaurant: row.restaurant,
      itemLines: row._count.items,
    }));

    return buildCursorPage(mapped, pagination.limit);
  }

  /**
   * Progress for the tracking screen.
   *
   * Deliberately narrow: status, timestamps and the courier's first name. It
   * carries no financial data and no contact details, so it is safe to poll
   * frequently.
   */
  async tracking(orderId: string, viewer: AuthenticatedUser) {
    const order = await this.prisma.foodOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        reference: true,
        status: true,
        prepMinutes: true,
        placedAt: true,
        acceptedAt: true,
        readyAt: true,
        deliveredAt: true,
        restaurant: { select: { name: true } },
        delivery: {
          select: {
            status: true,
            durationS: true,
            driverId: true,
            pickedUpAt: true,
            driver: { select: { user: { select: { firstName: true } } } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { toStatus: true, createdAt: true },
        },
      },
    });

    if (!order) throw DomainError.notFound('Order');

    const isAdmin = viewer.roles.includes(RoleCode.ADMIN);
    const isCourier = viewer.driverId !== null && order.delivery?.driverId === viewer.driverId;

    if (!isAdmin && order.userId !== viewer.id && !isCourier) {
      throw DomainError.notFound('Order');
    }

    return {
      orderId: order.id,
      reference: order.reference,
      status: order.status,
      restaurantName: order.restaurant.name,
      courierFirstName: order.delivery?.driver?.user.firstName ?? null,
      deliveryStatus: order.delivery?.status ?? null,
      estimatedMinutesRemaining: this.estimateRemaining(order),
      steps: order.statusHistory.map((entry) => ({
        status: entry.toStatus,
        at: entry.createdAt,
      })),
    };
  }

  /**
   * A deliberately simple estimate: whatever preparation time remains, plus the
   * routed travel time. It is presented as an estimate and never as a promise.
   */
  private estimateRemaining(order: {
    status: FoodOrderStatus;
    prepMinutes: number | null;
    acceptedAt: Date | null;
    readyAt: Date | null;
    delivery: { durationS: number | null; pickedUpAt: Date | null } | null;
  }): number | null {
    if (
      order.status === FoodOrderStatus.DELIVERED ||
      order.status === FoodOrderStatus.CANCELLED ||
      order.status === FoodOrderStatus.REJECTED
    ) {
      return 0;
    }

    const travelMinutes = Math.round((order.delivery?.durationS ?? 0) / 60);

    if (order.delivery?.pickedUpAt) {
      const elapsed = (Date.now() - order.delivery.pickedUpAt.getTime()) / 60000;
      return Math.max(1, Math.round(travelMinutes - elapsed));
    }

    if (order.readyAt) return Math.max(1, travelMinutes);

    if (order.acceptedAt && order.prepMinutes) {
      const elapsed = (Date.now() - order.acceptedAt.getTime()) / 60000;
      return Math.max(1, Math.round(order.prepMinutes - elapsed + travelMinutes));
    }

    return order.prepMinutes === null ? null : order.prepMinutes + travelMinutes;
  }
}
