import { RidePassengerStatus } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import {
  approvalOutcome,
  isAwaitingDecision,
  rideCanApprove,
  seatEffectOf,
} from './shared-approval';

/**
 * The driver's decision on a shared passenger.
 *
 * The rules that matter here are the ones a race can break: a double tap must
 * not double-add, a decision on an already-resolved request must not silently
 * overwrite it, and a rejection must give the seat back exactly once.
 */
describe('shared passenger approval', () => {
  const expectConflict = (from: RidePassengerStatus, action: 'accept' | 'reject') => {
    let thrown: unknown;
    try {
      approvalOutcome(from, action);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe(DomainErrorCode.CONFLICT);
  };

  describe('a request awaiting a decision', () => {
    it('can be accepted', () => {
      expect(approvalOutcome(RidePassengerStatus.OFFERED, 'accept')).toBe('apply');
    });

    it('can be rejected', () => {
      expect(approvalOutcome(RidePassengerStatus.OFFERED, 'reject')).toBe('apply');
    });

    it('is the only status that is awaiting a decision', () => {
      expect(isAwaitingDecision(RidePassengerStatus.OFFERED)).toBe(true);

      for (const status of [
        RidePassengerStatus.REQUESTED,
        RidePassengerStatus.CONFIRMED,
        RidePassengerStatus.AWAITING_PICKUP,
        RidePassengerStatus.ONBOARD,
        RidePassengerStatus.DROPPED_OFF,
        RidePassengerStatus.CANCELLED,
        RidePassengerStatus.REJECTED,
        RidePassengerStatus.NO_SHOW,
      ]) {
        expect(isAwaitingDecision(status)).toBe(false);
      }
    });
  });

  describe('repeating a decision', () => {
    it('accepting an already-accepted passenger changes nothing', () => {
      expect(approvalOutcome(RidePassengerStatus.CONFIRMED, 'accept')).toBe('noop');
    });

    it('rejecting an already-rejected request changes nothing', () => {
      expect(approvalOutcome(RidePassengerStatus.REJECTED, 'reject')).toBe('noop');
    });

    it('a late accept for someone already aboard is not an error', () => {
      // The request succeeded; the response was lost. Failing here would tell
      // a driver their own ride is broken.
      expect(approvalOutcome(RidePassengerStatus.AWAITING_PICKUP, 'accept')).toBe('noop');
      expect(approvalOutcome(RidePassengerStatus.ONBOARD, 'accept')).toBe('noop');
      expect(approvalOutcome(RidePassengerStatus.DROPPED_OFF, 'accept')).toBe('noop');
    });
  });

  describe('deciding on a request somebody else already resolved', () => {
    it('refuses to accept a rejected request', () => {
      expectConflict(RidePassengerStatus.REJECTED, 'accept');
    });

    it('refuses to reject a confirmed passenger', () => {
      // Rejecting here would drop a passenger who is already on the ride.
      expectConflict(RidePassengerStatus.CONFIRMED, 'reject');
    });

    it('refuses to reject someone who is already aboard', () => {
      expectConflict(RidePassengerStatus.ONBOARD, 'reject');
      expectConflict(RidePassengerStatus.DROPPED_OFF, 'reject');
    });

    it('explains that a withdrawn passenger withdrew', () => {
      let thrown: unknown;
      try {
        approvalOutcome(RidePassengerStatus.CANCELLED, 'accept');
      } catch (error) {
        thrown = error;
      }

      expect((thrown as DomainError).message).toContain('withdrawn');
    });
  });

  describe('what a decision does to the seat', () => {
    it('rejecting releases the held seat', () => {
      expect(seatEffectOf('reject', 'apply')).toBe('release');
    });

    it('accepting claims nothing — the seat was held at request time', () => {
      // Claiming again here would double-count and overbook the vehicle.
      expect(seatEffectOf('accept', 'apply')).toBe('none');
    });

    it('a repeated decision touches no seats', () => {
      expect(seatEffectOf('reject', 'noop')).toBe('none');
      expect(seatEffectOf('accept', 'noop')).toBe('none');
    });
  });

  describe('which rides can take a decision at all', () => {
    it('accepts every live status', () => {
      for (const status of [
        'SCHEDULED',
        'ACCEPTED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS',
      ]) {
        expect(rideCanApprove(status)).toBe(true);
      }
    });

    it('refuses a ride that is over or was never live', () => {
      for (const status of ['DRAFT', 'SEARCHING', 'COMPLETED', 'CANCELLED', 'EXPIRED']) {
        expect(rideCanApprove(status)).toBe(false);
      }
    });
  });
});
