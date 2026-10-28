import { Injectable } from '@nestjs/common';
import { DriverPresence, Prisma, RideStatus, RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read side of the rides module, with access control and privacy projection.
 *
 * Who may see what (§37):
 *   - a passenger sees their own leg in full, the driver's first name, rating
 *     and vehicle, and only the COUNT of co-passengers;
 *   - a driver sees each passenger's first name, phone and stops, because they
 *     have to find and carry them — but never their gender or safety
 *     preference;
 *   - an admin sees everything.
 */
@Injectable()
export class RidesQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(rideId: string, viewer: AuthenticatedUser) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        vehicleType: { select: { code: true, name: true, seatCapacity: true } },
        vehicle: { select: { make: true, model: true, colour: true, plateNumber: true } },
        driver: {
          select: {
            id: true,
            ratingAverage: true,
            completedTrips: true,
            user: { select: { firstName: true, phone: true, avatarUrl: true } },
          },
        },
        activeRoute: {
          select: { encodedPolyline: true, distanceM: true, durationS: true, version: true },
        },
        passengers: {
          select: {
            id: true,
            userId: true,
            status: true,
            seatsRequested: true,
            isSharedJoin: true,
            pickupAddress: true,
            pickupLatitude: true,
            pickupLongitude: true,
            dropoffAddress: true,
            dropoffLatitude: true,
            dropoffLongitude: true,
            estimatedPickupAt: true,
            estimatedDropoffAt: true,
            note: true,
            user: { select: { firstName: true, phone: true, avatarUrl: true } },
            fareQuote: {
              select: { passengerTotal: true, currency: true, isShared: true, components: true },
            },
            payment: { select: { method: true, status: true } },
          },
        },
        stops: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            type: true,
            status: true,
            address: true,
            latitude: true,
            longitude: true,
            estimatedArrivalAt: true,
            ridePassengerId: true,
          },
        },
      },
    });

    if (!ride) throw DomainError.notFound('Ride');

    const isAdmin = viewer.roles.includes(RoleCode.ADMIN);
    const isAssignedDriver = ride.driver?.id === viewer.driverId && viewer.driverId !== null;
    const ownLeg = ride.passengers.find((p) => p.userId === viewer.id);

    if (!isAdmin && !isAssignedDriver && !ownLeg) {
      throw DomainError.forbidden();
    }

    const base = {
      id: ride.id,
      reference: ride.reference,
      rideType: ride.rideType,
      status: ride.status,
      scheduledPickupAt: ride.scheduledPickupAt,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      currency: ride.currency,
      vehicleType: ride.vehicleType,
      route: ride.activeRoute,
      seats: { total: ride.seatsTotal, occupied: ride.seatsOccupied },
    };

    if (isAdmin) {
      return { ...base, vehicle: ride.vehicle, driver: ride.driver, passengers: ride.passengers, stops: ride.stops };
    }

    if (isAssignedDriver) {
      return {
        ...base,
        vehicle: ride.vehicle,
        // The driver needs to reach and identify each passenger — and nothing
        // more. Gender and safety preferences are not included.
        passengers: ride.passengers.map((p) => ({
          id: p.id,
          status: p.status,
          seats: p.seatsRequested,
          isSharedJoin: p.isSharedJoin,
          firstName: p.user.firstName,
          phone: p.user.phone,
          pickup: { address: p.pickupAddress, lat: p.pickupLatitude, lng: p.pickupLongitude },
          dropoff: { address: p.dropoffAddress, lat: p.dropoffLatitude, lng: p.dropoffLongitude },
          note: p.note,
          paymentMethod: p.payment?.method,
        })),
        stops: ride.stops,
      };
    }

    // Passenger view.
    return {
      ...base,
      vehicle: ride.vehicle,
      driver: ride.driver
        ? {
            firstName: ride.driver.user.firstName,
            avatarUrl: ride.driver.user.avatarUrl,
            rating: ride.driver.ratingAverage.toFixed(2),
            trips: ride.driver.completedTrips,
            // Released only once a driver is en route, and never before.
            phone:
              ride.status === RideStatus.DRIVER_ARRIVING ||
              ride.status === RideStatus.DRIVER_ARRIVED ||
              ride.status === RideStatus.IN_PROGRESS
                ? ride.driver.user.phone
                : null,
          }
        : null,
      myLeg: ownLeg
        ? {
            id: ownLeg.id,
            status: ownLeg.status,
            seats: ownLeg.seatsRequested,
            isSharedJoin: ownLeg.isSharedJoin,
            pickup: {
              address: ownLeg.pickupAddress,
              lat: ownLeg.pickupLatitude,
              lng: ownLeg.pickupLongitude,
            },
            dropoff: {
              address: ownLeg.dropoffAddress,
              lat: ownLeg.dropoffLatitude,
              lng: ownLeg.dropoffLongitude,
            },
            estimatedPickupAt: ownLeg.estimatedPickupAt,
            estimatedDropoffAt: ownLeg.estimatedDropoffAt,
            fare: ownLeg.fareQuote
              ? {
                  total: ownLeg.fareQuote.passengerTotal.toFixed(2),
                  currency: ownLeg.fareQuote.currency,
                  isShared: ownLeg.fareQuote.isShared,
                }
              : null,
            payment: ownLeg.payment,
          }
        : null,
      // Co-passengers are a count, not a list. A passenger has no need to know
      // who else is in the vehicle before they board.
      coPassengerCount: ride.passengers.filter((p) => p.userId !== viewer.id).length,
      // Only this passenger's own stops are exposed.
      myStops: ride.stops.filter((s) => s.ridePassengerId === ownLeg?.id),
    };
  }

  /**
   * The single live ride a driver is working. `rides_one_active_per_driver`
   * guarantees there is at most one, so this can safely return a single object.
   */
  async activeForDriver(driverId: string) {
    return this.prisma.ride.findFirst({
      where: {
        driverId,
        status: {
          in: [
            RideStatus.ACCEPTED,
            RideStatus.DRIVER_ARRIVING,
            RideStatus.DRIVER_ARRIVED,
            RideStatus.IN_PROGRESS,
          ],
        },
      },
      select: {
        id: true,
        reference: true,
        rideType: true,
        status: true,
        joinable: true,
        seatsTotal: true,
        seatsOccupied: true,
        plannedDistanceM: true,
        plannedDurationS: true,
        activeRoute: { select: { encodedPolyline: true, distanceM: true, durationS: true } },
        stops: {
          where: { status: 'PENDING' },
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            type: true,
            address: true,
            latitude: true,
            longitude: true,
            estimatedArrivalAt: true,
          },
        },
      },
    });
  }

  /**
   * Open ride requests a driver could accept.
   *
   * The driver application needs this to show anything at all on its requests
   * screen. It deliberately applies no eligibility rule of its own: it lists
   * exactly what `RideLifecycleService.accept` would allow, so the list can
   * never promise work the accept call would then refuse. Acceptance stays
   * first-come-first-served and is still settled under the row lock there.
   *
   * The requesting passenger's name and phone are withheld until the ride is
   * actually theirs, matching how courier jobs project the customer.
   */
  async availableForDriver(driverId: string) {
    const availability = await this.prisma.driverAvailability.findUnique({
      where: { driverId },
      select: { presence: true, activeVehicleId: true },
    });

    if (!availability || availability.presence === DriverPresence.OFFLINE) {
      throw new DomainError(
        DomainErrorCode.DRIVER_UNAVAILABLE,
        'Go online to see ride requests.',
      );
    }

    if (!availability.activeVehicleId) {
      throw new DomainError(
        DomainErrorCode.DRIVER_UNAVAILABLE,
        'Select the vehicle you are driving to see ride requests.',
      );
    }

    const rides = await this.prisma.ride.findMany({
      where: { status: RideStatus.SEARCHING, driverId: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: {
        id: true,
        reference: true,
        rideType: true,
        seatsTotal: true,
        seatsOccupied: true,
        scheduledPickupAt: true,
        plannedDistanceM: true,
        plannedDurationS: true,
        currency: true,
        createdAt: true,
        vehicleType: { select: { id: true, code: true, name: true } },
        passengers: {
          orderBy: { createdAt: 'asc' },
          select: {
            seatsRequested: true,
            pickupAddress: true,
            dropoffAddress: true,
            pickupLatitude: true,
            pickupLongitude: true,
            dropoffLatitude: true,
            dropoffLongitude: true,
            fareQuote: { select: { driverNet: true, currency: true } },
          },
        },
      },
    });

    return rides.map((ride) => {
      const first = ride.passengers[0];

      return {
        rideId: ride.id,
        reference: ride.reference,
        rideType: ride.rideType,
        requestedAt: ride.createdAt,
        scheduledPickupAt: ride.scheduledPickupAt,
        seats: { total: ride.seatsTotal, occupied: ride.seatsOccupied },
        vehicleType: ride.vehicleType,
        distanceM: ride.plannedDistanceM,
        durationS: ride.plannedDurationS,
        currency: ride.currency,
        pickup: first
          ? {
              address: first.pickupAddress,
              lat: Number(first.pickupLatitude),
              lng: Number(first.pickupLongitude),
            }
          : null,
        dropoff: first
          ? {
              address: first.dropoffAddress,
              lat: Number(first.dropoffLatitude),
              lng: Number(first.dropoffLongitude),
            }
          : null,
        passengerCount: ride.passengers.length,
        // Summed rather than taken from the first leg: a shared ride that is
        // still SEARCHING can already carry more than one quoted passenger.
        driverNet: ride.passengers
          .reduce((total, p) => total.plus(p.fareQuote?.driverNet ?? 0), new Prisma.Decimal(0))
          .toFixed(2),
      };
    });
  }

  /** A passenger's own trip history, cursor-paginated. */
  async history(userId: string, pagination: CursorPaginationDto) {
    const rows = await this.prisma.ridePassenger.findMany({
      where: { userId },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        isSharedJoin: true,
        pickupAddress: true,
        dropoffAddress: true,
        createdAt: true,
        droppedOffAt: true,
        fareQuote: { select: { passengerTotal: true, currency: true, isShared: true } },
        ride: {
          select: {
            id: true,
            reference: true,
            rideType: true,
            status: true,
            vehicleType: { select: { code: true, name: true } },
          },
        },
      },
    });

    return buildCursorPage(rows, pagination.limit);
  }

  /** A driver's assigned work, cursor-paginated. */
  async driverHistory(driverId: string, pagination: CursorPaginationDto, status?: RideStatus) {
    const where: Prisma.RideWhereInput = { driverId, ...(status ? { status } : {}) };

    const rows = await this.prisma.ride.findMany({
      where,
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        rideType: true,
        status: true,
        createdAt: true,
        completedAt: true,
        seatsTotal: true,
        seatsOccupied: true,
        plannedDistanceM: true,
        plannedDurationS: true,
        vehicleType: { select: { code: true, name: true } },
        _count: { select: { passengers: true } },
      },
    });

    return buildCursorPage(rows, pagination.limit);
  }

  async route(rideId: string, viewer: AuthenticatedUser) {
    // findOne performs the access check; reuse it rather than duplicating.
    await this.findOne(rideId, viewer);

    return this.prisma.rideRoute.findMany({
      where: { ride: { id: rideId } },
      orderBy: { version: 'desc' },
      take: 1,
      select: {
        version: true,
        provider: true,
        encodedPolyline: true,
        distanceM: true,
        durationS: true,
        legs: true,
        computedAt: true,
      },
    });
  }
}
