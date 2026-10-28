import { Injectable } from '@nestjs/common';
import { ParcelStatus, RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { DomainError } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { PARCEL_COURIER_ACTIVE } from './parcel-order.state';

/**
 * Customer-facing parcel reads.
 *
 * The sender sees their booking and its progress. The courier's phone number is
 * released only while the parcel is actually in their hands, and the courier's
 * exact position is never exposed — the tracking history says what happened and
 * when, which is what a sender needs.
 */
@Injectable()
export class ParcelsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(parcelId: string, viewer: AuthenticatedUser) {
    const parcel = await this.prisma.parcelOrder.findUnique({
      where: { id: parcelId },
      select: {
        id: true,
        reference: true,
        status: true,
        userId: true,
        driverId: true,
        pickupAddress: true,
        pickupContactName: true,
        pickupContactPhone: true,
        dropoffAddress: true,
        receiverName: true,
        receiverPhone: true,
        weightKg: true,
        declaredValue: true,
        notes: true,
        distanceM: true,
        durationS: true,
        encodedPolyline: true,
        scheduledFor: true,
        assignedAt: true,
        pickedUpAt: true,
        deliveredAt: true,
        cancelledAt: true,
        cancellationReason: true,
        createdAt: true,
        parcelType: { select: { code: true, name: true, requiresSignature: true } },
        vehicleType: { select: { code: true, name: true } },
        payment: { select: { method: true, status: true, amount: true, currency: true } },
        fareQuote: {
          select: { passengerTotal: true, currency: true, components: true },
        },
        driver: {
          select: {
            ratingAverage: true,
            user: { select: { firstName: true, phone: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!parcel) throw DomainError.notFound('Parcel');

    const isAdmin = viewer.roles.includes(RoleCode.ADMIN);
    const isSender = parcel.userId === viewer.id;
    const isCourier = viewer.driverId !== null && parcel.driverId === viewer.driverId;

    if (!isAdmin && !isSender && !isCourier) {
      throw DomainError.notFound('Parcel');
    }

    const courierContactable = PARCEL_COURIER_ACTIVE.includes(parcel.status);

    return {
      id: parcel.id,
      reference: parcel.reference,
      status: parcel.status,
      parcelType: parcel.parcelType,
      vehicleType: parcel.vehicleType,
      weightKg: parcel.weightKg?.toFixed(2) ?? null,
      declaredValue: parcel.declaredValue?.toFixed(2) ?? null,
      notes: parcel.notes,
      pickup: {
        address: parcel.pickupAddress,
        contactName: parcel.pickupContactName,
        contactPhone: parcel.pickupContactPhone,
      },
      dropoff: {
        address: parcel.dropoffAddress,
        receiverName: parcel.receiverName,
        receiverPhone: parcel.receiverPhone,
      },
      charge: parcel.fareQuote
        ? {
            total: parcel.fareQuote.passengerTotal.toFixed(2),
            currency: parcel.fareQuote.currency,
          }
        : null,
      payment: parcel.payment
        ? {
            method: parcel.payment.method,
            status: parcel.payment.status,
            amount: parcel.payment.amount.toFixed(2),
            currency: parcel.payment.currency,
          }
        : null,
      courier: parcel.driver
        ? {
            firstName: parcel.driver.user.firstName,
            avatarUrl: parcel.driver.user.avatarUrl,
            rating: parcel.driver.ratingAverage.toFixed(2),
            phone: courierContactable ? parcel.driver.user.phone : null,
          }
        : null,
      route: {
        distanceM: parcel.distanceM,
        durationS: parcel.durationS,
        polyline: parcel.encodedPolyline,
      },
      timeline: {
        bookedAt: parcel.createdAt,
        scheduledFor: parcel.scheduledFor,
        assignedAt: parcel.assignedAt,
        pickedUpAt: parcel.pickedUpAt,
        deliveredAt: parcel.deliveredAt,
        cancelledAt: parcel.cancelledAt,
      },
      cancellationReason: parcel.cancellationReason,
    };
  }

  /**
   * The tracking trail.
   *
   * Coordinates recorded by the courier are returned only to the sender and to
   * admin — a receiver looking up a reference sees the milestones, not where the
   * courier's phone was.
   */
  async tracking(parcelId: string, viewer: AuthenticatedUser, pagination: CursorPaginationDto) {
    const parcel = await this.prisma.parcelOrder.findUnique({
      where: { id: parcelId },
      select: { id: true, userId: true, driverId: true, reference: true, status: true },
    });

    if (!parcel) throw DomainError.notFound('Parcel');

    const isAdmin = viewer.roles.includes(RoleCode.ADMIN);
    const isSender = parcel.userId === viewer.id;
    const isCourier = viewer.driverId !== null && parcel.driverId === viewer.driverId;

    if (!isAdmin && !isSender && !isCourier) {
      throw DomainError.notFound('Parcel');
    }

    const includeCoordinates = isAdmin || isSender;

    const rows = await this.prisma.parcelTracking.findMany({
      where: { parcelOrderId: parcelId },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        note: true,
        createdAt: true,
        latitude: includeCoordinates,
        longitude: includeCoordinates,
      },
    });

    const page = buildCursorPage(rows, pagination.limit);

    return {
      parcelId: parcel.id,
      reference: parcel.reference,
      currentStatus: parcel.status,
      ...page,
    };
  }

  async history(userId: string, pagination: CursorPaginationDto) {
    const rows = await this.prisma.parcelOrder.findMany({
      where: { userId, status: { not: ParcelStatus.DRAFT } },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        status: true,
        pickupAddress: true,
        dropoffAddress: true,
        createdAt: true,
        deliveredAt: true,
        parcelType: { select: { name: true } },
        fareQuote: { select: { passengerTotal: true, currency: true } },
      },
    });

    const mapped = rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      parcelType: row.parcelType.name,
      from: row.pickupAddress,
      to: row.dropoffAddress,
      total: row.fareQuote?.passengerTotal.toFixed(2) ?? null,
      currency: row.fareQuote?.currency ?? null,
      bookedAt: row.createdAt,
      deliveredAt: row.deliveredAt,
    }));

    return buildCursorPage(mapped, pagination.limit);
  }
}
