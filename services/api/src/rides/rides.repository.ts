import { Injectable } from '@nestjs/common';
import { Prisma, RideStatus } from '@prisma/client';

export interface LockedRide {
  id: string;
  status: RideStatus;
  joinable: boolean;
  ride_type: string;
  seats_total: number;
  seats_occupied: number;
  driver_id: string | null;
  vehicle_type_id: string;
  scheduled_pickup_at: Date | null;
  started_at: Date | null;
  active_route_id: string | null;
}

@Injectable()
export class RidesRepository {
  /**
   * Takes an exclusive row lock on a ride for the remainder of the transaction.
   *
   * This is the mechanism that prevents two passengers being sold the same last
   * seat: the second transaction blocks here until the first commits, and then
   * sees the updated `seats_occupied`. The
   * `rides_seats_within_capacity` CHECK constraint is the backstop if this
   * discipline is ever bypassed.
   */
  async lockRide(tx: Prisma.TransactionClient, rideId: string): Promise<LockedRide | null> {
    const rows = await tx.$queryRaw<LockedRide[]>`
      SELECT
        id,
        status,
        joinable,
        ride_type::text AS ride_type,
        seats_total,
        seats_occupied,
        driver_id,
        vehicle_type_id,
        scheduled_pickup_at,
        started_at,
        active_route_id
      FROM rides
      WHERE id = ${rideId}::uuid
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  /**
   * Claims seats atomically. The WHERE clause re-asserts the capacity
   * invariant, so even without the row lock this update could never oversell —
   * it simply affects zero rows instead.
   */
  async claimSeats(
    tx: Prisma.TransactionClient,
    rideId: string,
    seats: number,
  ): Promise<boolean> {
    const affected = await tx.$executeRaw`
      UPDATE rides
      SET seats_occupied = seats_occupied + ${seats}
      WHERE id = ${rideId}::uuid
        AND seats_occupied + ${seats} <= seats_total
    `;

    return affected === 1;
  }

  async releaseSeats(
    tx: Prisma.TransactionClient,
    rideId: string,
    seats: number,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE rides
      SET seats_occupied = GREATEST(0, seats_occupied - ${seats})
      WHERE id = ${rideId}::uuid
    `;
  }

  /** Next human-facing reference, e.g. RD-8F3K2Q. */
  static reference(prefix: string): string {
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `${prefix}-${suffix}`;
  }
}
