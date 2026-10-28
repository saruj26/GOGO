import { ParcelStatus, RoleCode } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';

/**
 * The parcel lifecycle, using the statuses the schema already defines.
 *
 * As with food, legality and authority are separate questions: `TRANSITIONS`
 * says what may follow what, `ACTORS` says who may cause it. A customer cannot
 * mark their own parcel picked up, and a courier cannot cancel it on the
 * customer's behalf.
 */
export const PARCEL_TRANSITIONS: Record<ParcelStatus, ParcelStatus[]> = {
  [ParcelStatus.DRAFT]: [ParcelStatus.PENDING_PAYMENT, ParcelStatus.PLACED, ParcelStatus.CANCELLED],
  [ParcelStatus.PENDING_PAYMENT]: [ParcelStatus.PLACED, ParcelStatus.CANCELLED],
  [ParcelStatus.PLACED]: [
    ParcelStatus.SEARCHING_DRIVER,
    ParcelStatus.ASSIGNED,
    ParcelStatus.CANCELLED,
  ],
  [ParcelStatus.SEARCHING_DRIVER]: [
    ParcelStatus.ASSIGNED,
    ParcelStatus.CANCELLED,
    ParcelStatus.FAILED,
  ],
  // HEADING_TO_PICKUP is a courtesy status for the sender's benefit, not a gate:
  // a courier who simply arrives and collects must not be blocked for skipping
  // it. A courier who abandons before collection returns the job to the pool
  // rather than failing the customer's booking.
  [ParcelStatus.ASSIGNED]: [
    ParcelStatus.HEADING_TO_PICKUP,
    ParcelStatus.PICKED_UP,
    ParcelStatus.SEARCHING_DRIVER,
    ParcelStatus.CANCELLED,
  ],
  [ParcelStatus.HEADING_TO_PICKUP]: [
    ParcelStatus.PICKED_UP,
    ParcelStatus.SEARCHING_DRIVER,
    ParcelStatus.CANCELLED,
  ],
  // Once the parcel is in the courier's hands it can only complete or fail —
  // there is no cancelling something already collected.
  [ParcelStatus.PICKED_UP]: [ParcelStatus.IN_TRANSIT, ParcelStatus.FAILED],
  [ParcelStatus.IN_TRANSIT]: [ParcelStatus.DELIVERED, ParcelStatus.FAILED],
  [ParcelStatus.DELIVERED]: [],
  [ParcelStatus.CANCELLED]: [],
  [ParcelStatus.FAILED]: [],
};

export const PARCEL_TRANSITION_ACTORS: Record<ParcelStatus, RoleCode[]> = {
  [ParcelStatus.DRAFT]: [RoleCode.USER],
  [ParcelStatus.PENDING_PAYMENT]: [RoleCode.USER],
  [ParcelStatus.PLACED]: [RoleCode.USER],
  [ParcelStatus.SEARCHING_DRIVER]: [RoleCode.USER, RoleCode.DRIVER, RoleCode.ADMIN],
  [ParcelStatus.ASSIGNED]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [ParcelStatus.HEADING_TO_PICKUP]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [ParcelStatus.PICKED_UP]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [ParcelStatus.IN_TRANSIT]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [ParcelStatus.DELIVERED]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [ParcelStatus.CANCELLED]: [RoleCode.USER, RoleCode.ADMIN],
  [ParcelStatus.FAILED]: [RoleCode.DRIVER, RoleCode.ADMIN],
};

/** Statuses at which a courier can still claim the job. */
export const PARCEL_AWAITING_COURIER: ParcelStatus[] = [
  ParcelStatus.PLACED,
  ParcelStatus.SEARCHING_DRIVER,
];

/** Statuses at which a courier is committed to the job. */
export const PARCEL_COURIER_ACTIVE: ParcelStatus[] = [
  ParcelStatus.ASSIGNED,
  ParcelStatus.HEADING_TO_PICKUP,
  ParcelStatus.PICKED_UP,
  ParcelStatus.IN_TRANSIT,
];

export const PARCEL_TERMINAL: ParcelStatus[] = [
  ParcelStatus.DELIVERED,
  ParcelStatus.CANCELLED,
  ParcelStatus.FAILED,
];

const HUMAN = (status: ParcelStatus): string => status.toLowerCase().replace(/_/g, ' ');

export function assertParcelTransition(
  from: ParcelStatus,
  to: ParcelStatus,
  actorRole: RoleCode,
): void {
  if (!PARCEL_TRANSITIONS[from]?.includes(to)) {
    throw new DomainError(
      DomainErrorCode.ORDER_NOT_MODIFIABLE,
      `A parcel that is ${HUMAN(from)} cannot become ${HUMAN(to)}.`,
    );
  }

  if (!PARCEL_TRANSITION_ACTORS[to]?.includes(actorRole)) {
    throw DomainError.forbidden(`You cannot mark a parcel ${HUMAN(to)}.`);
  }
}
