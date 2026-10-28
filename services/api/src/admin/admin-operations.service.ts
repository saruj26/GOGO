import { Injectable } from '@nestjs/common';
import { DriverApprovalStatus, Prisma, RoleCode, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { OffsetPage } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminDriverListDto, AdminFoodOrderListDto, AdminListDto, AdminParcelListDto,
  AdminPaymentListDto, AdminRideListDto, AdminUserListDto,
  DriverDecisionDto, SetRestaurantStatusDto, SetUserStatusDto,
} from './dto/admin.dto';

// A dozen round trips to a managed database in another region routinely
// exceed Prisma's 5-second default; see rides.service.ts's TRANSACTION_OPTIONS.
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

function page<T>(items: T[], total: number, dto: { page: number; limit: number }): OffsetPage<T> {
  return {
    items,
    total,
    page: dto.page,
    limit: dto.limit,
    totalPages: Math.max(1, Math.ceil(total / dto.limit)),
  };
}

function dateRange(dto: { from?: string; to?: string }) {
  if (!dto.from && !dto.to) return undefined;
  return {
    ...(dto.from ? { gte: new Date(dto.from) } : {}),
    ...(dto.to ? { lte: new Date(dto.to) } : {}),
  };
}

/**
 * Read and moderation surface for operations staff.
 *
 * Two rules run through all of it. Every list is paginated and counted in the
 * database — no endpoint here can return an unbounded result set. And every
 * state change writes an audit record naming the administrator who made it.
 */
