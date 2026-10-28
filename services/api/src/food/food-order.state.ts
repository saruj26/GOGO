import { FoodOrderStatus, RoleCode } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';

/**
 * The food order state machine.
 *
 * Two questions are answered separately and both must be satisfied:
 *
 *   1. **Is the move legal at all?** `TRANSITIONS` says which statuses can
 *      follow which. Anything absent is refused.
 *   2. **Is this actor allowed to make it?** `ACTORS` says who may move an order
 *      *into* each status.
 *
 * Separating them is what makes the rules in the specification fall out
 * naturally: a restaurant cannot mark an order DELIVERED because only a driver
 * appears under DELIVERED; a customer cannot mark one PICKED_UP for the same
 * reason. Neither can be bypassed by calling endpoints in an unusual order,
 * because the previous status is validated too.
 */
export const FOOD_ORDER_TRANSITIONS: Record<FoodOrderStatus, FoodOrderStatus[]> = {
  [FoodOrderStatus.DRAFT]: [
    FoodOrderStatus.PENDING_PAYMENT,
    FoodOrderStatus.PLACED,
    FoodOrderStatus.CANCELLED,
  ],
  [FoodOrderStatus.PENDING_PAYMENT]: [FoodOrderStatus.PLACED, FoodOrderStatus.CANCELLED],
  [FoodOrderStatus.PLACED]: [
    FoodOrderStatus.ACCEPTED,
    FoodOrderStatus.REJECTED,
    FoodOrderStatus.CANCELLED,
  ],
  [FoodOrderStatus.ACCEPTED]: [FoodOrderStatus.PREPARING, FoodOrderStatus.CANCELLED],
  // A kitchen that finishes while a courier is already assigned goes straight to
  // ASSIGNED; otherwise the order waits at READY_FOR_PICKUP for one.
  [FoodOrderStatus.PREPARING]: [
    FoodOrderStatus.READY_FOR_PICKUP,
    FoodOrderStatus.ASSIGNED,
    FoodOrderStatus.CANCELLED,
  ],
  [FoodOrderStatus.READY_FOR_PICKUP]: [FoodOrderStatus.ASSIGNED, FoodOrderStatus.CANCELLED],
  // A courier who abandons the job returns the order to the waiting state
  // rather than cancelling the customer's food.
  [FoodOrderStatus.ASSIGNED]: [
    FoodOrderStatus.PICKED_UP,
    FoodOrderStatus.READY_FOR_PICKUP,
    FoodOrderStatus.CANCELLED,
  ],
  [FoodOrderStatus.PICKED_UP]: [FoodOrderStatus.DELIVERING, FoodOrderStatus.CANCELLED],
  [FoodOrderStatus.DELIVERING]: [FoodOrderStatus.DELIVERED, FoodOrderStatus.CANCELLED],
  [FoodOrderStatus.DELIVERED]: [],
  [FoodOrderStatus.REJECTED]: [],
  [FoodOrderStatus.CANCELLED]: [],
};

/** Who may move an order INTO each status. */
export const FOOD_ORDER_TRANSITION_ACTORS: Record<FoodOrderStatus, RoleCode[]> = {
  [FoodOrderStatus.DRAFT]: [RoleCode.USER],
  [FoodOrderStatus.PENDING_PAYMENT]: [RoleCode.USER],
  [FoodOrderStatus.PLACED]: [RoleCode.USER],
  [FoodOrderStatus.ACCEPTED]: [RoleCode.RESTAURANT, RoleCode.ADMIN],
  [FoodOrderStatus.REJECTED]: [RoleCode.RESTAURANT, RoleCode.ADMIN],
  [FoodOrderStatus.PREPARING]: [RoleCode.RESTAURANT, RoleCode.ADMIN],
  [FoodOrderStatus.READY_FOR_PICKUP]: [RoleCode.RESTAURANT, RoleCode.DRIVER, RoleCode.ADMIN],
  [FoodOrderStatus.ASSIGNED]: [RoleCode.DRIVER, RoleCode.RESTAURANT, RoleCode.ADMIN],
  [FoodOrderStatus.PICKED_UP]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [FoodOrderStatus.DELIVERING]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [FoodOrderStatus.DELIVERED]: [RoleCode.DRIVER, RoleCode.ADMIN],
  [FoodOrderStatus.CANCELLED]: [RoleCode.USER, RoleCode.RESTAURANT, RoleCode.ADMIN],
};

/** Statuses at which the order is still the kitchen's problem, not the road's. */
export const FOOD_ORDER_IN_KITCHEN: FoodOrderStatus[] = [
  FoodOrderStatus.PLACED,
  FoodOrderStatus.ACCEPTED,
  FoodOrderStatus.PREPARING,
];

/** Statuses at which a courier can still be offered the job. */
export const FOOD_ORDER_AWAITING_COURIER: FoodOrderStatus[] = [
  FoodOrderStatus.ACCEPTED,
  FoodOrderStatus.PREPARING,
  FoodOrderStatus.READY_FOR_PICKUP,
];

export const FOOD_ORDER_TERMINAL: FoodOrderStatus[] = [
  FoodOrderStatus.DELIVERED,
  FoodOrderStatus.REJECTED,
  FoodOrderStatus.CANCELLED,
];

const HUMAN = (status: FoodOrderStatus): string =>
  status.toLowerCase().replace(/_/g, ' ');

/**
 * Validates a transition and the actor attempting it. Throws a clean domain
 * error rather than returning a boolean, so no caller can forget to check.
 */
export function assertFoodTransition(
  from: FoodOrderStatus,
  to: FoodOrderStatus,
  actorRole: RoleCode,
): void {
  if (!FOOD_ORDER_TRANSITIONS[from]?.includes(to)) {
    throw new DomainError(
      DomainErrorCode.ORDER_NOT_MODIFIABLE,
      `An order that is ${HUMAN(from)} cannot become ${HUMAN(to)}.`,
    );
  }

  if (!FOOD_ORDER_TRANSITION_ACTORS[to]?.includes(actorRole)) {
    // The message says what the actor may not do, not what somebody else could
    // — enumerating the other roles would describe the workflow to an attacker.
    throw DomainError.forbidden(`You cannot mark an order ${HUMAN(to)}.`);
  }
}

export function isTerminal(status: FoodOrderStatus): boolean {
  return FOOD_ORDER_TERMINAL.includes(status);
}
