import { DomainError, DomainErrorCode } from '../common/errors/domain.error';

/**
 * The channels a client may ask to join, and what has to be true for them.
 *
 * Rooms are parsed rather than pattern-matched loosely, because the room name
 * arrives from the client. `ride:<uuid>` is the whole grammar — anything else
 * is refused before a database is touched, so a malformed or hostile name
 * cannot become a query.
 */
export type RoomKind = 'ride' | 'food-order' | 'parcel' | 'user' | 'driver';

export interface ParsedRoom {
  kind: RoomKind;
  id: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KINDS: Record<string, RoomKind> = {
  ride: 'ride',
  'food-order': 'food-order',
  parcel: 'parcel',
  user: 'user',
  driver: 'driver',
};

export function parseRoom(room: string): ParsedRoom {
  if (typeof room !== 'string' || room.length > 80) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unknown channel.');
  }

  const separator = room.indexOf(':');
  if (separator <= 0) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unknown channel.');
  }

  const kind = KINDS[room.slice(0, separator)];
  const id = room.slice(separator + 1);

  if (!kind || !UUID.test(id)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unknown channel.');
  }

  return { kind, id };
}

export const roomFor = {
  ride: (rideId: string) => `ride:${rideId}`,
  foodOrder: (orderId: string) => `food-order:${orderId}`,
  parcel: (parcelId: string) => `parcel:${parcelId}`,
  /** A person's own channel, for notifications and anything account-scoped. */
  user: (userId: string) => `user:${userId}`,
  /** A driver's working channel: offers, assignments, availability. */
  driver: (driverId: string) => `driver:${driverId}`,
};

/**
 * Whether a room even needs a database check, and which one.
 *
 * `user` and `driver` rooms are settled from the token alone — you may listen
 * to yourself and to your own driver identity, and to nobody else's. Everything
 * else describes a shared resource and has to be checked against it.
 */
export function authorisationFor(
  room: ParsedRoom,
  caller: { userId: string; driverId: string | null; isAdmin: boolean },
): 'allow' | 'deny' | 'check-membership' {
  if (caller.isAdmin) return 'allow';

  switch (room.kind) {
    case 'user':
      return room.id === caller.userId ? 'allow' : 'deny';
    case 'driver':
      return room.id === caller.driverId ? 'allow' : 'deny';
    default:
      return 'check-membership';
  }
}
