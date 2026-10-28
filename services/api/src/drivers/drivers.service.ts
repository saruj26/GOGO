import { Injectable, Logger } from '@nestjs/common';
import { DriverPresence, EarningStatus, Prisma } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENTS } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import { DriverLocationPingDto, UpdateAvailabilityDto } from './dto/drivers.dto';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Records a GPS ping.
   *
   * Two tables, deliberately:
   *   - `driver_locations_current` holds exactly one row per driver and is
   *     UPSERTed on every ping. Dispatch and the matching engine read only this,
   *     so live queries never scan a growing history.
   *   - `driver_location_history` is append-only and thinned: pings arriving
   *     faster than the configured interval update the live position but are
   *     not persisted, and rows are pruned on a retention schedule.
   */
  async recordLocation(driverId: string, dto: DriverLocationPingDto) {
    // A device clock ahead of the server would make a stale position look
    // fresh, so a future timestamp is clamped.
    const reported = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    const recordedAt = reported.getTime() > Date.now() ? new Date() : reported;

    const minIntervalS = await this.settings.getNumber(SETTING_KEYS.LOCATION_MIN_PING_INTERVAL_S);

    const previous = await this.prisma.driverLocationCurrent.findUnique({
      where: { driverId },
      select: { recordedAt: true },
    });

    await this.prisma.$executeRaw`
      INSERT INTO driver_locations_current (
        driver_id, latitude, longitude, heading_deg, speed_kph, accuracy_m, recorded_at, updated_at
      ) VALUES (
        ${driverId}::uuid, ${dto.lat}, ${dto.lng}, ${dto.headingDeg ?? null},
        ${dto.speedKph ?? null}, ${dto.accuracyM ?? null}, ${recordedAt}, now()
      )
      ON CONFLICT (driver_id) DO UPDATE SET
        latitude    = EXCLUDED.latitude,
        longitude   = EXCLUDED.longitude,
        heading_deg = EXCLUDED.heading_deg,
        speed_kph   = EXCLUDED.speed_kph,
        accuracy_m  = EXCLUDED.accuracy_m,
        recorded_at = EXCLUDED.recorded_at,
        updated_at  = now()
      WHERE driver_locations_current.recorded_at <= EXCLUDED.recorded_at
    `;

    const elapsedS = previous
      ? (recordedAt.getTime() - previous.recordedAt.getTime()) / 1000
      : Number.POSITIVE_INFINITY;

    let persisted = false;
    if (elapsedS >= minIntervalS) {
      const activeRide = await this.prisma.ride.findFirst({
        where: {
          driverId,
          status: { in: ['ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      });

      await this.prisma.$executeRaw`
        INSERT INTO driver_location_history (
          driver_id, ride_id, latitude, longitude, heading_deg, speed_kph, recorded_at
        ) VALUES (
          ${driverId}::uuid, ${activeRide?.id ?? null}::uuid, ${dto.lat}, ${dto.lng},
          ${dto.headingDeg ?? null}, ${dto.speedKph ?? null}, ${recordedAt}
        )
      `;
      persisted = true;
    }

    await this.prisma.driverAvailability.updateMany({
      where: { driverId },
      data: { lastSeenAt: new Date() },
    });

    // Every ping is published, but only the thinned ones are written to
    // history: a passenger watching the map wants the newest position, while
    // the audit trail wants a sampled one. Publishing goes only to the rides
    // this driver is actually working — an online driver with no live ride
    // broadcasts nothing.
    const watchers = await this.realtime.publishDriverLocation(driverId, {
      lat: dto.lat,
      lng: dto.lng,
      headingDeg: dto.headingDeg,
      speedKph: dto.speedKph,
      recordedAt,
    });

    return { accepted: true, historyRecorded: persisted, publishedToRides: watchers };
  }

  /**
   * The driver's own working profile.
   *
   * Exists because the driver application cannot function without it: it has to
   * know whether the account is approved, whether it is currently online, which
   * vehicles it may drive and which of them is selected, before a driver can go
   * online or accept anything. Every other driver endpoint already assumes all
   * of that has been decided.
   *
   * Document rows are projected as type, status and expiry only. `storageKey`
   * is never returned: those files are served through signed URLs, and putting
   * a storage key in an API response would leak the object path.
   */
  async profile(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        approvalStatus: true,
        sharedRideOptIn: true,
        ratingAverage: true,
        ratingCount: true,
        completedTrips: true,
        availability: {
          select: {
            presence: true,
            activeVehicleId: true,
            acceptsShared: true,
            acceptsFood: true,
            acceptsParcel: true,
          },
        },
        vehicles: {
          where: { removedAt: null },
          orderBy: { assignedAt: 'asc' },
          select: {
            isPrimary: true,
            vehicle: {
              select: {
                id: true,
                plateNumber: true,
                make: true,
                model: true,
                colour: true,
                year: true,
                seatCapacity: true,
                status: true,
                vehicleType: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        documents: {
          select: { type: true, status: true, expiresAt: true, reviewNotes: true },
        },
      },
    });

    if (!driver) throw DomainError.notFound('Driver');

    return {
      driverId: driver.id,
      approvalStatus: driver.approvalStatus,
      sharedRideOptIn: driver.sharedRideOptIn,
      rating: {
        average: driver.ratingAverage.toFixed(2),
        count: driver.ratingCount,
      },
      completedTrips: driver.completedTrips,
      // A driver who has never set availability has no row yet; that is
      // offline, not an error.
      availability: driver.availability ?? {
        presence: DriverPresence.OFFLINE,
        activeVehicleId: null,
        acceptsShared: false,
        acceptsFood: false,
        acceptsParcel: false,
      },
      vehicles: driver.vehicles.map((assignment) => ({
        ...assignment.vehicle,
        isPrimary: assignment.isPrimary,
      })),
      documents: driver.documents,
    };
  }

  async updateAvailability(driverId: string, dto: UpdateAvailabilityDto) {
    if (dto.activeVehicleId) {
      const assigned = await this.prisma.driverVehicle.findFirst({
        where: { driverId, vehicleId: dto.activeVehicleId, removedAt: null },
        select: { vehicleId: true },
      });

      if (!assigned) {
        throw new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          'That vehicle is not assigned to you.',
        );
      }
    }

    if (dto.presence === DriverPresence.ONLINE) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
        select: { approvalStatus: true },
      });

      if (driver?.approvalStatus !== 'APPROVED') {
        throw DomainError.forbidden('Your driver account has not been approved yet.');
      }
    }

    const saved = await this.prisma.driverAvailability.upsert({
      where: { driverId },
      create: {
        driverId,
        presence: dto.presence ?? DriverPresence.OFFLINE,
        activeVehicleId: dto.activeVehicleId,
        acceptsShared: dto.acceptsShared ?? false,
        acceptsFood: dto.acceptsFood ?? false,
        acceptsParcel: dto.acceptsParcel ?? false,
        wentOnlineAt: dto.presence === DriverPresence.ONLINE ? new Date() : null,
      },
      update: {
        ...dto,
        ...(dto.presence === DriverPresence.ONLINE ? { wentOnlineAt: new Date() } : {}),
      },
    });

    // The driver's own devices are told, so a phone and a tablet signed into
    // the same account do not disagree about whether they are online.
    this.realtime.toDriver(driverId, REALTIME_EVENTS.DRIVER_AVAILABILITY_CHANGED, {
      presence: saved.presence,
      acceptsShared: saved.acceptsShared,
      acceptsFood: saved.acceptsFood,
      acceptsParcel: saved.acceptsParcel,
      activeVehicleId: saved.activeVehicleId,
    });

    return saved;
  }

  /**
   * Earnings summary. Aggregation happens in the database — the API never pulls
   * a driver's whole earning history into memory to add it up.
   */
  async earningsSummary(driverId: string, from?: Date, to?: Date) {
    const where: Prisma.DriverEarningWhereInput = {
      driverId,
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [totals, byStatus, sharedIncrements] = await Promise.all([
      this.prisma.driverEarning.aggregate({
        where,
        _sum: { grossAmount: true, commissionAmount: true, netAmount: true, bonusAmount: true },
        _count: true,
      }),
      this.prisma.driverEarning.groupBy({
        by: ['status'],
        where,
        _sum: { netAmount: true },
        _count: true,
      }),
      this.prisma.driverEarning.aggregate({
        where: { ...where, isSharedIncrement: true },
        _sum: { netAmount: true },
        _count: true,
      }),
    ]);

    return {
      trips: totals._count,
      gross: (totals._sum.grossAmount ?? new Prisma.Decimal(0)).toFixed(2),
      commission: (totals._sum.commissionAmount ?? new Prisma.Decimal(0)).toFixed(2),
      bonus: (totals._sum.bonusAmount ?? new Prisma.Decimal(0)).toFixed(2),
      net: (totals._sum.netAmount ?? new Prisma.Decimal(0)).toFixed(2),
      // Surfacing this separately is the point of the shared-ride product: the
      // driver can see what carrying extra passengers actually added.
      fromSharedPassengers: {
        count: sharedIncrements._count,
        net: (sharedIncrements._sum.netAmount ?? new Prisma.Decimal(0)).toFixed(2),
      },
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count,
        net: (row._sum.netAmount ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  async earnings(driverId: string, pagination: CursorPaginationDto, status?: EarningStatus) {
    const rows = await this.prisma.driverEarning.findMany({
      where: { driverId, ...(status ? { status } : {}) },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serviceType: true,
        status: true,
        grossAmount: true,
        commissionAmount: true,
        netAmount: true,
        currency: true,
        isSharedIncrement: true,
        createdAt: true,
        ride: { select: { id: true, reference: true } },
      },
    });

    return buildCursorPage(rows, pagination.limit);
  }
}
