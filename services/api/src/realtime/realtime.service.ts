import { Injectable, Logger } from '@nestjs/common';
import { REALTIME_EVENTS, RealtimeEvent } from './realtime.events';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeMembershipService } from './realtime.membership';
import { roomFor } from './realtime.rooms';

/**
 * How the rest of the application pushes something to a client.
 *
 * Domain services call these; none of them import socket.io, and none of them
 * knows what a room is. Two properties matter:
 *
 *   - **Publishing never fails the operation it describes.** A ride is not
 *     rolled back because a socket write threw. Every method swallows and logs.
 *   - **Publishing happens after commit.** Emitting inside a transaction would
 *     announce a state that a later rollback un-does, and a client that
 *     re-reads on the event would see the old row.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly membership: RealtimeMembershipService,
  ) {}

  toRide(rideId: string, event: RealtimeEvent, data: Record<string, unknown> = {}): void {
    this.emit(roomFor.ride(rideId), event, { rideId, ...data });
  }

  toFoodOrder(orderId: string, event: RealtimeEvent, data: Record<string, unknown> = {}): void {
    this.emit(roomFor.foodOrder(orderId), event, { orderId, ...data });
  }

  toParcel(parcelId: string, event: RealtimeEvent, data: Record<string, unknown> = {}): void {
    this.emit(roomFor.parcel(parcelId), event, { parcelId, ...data });
  }

  toUser(userId: string, event: RealtimeEvent, data: Record<string, unknown> = {}): void {
    this.emit(roomFor.user(userId), event, data);
  }

  toDriver(driverId: string, event: RealtimeEvent, data: Record<string, unknown> = {}): void {
    this.emit(roomFor.driver(driverId), event, data);
  }

  /**
   * Pushes a driver's position to the passengers of the rides they are working.
   *
   * The position goes to ride rooms, never to a driver-wide channel, so a
   * passenger only ever sees the vehicle while it is carrying out their
   * journey. When the driver has no live ride, nothing is published at all —
   * an online driver crossing town is not broadcasting their movements.
   */
  async publishDriverLocation(
    driverId: string,
    position: {
      lat: number;
      lng: number;
      headingDeg?: number | null;
      speedKph?: number | null;
      recordedAt: Date;
    },
  ): Promise<number> {
    try {
      const rideIds = await this.membership.activeRideIdsForDriver(driverId);

      for (const rideId of rideIds) {
        this.emit(roomFor.ride(rideId), REALTIME_EVENTS.DRIVER_LOCATION, {
          rideId,
          lat: position.lat,
          lng: position.lng,
          headingDeg: position.headingDeg ?? null,
          speedKph: position.speedKph ?? null,
          recordedAt: position.recordedAt.toISOString(),
        });
      }

      return rideIds.length;
    } catch (error) {
      this.logger.warn(
        `Could not publish position for driver ${driverId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return 0;
    }
  }

  private emit(room: string, event: RealtimeEvent, data: Record<string, unknown>): void {
    try {
      // The gateway's server is undefined until Nest has bound the adapter,
      // which is after module init — an event raised in between is dropped
      // rather than crashing boot.
      this.gateway.server?.to(room).emit(event, {
        event,
        at: new Date().toISOString(),
        data,
      });
    } catch (error) {
      this.logger.warn(
        `Realtime publish failed for ${event} → ${room}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
