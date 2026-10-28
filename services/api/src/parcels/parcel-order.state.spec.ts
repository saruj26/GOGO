import { ParcelStatus, RoleCode } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import {
  PARCEL_AWAITING_COURIER,
  PARCEL_COURIER_ACTIVE,
  assertParcelTransition,
} from './parcel-order.state';

describe('parcel state machine', () => {
  const expectRefused = (
    from: ParcelStatus,
    to: ParcelStatus,
    role: RoleCode,
    code: DomainErrorCode,
  ) => {
    let thrown: unknown;
    try {
      assertParcelTransition(from, to, role);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe(code);
  };

  describe('the happy path', () => {
    const path: Array<[ParcelStatus, ParcelStatus, RoleCode]> = [
      [ParcelStatus.DRAFT, ParcelStatus.PLACED, RoleCode.USER],
      [ParcelStatus.PLACED, ParcelStatus.ASSIGNED, RoleCode.DRIVER],
      [ParcelStatus.ASSIGNED, ParcelStatus.HEADING_TO_PICKUP, RoleCode.DRIVER],
      [ParcelStatus.HEADING_TO_PICKUP, ParcelStatus.PICKED_UP, RoleCode.DRIVER],
      [ParcelStatus.PICKED_UP, ParcelStatus.IN_TRANSIT, RoleCode.DRIVER],
      [ParcelStatus.IN_TRANSIT, ParcelStatus.DELIVERED, RoleCode.DRIVER],
    ];

    for (const [from, to, role] of path) {
      it(`allows ${role} to move ${from} → ${to}`, () => {
        expect(() => assertParcelTransition(from, to, role)).not.toThrow();
      });
    }
  });

  describe('a sender cannot do the courier’s job', () => {
    it('cannot mark their own parcel collected', () => {
      expectRefused(
        ParcelStatus.ASSIGNED,
        ParcelStatus.PICKED_UP,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('cannot mark their own parcel delivered', () => {
      expectRefused(
        ParcelStatus.IN_TRANSIT,
        ParcelStatus.DELIVERED,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('cannot assign a courier to themselves', () => {
      expectRefused(
        ParcelStatus.PLACED,
        ParcelStatus.ASSIGNED,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });
  });

  describe('a courier cannot do the sender’s job', () => {
    it('cannot cancel somebody’s booking', () => {
      expectRefused(
        ParcelStatus.ASSIGNED,
        ParcelStatus.CANCELLED,
        RoleCode.DRIVER,
        DomainErrorCode.FORBIDDEN,
      );
    });
  });

  describe('a collected parcel cannot be cancelled', () => {
    it('refuses cancellation once the courier has it', () => {
      expectRefused(
        ParcelStatus.PICKED_UP,
        ParcelStatus.CANCELLED,
        RoleCode.USER,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('refuses cancellation in transit', () => {
      expectRefused(
        ParcelStatus.IN_TRANSIT,
        ParcelStatus.CANCELLED,
        RoleCode.ADMIN,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('allows a courier to report a failed delivery instead', () => {
      expect(() =>
        assertParcelTransition(ParcelStatus.IN_TRANSIT, ParcelStatus.FAILED, RoleCode.DRIVER),
      ).not.toThrow();
    });
  });

  describe('out-of-order calls are refused', () => {
    it('a courier cannot collect a parcel they have not been assigned', () => {
      expectRefused(
        ParcelStatus.PLACED,
        ParcelStatus.PICKED_UP,
        RoleCode.DRIVER,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('a delivered parcel is final', () => {
      expectRefused(
        ParcelStatus.DELIVERED,
        ParcelStatus.IN_TRANSIT,
        RoleCode.DRIVER,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('a cancelled parcel cannot be resurrected', () => {
      expectRefused(
        ParcelStatus.CANCELLED,
        ParcelStatus.ASSIGNED,
        RoleCode.DRIVER,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });
  });

  describe('a courier who abandons before collection', () => {
    it('returns the job to the pool rather than failing the booking', () => {
      expect(() =>
        assertParcelTransition(
          ParcelStatus.ASSIGNED,
          ParcelStatus.SEARCHING_DRIVER,
          RoleCode.DRIVER,
        ),
      ).not.toThrow();
    });
  });

  describe('status groupings', () => {
    it('offers unclaimed parcels to couriers', () => {
      expect(PARCEL_AWAITING_COURIER).toEqual([
        ParcelStatus.PLACED,
        ParcelStatus.SEARCHING_DRIVER,
      ]);
    });

    it('treats every committed status as courier-active', () => {
      expect(PARCEL_COURIER_ACTIVE).toEqual([
        ParcelStatus.ASSIGNED,
        ParcelStatus.HEADING_TO_PICKUP,
        ParcelStatus.PICKED_UP,
        ParcelStatus.IN_TRANSIT,
      ]);
    });

    it('does not treat a terminal status as courier-active', () => {
      expect(PARCEL_COURIER_ACTIVE).not.toContain(ParcelStatus.DELIVERED);
      expect(PARCEL_COURIER_ACTIVE).not.toContain(ParcelStatus.CANCELLED);
    });
  });
});