@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --------------------------------------------------------------- users

  async users(dto: AdminUserListDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.q
        ? {
            OR: [
              { firstName: { contains: dto.q, mode: 'insensitive' } },
              { lastName: { contains: dto.q, mode: 'insensitive' } },
              { phone: { contains: dto.q } },
            ],
          }
        : {}),
      ...(dateRange(dto) ? { createdAt: dateRange(dto) } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, firstName: true, lastName: true, phone: true, email: true,
          status: true, createdAt: true, lastLoginAt: true,
          roles: { select: { role: { select: { code: true } } } },
          _count: { select: { ridePassengers: true, foodOrders: true, parcelOrders: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return page(
      rows.map((user) => ({
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        phone: user.phone,
        email: user.email,
        status: user.status,
        roles: user.roles.map((r) => r.role.code),
        joinedAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        activity: {
          rides: user._count.ridePassengers,
          foodOrders: user._count.foodOrders,
          parcels: user._count.parcelOrders,
        },
      })),
      total,
      dto,
    );
  }

  async setUserStatus(userId: string, dto: SetUserStatusDto, actorUserId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { status: true },
    });
    if (!existing) throw DomainError.notFound('User');

    await this.prisma.user.update({ where: { id: userId }, data: { status: dto.status } });

    // Suspending an account must also end its sessions, or the holder keeps
    // working until their access token happens to expire.
    if (dto.status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.record({
      actorUserId,
      actorRole: RoleCode.ADMIN,
      action: 'admin.user.status',
      entityType: 'User',
      entityId: userId,
      previousState: { status: existing.status },
      newState: { status: dto.status, reason: dto.reason },
    });

    return { userId, status: dto.status };
  }

  // ------------------------------------------------------------- drivers

  async drivers(dto: AdminDriverListDto) {
    const where: Prisma.DriverWhereInput = {
      deletedAt: null,
      ...(dto.approvalStatus ? { approvalStatus: dto.approvalStatus } : {}),
      ...(dto.q
        ? {
            OR: [
              { licenceNumber: { contains: dto.q, mode: 'insensitive' } },
              { user: { firstName: { contains: dto.q, mode: 'insensitive' } } },
              { user: { phone: { contains: dto.q } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: [{ approvalStatus: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true, licenceNumber: true, licenceExpiry: true, approvalStatus: true,
          sharedRideOptIn: true, ratingAverage: true, ratingCount: true,
          completedTrips: true, cancelledTrips: true, createdAt: true, rejectionReason: true,
          user: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
          availability: { select: { presence: true, lastSeenAt: true } },
          vehicles: {
            where: { removedAt: null },
            select: {
              isPrimary: true,
              vehicle: {
                select: {
                  plateNumber: true, make: true, model: true, colour: true, status: true,
                  vehicleType: { select: { code: true, name: true } },
                },
              },
            },
          },
          _count: { select: { documents: true } },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return page(
      rows.map((driver) => ({
        id: driver.id,
        name: [driver.user.firstName, driver.user.lastName].filter(Boolean).join(' '),
        phone: driver.user.phone,
        userStatus: driver.user.status,
        licence: { number: driver.licenceNumber, expiresAt: driver.licenceExpiry },
        approvalStatus: driver.approvalStatus,
        rejectionReason: driver.rejectionReason,
        sharedRideOptIn: driver.sharedRideOptIn,
        presence: driver.availability?.presence ?? 'OFFLINE',
        lastSeenAt: driver.availability?.lastSeenAt ?? null,
        rating: { average: driver.ratingAverage.toFixed(2), count: driver.ratingCount },
        trips: { completed: driver.completedTrips, cancelled: driver.cancelledTrips },
        documentCount: driver._count.documents,
        vehicles: driver.vehicles.map((v) => ({
          plateNumber: v.vehicle.plateNumber,
          description: `${v.vehicle.colour} ${v.vehicle.make} ${v.vehicle.model}`,
          type: v.vehicle.vehicleType.name,
          status: v.vehicle.status,
          isPrimary: v.isPrimary,
        })),
        joinedAt: driver.createdAt,
      })),
      total,
      dto,
    );
  }

  /**
   * Approve, reject or suspend a driver.
   *
   * A driver who stops being approved is taken offline in the same transaction —
   * leaving them online would let the dispatcher keep offering them work.
   */
  async decideDriver(
    driverId: string,
    decision: DriverApprovalStatus,
    dto: DriverDecisionDto,
    actorUserId: string,
  ) {
    if (decision !== DriverApprovalStatus.APPROVED && !dto.reason?.trim()) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Give a reason — the driver is told why.',
      );
    }

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, deletedAt: null },
      select: { approvalStatus: true },
    });
    if (!driver) throw DomainError.notFound('Driver');

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.driver.update({
        where: { id: driverId },
        data: {
          approvalStatus: decision,
          approvedAt: decision === DriverApprovalStatus.APPROVED ? new Date() : null,
          approvedByUserId: decision === DriverApprovalStatus.APPROVED ? actorUserId : null,
          rejectionReason: decision === DriverApprovalStatus.APPROVED ? null : dto.reason,
        },
        select: { id: true, approvalStatus: true },
      });

      if (decision !== DriverApprovalStatus.APPROVED) {
        await tx.driverAvailability.updateMany({
          where: { driverId },
          data: { presence: 'OFFLINE' },
        });
      }

      return updated;
    }, TRANSACTION_OPTIONS);

    await this.audit.record({
      actorUserId,
      actorRole: RoleCode.ADMIN,
      action: 'admin.driver.decision',
      entityType: 'Driver',
      entityId: driverId,
      previousState: { approvalStatus: driver.approvalStatus },
      newState: { approvalStatus: decision, reason: dto.reason },
    });

    return result;
  }

  // --------------------------------------------------------------- rides

  async rides(dto: AdminRideListDto) {
    const where: Prisma.RideWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.rideType ? { rideType: dto.rideType } : {}),
      ...(dto.q ? { reference: { contains: dto.q.toUpperCase() } } : {}),
      ...(dateRange(dto) ? { createdAt: dateRange(dto) } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ride.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, reference: true, rideType: true, status: true, createdAt: true,
          completedAt: true, seatsTotal: true, seatsOccupied: true, joinable: true,
          plannedDistanceM: true, plannedDurationS: true, currency: true,
          vehicleType: { select: { code: true, name: true } },
          vehicle: { select: { plateNumber: true } },
          driver: { select: { id: true, user: { select: { firstName: true, phone: true } } } },
          passengers: {
            select: {
              id: true, status: true, isSharedJoin: true,
              pickupAddress: true, dropoffAddress: true,
              user: { select: { firstName: true } },
              fareQuote: { select: { passengerTotal: true, driverNet: true, platformCommission: true } },
            },
          },
          _count: { select: { stops: true } },
        },
      }),
      this.prisma.ride.count({ where }),
    ]);

    return page(
      rows.map((ride) => {
        const zero = new Prisma.Decimal(0);
        const totals = ride.passengers.reduce(
          (acc, p) => ({
            fare: acc.fare.plus(p.fareQuote?.passengerTotal ?? zero),
            driver: acc.driver.plus(p.fareQuote?.driverNet ?? zero),
            commission: acc.commission.plus(p.fareQuote?.platformCommission ?? zero),
          }),
          { fare: zero, driver: zero, commission: zero },
        );

        return {
          id: ride.id,
          reference: ride.reference,
          rideType: ride.rideType,
          status: ride.status,
          createdAt: ride.createdAt,
          completedAt: ride.completedAt,
          vehicleType: ride.vehicleType.name,
          plateNumber: ride.vehicle?.plateNumber ?? null,
          driver: ride.driver
            ? { id: ride.driver.id, name: ride.driver.user.firstName, phone: ride.driver.user.phone }
            : null,
          seats: { total: ride.seatsTotal, occupied: ride.seatsOccupied, joinable: ride.joinable },
          stops: ride._count.stops,
          distanceM: ride.plannedDistanceM,
          durationS: ride.plannedDurationS,
          passengers: ride.passengers.map((p) => ({
            id: p.id,
            firstName: p.user.firstName,
            status: p.status,
            joinedExistingRoute: p.isSharedJoin,
            from: p.pickupAddress,
            to: p.dropoffAddress,
            fare: p.fareQuote?.passengerTotal.toFixed(2) ?? null,
          })),
          money: {
            currency: ride.currency,
            passengersPaid: totals.fare.toFixed(2),
            driverEarned: totals.driver.toFixed(2),
            platformCommission: totals.commission.toFixed(2),
          },
        };
      }),
      total,
      dto,
    );
  }

  /**
   * One ride in full, including how the shared matching went.
   *
   * Rejected candidates are summarised by reason rather than listed with their
   * scores: staff need to know why a ride was not offered, not the internals of
   * how it was ranked.
   */
  async ride(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: {
        id: true, reference: true, rideType: true, status: true, currency: true,
        createdAt: true, acceptedAt: true, startedAt: true, completedAt: true,
        cancelledAt: true, cancelledBy: true, cancellationReason: true,
        seatsTotal: true, seatsOccupied: true, joinable: true,
        plannedDistanceM: true, plannedDurationS: true,
        vehicleType: { select: { code: true, name: true } },
        vehicle: { select: { plateNumber: true, make: true, model: true, colour: true } },
        driver: {
          select: {
            id: true, ratingAverage: true,
            user: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        activeRoute: { select: { encodedPolyline: true, distanceM: true, durationS: true, version: true } },
        passengers: {
          select: {
            id: true, status: true, isSharedJoin: true, seatsRequested: true,
            pickupAddress: true, dropoffAddress: true,
            estimatedPickupAt: true, estimatedDropoffAt: true,
            user: { select: { id: true, firstName: true, phone: true } },
            fareQuote: {
              select: {
                passengerTotal: true, driverNet: true, platformCommission: true,
                grossFare: true, discountTotal: true, isShared: true, currency: true,
              },
            },
            payment: { select: { method: true, status: true } },
          },
        },
        stops: {
          orderBy: { sequence: 'asc' },
          select: { sequence: true, type: true, status: true, address: true, estimatedArrivalAt: true },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { fromStatus: true, toStatus: true, actorRole: true, reason: true, createdAt: true },
        },
        matchCandidates: {
          select: { eligible: true, rejectionReason: true, createdAt: true },
        },
      },
    });

    if (!ride) throw DomainError.notFound('Ride');

    const rejections = ride.matchCandidates
      .filter((c) => !c.eligible)
      .reduce<Record<string, number>>((acc, c) => {
        acc[c.rejectionReason] = (acc[c.rejectionReason] ?? 0) + 1;
        return acc;
      }, {});

    return {
      ...ride,
      driver: ride.driver
        ? {
            id: ride.driver.id,
            name: [ride.driver.user.firstName, ride.driver.user.lastName].filter(Boolean).join(' '),
            phone: ride.driver.user.phone,
            rating: ride.driver.ratingAverage.toFixed(2),
          }
        : null,
      passengers: ride.passengers.map((p) => ({
        id: p.id,
        userId: p.user.id,
        firstName: p.user.firstName,
        phone: p.user.phone,
        status: p.status,
        joinedExistingRoute: p.isSharedJoin,
        seats: p.seatsRequested,
        from: p.pickupAddress,
        to: p.dropoffAddress,
        estimatedPickupAt: p.estimatedPickupAt,
        estimatedDropoffAt: p.estimatedDropoffAt,
        payment: p.payment,
        money: p.fareQuote
          ? {
              currency: p.fareQuote.currency,
              gross: p.fareQuote.grossFare.toFixed(2),
              discount: p.fareQuote.discountTotal.toFixed(2),
              passengerPaid: p.fareQuote.passengerTotal.toFixed(2),
              driverEarned: p.fareQuote.driverNet.toFixed(2),
              platformCommission: p.fareQuote.platformCommission.toFixed(2),
              shared: p.fareQuote.isShared,
            }
          : null,
      })),
      matching: {
        candidatesEvaluated: ride.matchCandidates.length,
        offered: ride.matchCandidates.filter((c) => c.eligible).length,
        rejectionsByReason: rejections,
      },
    };
  }

  // ---------------------------------------------------------------- food

  async restaurants(dto: AdminListDto) {
    const where: Prisma.RestaurantWhereInput = {
      deletedAt: null,
      ...(dto.q ? { name: { contains: dto.q, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        select: {
          id: true, name: true, slug: true, status: true, isAcceptingOrders: true,
          commissionPct: true, ratingAverage: true, ratingCount: true,
          addressLine: true, phone: true, createdAt: true,
          _count: { select: { orders: true, menuItems: true, members: true } },
        },
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    return page(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        isAcceptingOrders: r.isAcceptingOrders,
        commissionPct: r.commissionPct.toFixed(2),
        rating: { average: r.ratingAverage.toFixed(2), count: r.ratingCount },
        address: r.addressLine,
        phone: r.phone,
        orders: r._count.orders,
        menuItems: r._count.menuItems,
        staff: r._count.members,
        joinedAt: r.createdAt,
      })),
      total,
      dto,
    );
  }

  async setRestaurantStatus(
    restaurantId: string,
    dto: SetRestaurantStatusDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, deletedAt: null },
      select: { status: true },
    });
    if (!existing) throw DomainError.notFound('Restaurant');

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        status: dto.status,
        // A restaurant that is no longer active must stop taking orders.
        ...(dto.status !== 'ACTIVE' ? { isAcceptingOrders: false } : {}),
      },
    });

    await this.audit.record({
      actorUserId,
      actorRole: RoleCode.ADMIN,
      action: 'admin.restaurant.status',
      entityType: 'Restaurant',
      entityId: restaurantId,
      previousState: { status: existing.status },
      newState: { status: dto.status, reason: dto.reason },
    });

    return { restaurantId, status: dto.status };
  }

  async foodOrders(dto: AdminFoodOrderListDto) {
    const where: Prisma.FoodOrderWhereInput = {
      status: dto.status ?? { not: 'DRAFT' },
      ...(dto.q ? { reference: { contains: dto.q.toUpperCase() } } : {}),
      ...(dateRange(dto) ? { createdAt: dateRange(dto) } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.foodOrder.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, reference: true, status: true, total: true, currency: true,
          itemsSubtotal: true, deliveryFee: true, restaurantCommission: true,
          restaurantPayout: true, placedAt: true, deliveredAt: true,
          restaurant: { select: { id: true, name: true } },
          user: { select: { firstName: true, phone: true } },
          delivery: {
            select: {
              status: true,
              driver: { select: { id: true, user: { select: { firstName: true } } } },
            },
          },
          payment: { select: { method: true, status: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.foodOrder.count({ where }),
    ]);

    return page(
      rows.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        restaurant: o.restaurant,
        customer: { firstName: o.user.firstName, phone: o.user.phone },
        courier: o.delivery?.driver
          ? { id: o.delivery.driver.id, firstName: o.delivery.driver.user.firstName }
          : null,
        deliveryStatus: o.delivery?.status ?? null,
        items: o._count.items,
        payment: o.payment,
        money: {
          currency: o.currency,
          items: o.itemsSubtotal.toFixed(2),
          delivery: o.deliveryFee.toFixed(2),
          total: o.total.toFixed(2),
          restaurantCommission: o.restaurantCommission.toFixed(2),
          restaurantPayout: o.restaurantPayout.toFixed(2),
        },
        placedAt: o.placedAt,
        deliveredAt: o.deliveredAt,
      })),
      total,
      dto,
    );
  }

  // -------------------------------------------------------------- parcel

  async parcels(dto: AdminParcelListDto) {
    const where: Prisma.ParcelOrderWhereInput = {
      status: dto.status ?? { not: 'DRAFT' },
      ...(dto.q ? { reference: { contains: dto.q.toUpperCase() } } : {}),
      ...(dateRange(dto) ? { createdAt: dateRange(dto) } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.parcelOrder.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, reference: true, status: true, pickupAddress: true, dropoffAddress: true,
          weightKg: true, distanceM: true, createdAt: true, assignedAt: true, deliveredAt: true,
          parcelType: { select: { name: true } },
          vehicleType: { select: { name: true } },
          user: { select: { firstName: true, phone: true } },
          driver: { select: { id: true, user: { select: { firstName: true } } } },
          payment: { select: { method: true, status: true, amount: true, currency: true } },
          fareQuote: { select: { passengerTotal: true, driverNet: true, platformCommission: true } },
        },
      }),
      this.prisma.parcelOrder.count({ where }),
    ]);

    return page(
      rows.map((p) => ({
        id: p.id,
        reference: p.reference,
        status: p.status,
        parcelType: p.parcelType.name,
        vehicleType: p.vehicleType.name,
        weightKg: p.weightKg?.toFixed(2) ?? null,
        distanceM: p.distanceM,
        from: p.pickupAddress,
        to: p.dropoffAddress,
        customer: { firstName: p.user.firstName, phone: p.user.phone },
        courier: p.driver ? { id: p.driver.id, firstName: p.driver.user.firstName } : null,
        payment: p.payment
          ? {
              method: p.payment.method,
              status: p.payment.status,
              amount: p.payment.amount.toFixed(2),
              currency: p.payment.currency,
            }
          : null,
        money: p.fareQuote
          ? {
              customerPaid: p.fareQuote.passengerTotal.toFixed(2),
              courierEarned: p.fareQuote.driverNet.toFixed(2),
              platformCommission: p.fareQuote.platformCommission.toFixed(2),
            }
          : null,
        bookedAt: p.createdAt,
        assignedAt: p.assignedAt,
        deliveredAt: p.deliveredAt,
      })),
      total,
      dto,
    );
  }

  // ------------------------------------------------------------ payments

  async payments(dto: AdminPaymentListDto) {
    const where: Prisma.PaymentWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.serviceType ? { serviceType: dto.serviceType } : {}),
      ...(dateRange(dto) ? { createdAt: dateRange(dto) } : {}),
    };

    const [rows, total, sum] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, serviceType: true, method: true, status: true, amount: true,
          refundedAmount: true, currency: true, provider: true, createdAt: true, paidAt: true,
          failureReason: true,
          user: { select: { firstName: true, phone: true } },
          // The provider reference is included; raw provider payloads and
          // anything resembling card data are never selected.
          _count: { select: { transactions: true } },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where, _sum: { amount: true, refundedAmount: true } }),
    ]);

    const zero = new Prisma.Decimal(0);

    return {
      ...page(
        rows.map((p) => ({
          id: p.id,
          serviceType: p.serviceType,
          method: p.method,
          status: p.status,
          provider: p.provider,
          amount: p.amount.toFixed(2),
          refunded: p.refundedAmount.toFixed(2),
          currency: p.currency,
          customer: { firstName: p.user.firstName, phone: p.user.phone },
          transactions: p._count.transactions,
          failureReason: p.failureReason,
          createdAt: p.createdAt,
          paidAt: p.paidAt,
        })),
        total,
        dto,
      ),
      totals: {
        charged: (sum._sum.amount ?? zero).toFixed(2),
        refunded: (sum._sum.refundedAmount ?? zero).toFixed(2),
      },
    };
  }
}
