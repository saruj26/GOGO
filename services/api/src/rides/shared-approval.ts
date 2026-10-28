import { RidePassengerStatus } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';

/**
 * What the driver's decision does to a shared-passenger request.
 *
 * `apply` means carry out the transition; `noop` means the request already
 * reached that outcome and the caller should return success without changing
 * anything. A driver double-tapping Accept on a slow connection must not be
 * told their own ride is in an invalid state.
 */
export type ApprovalOutcome = 'apply' | 'noop';

export type ApprovalAction = 'accept' | 'reject';

/**
 * The only status a decision can be made from is OFFERED — the state a
 * passenger sits in between asking to join and the driver answering.
 *
 * Every other status means somebody already resolved this: the driver, the
 * passenger withdrawing, or the ride ending. Those are reported as conflicts
 * rather than silently overwritten, because overwriting them would move a
 * passenger who has already been dropped off back into a live ride.
 */
export function approvalOutcome(
  current: RidePassengerStatus,
  action: ApprovalAction,
): ApprovalOutcome {
  if (current === RidePassengerStatus.OFFERED) return 'apply';

  const settled =
    action === 'accept'
      ? RidePassengerStatus.CONFIRMED
      : RidePassengerStatus.REJECTED;

  if (current === settled) return 'noop';

  // Accepting someone who is already aboard is the same request arriving late,
  // not a mistake worth failing.
  if (
    action === 'accept' &&
    (current === RidePassengerStatus.AWAITING_PICKUP ||
      current === RidePassengerStatus.ONBOARD ||
      current === RidePassengerStatus.DROPPED_OFF)
  ) {
    return 'noop';
  }

  throw DomainError.conflict(
    DomainErrorCode.CONFLICT,
    current === RidePassengerStatus.CANCELLED
      ? 'That passenger has withdrawn their request.'
      : 'That request is no longer waiting for a decision.',
  );
}

/**
 * Whether a request is still awaiting a decision, for listing purposes.
 */
export function isAwaitingDecision(status: RidePassengerStatus): boolean {
  return status === RidePassengerStatus.OFFERED;
}

/**
 * Seats are held from the moment a passenger asks, not from the moment the
 * driver agrees.
 *
 * Holding at request time is what stops two pending requests from being
 * accepted into one seat. It follows that rejecting must give the seat back,
 * and that accepting must not claim a second one — which is what this states
 * for the callers on both sides.
 */
export function seatEffectOf(action: ApprovalAction, outcome: ApprovalOutcome): 'release' | 'none' {
  if (outcome === 'noop') return 'none';
  return action === 'reject' ? 'release' : 'none';
}

/** A ride in one of these states can still take on a shared passenger. */
export function rideCanApprove(status: string): boolean {
  return (
    status === 'SCHEDULED' ||
    status === 'ACCEPTED' ||
    status === 'DRIVER_ARRIVING' ||
    status === 'DRIVER_ARRIVED' ||
    status === 'IN_PROGRESS'
  );
}
