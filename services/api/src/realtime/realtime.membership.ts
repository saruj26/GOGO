import { Injectable } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ParsedRoom } from './realtime.rooms';

/**
 * Does this person belong to this resource?
 *
 * The room id arrives from the client, so nothing here trusts it: each check is
 * a query that can only match rows the caller is genuinely attached to. A
 * passenger who guesses another ride's id gets the same answer as one who
 * invents a random uuid.
 */
@Injectable()
export class RealtimeMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async isMember(
    room: ParsedRoom,
    caller: { userId: string; driverId: string | null },
  ): Promise<boolean> {
    switch (room.kind) {
      case 'ride':
        return this.onRide(room.id, caller);
      case 'food-order':
        return this.onFoodOrder(room.id, caller);
      case 'parcel':
        return this.onParcel(room.id, caller);
      default:
        return false;
    }
  }

  /**
   * A ride is watchable by the passengers on it and by its assigned driver.
   *
   * A withdrawn or rejected passenger is excluded: they are no longer on the
   * journey, and the driver's position is not theirs to follow.
   */
  private async onRide(
    rideId: string,
    caller: { userId: string; driverId: string | null },
  ): Promise<boolean> {
    const count = await this.prisma.ride.count({
      where: {
        id: rideId,
        OR: [
          ...(caller.driverId ? [{ driverId: caller.driverId }] : []),
          {
            passengers: {
              some: {
                userId: caller.userId,
                status: {
                  notIn: ['CANCELLED', 'REJECTED', 'NO_SHOW'],
                },
              },
            },
          },
        ],
      },
    });

    return count > 0;
  }

  private async onFoodOrder(
    orderId: string,
    caller: { userId: string; driverId: string | null },
  ): Promise<boolean> {
    const count = await this.prisma.foodOrder.count({
      where: {
        id: orderId,
        OR: [
          { userId: caller.userId },
          ...(caller.driverId ? [{ delivery: { driverId: caller.driverId } }] : []),
        ],
      },
    });

    return count > 0;
  }

  private async onParcel(
    parcelId: string,
    caller: { userId: string; driverId: string | null },
  ): Promise<boolean> {
    const count = await this.prisma.parcelOrder.count({
      where: {
        id: parcelId,
        OR: [
          { userId: caller.userId },
          ...(caller.driverId ? [{ driverId: caller.driverId }] : []),
        ],
      },
    });

    return count > 0;
  }

  /**
   * The rides whose passengers should receive this driver's position.
   *
   * Only a ride actually under way: a completed or cancelled journey stops
   * receiving positions the moment it ends, which is what keeps a driver's
   * movements from being followed after the trip they were hired for.
   */
  async activeRideIdsForDriver(driverId: string): Promise<string[]> {
    const rides = await this.prisma.ride.findMany({
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
      select: { id: true },
    });

    return rides.map((ride) => ride.id);
  }
}
