import { FoodOrderStatus, RoleCode } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import {
  FOOD_ORDER_AWAITING_COURIER,
  assertFoodTransition,
  isTerminal,
} from './food-order.state';

/**
 * The rules §4 of the brief calls out by name, plus the cases around them.
 * Legality and authority are asserted separately, because a caller can be
 * wrong about either.
 */
describe('food order state machine', () => {
  const expectRefused = (
    from: FoodOrderStatus,
    to: FoodOrderStatus,
    role: RoleCode,
    code: DomainErrorCode,
  ) => {
    let thrown: unknown;
    try {
      assertFoodTransition(from, to, role);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe(code);
  };

  describe('the happy path', () => {
    const path: Array<[FoodOrderStatus, FoodOrderStatus, RoleCode]> = [
      [FoodOrderStatus.DRAFT, FoodOrderStatus.PLACED, RoleCode.USER],
      [FoodOrderStatus.PLACED, FoodOrderStatus.ACCEPTED, RoleCode.RESTAURANT],
      [FoodOrderStatus.ACCEPTED, FoodOrderStatus.PREPARING, RoleCode.RESTAURANT],
      [FoodOrderStatus.PREPARING, FoodOrderStatus.READY_FOR_PICKUP, RoleCode.RESTAURANT],
      [FoodOrderStatus.READY_FOR_PICKUP, FoodOrderStatus.ASSIGNED, RoleCode.DRIVER],
      [FoodOrderStatus.ASSIGNED, FoodOrderStatus.PICKED_UP, RoleCode.DRIVER],
      [FoodOrderStatus.PICKED_UP, FoodOrderStatus.DELIVERING, RoleCode.DRIVER],
      [FoodOrderStatus.DELIVERING, FoodOrderStatus.DELIVERED, RoleCode.DRIVER],
    ];

    for (const [from, to, role] of path) {
      it(`allows ${role} to move ${from} → ${to}`, () => {
        expect(() => assertFoodTransition(from, to, role)).not.toThrow();
      });
    }
  });

  describe('a restaurant cannot do a courier’s job', () => {
    it('cannot mark an order delivered', () => {
      expectRefused(
        FoodOrderStatus.DELIVERING,
        FoodOrderStatus.DELIVERED,
        RoleCode.RESTAURANT,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('cannot mark an order picked up', () => {
      expectRefused(
        FoodOrderStatus.ASSIGNED,
        FoodOrderStatus.PICKED_UP,
        RoleCode.RESTAURANT,
        DomainErrorCode.FORBIDDEN,
      );
    });
  });

  describe('a customer cannot do anybody else’s job', () => {
    it('cannot mark an order picked up', () => {
      expectRefused(
        FoodOrderStatus.ASSIGNED,
        FoodOrderStatus.PICKED_UP,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('cannot accept their own order on the restaurant’s behalf', () => {
      expectRefused(
        FoodOrderStatus.PLACED,
        FoodOrderStatus.ACCEPTED,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('cannot mark their own order delivered', () => {
      expectRefused(
        FoodOrderStatus.DELIVERING,
        FoodOrderStatus.DELIVERED,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });
  });

  describe('a courier cannot do the kitchen’s job', () => {
    it('cannot accept an order', () => {
      expectRefused(
        FoodOrderStatus.PLACED,
        FoodOrderStatus.ACCEPTED,
        RoleCode.DRIVER,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('cannot reject an order', () => {
      expectRefused(
        FoodOrderStatus.PLACED,
        FoodOrderStatus.REJECTED,
        RoleCode.DRIVER,
        DomainErrorCode.FORBIDDEN,
      );
    });
  });

  describe('out-of-order calls are refused even for the right role', () => {
    it('a courier cannot collect an order the kitchen has not accepted', () => {
      expectRefused(
        FoodOrderStatus.PLACED,
        FoodOrderStatus.PICKED_UP,
        RoleCode.DRIVER,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('a kitchen cannot mark an order ready before accepting it', () => {
      expectRefused(
        FoodOrderStatus.PLACED,
        FoodOrderStatus.READY_FOR_PICKUP,
        RoleCode.RESTAURANT,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('a delivered order cannot move anywhere', () => {
      expectRefused(
        FoodOrderStatus.DELIVERED,
        FoodOrderStatus.CANCELLED,
        RoleCode.ADMIN,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('a cancelled order cannot be resurrected', () => {
      expectRefused(
        FoodOrderStatus.CANCELLED,
        FoodOrderStatus.ACCEPTED,
        RoleCode.RESTAURANT,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });

    it('a rejected order is final', () => {
      expectRefused(
        FoodOrderStatus.REJECTED,
        FoodOrderStatus.PREPARING,
        RoleCode.RESTAURANT,
        DomainErrorCode.ORDER_NOT_MODIFIABLE,
      );
    });
  });

  describe('operational realities the machine has to allow', () => {
    it('lets a kitchen that finishes with a courier waiting go straight to assigned', () => {
      expect(() =>
        assertFoodTransition(
          FoodOrderStatus.PREPARING,
          FoodOrderStatus.ASSIGNED,
          RoleCode.RESTAURANT,
        ),
      ).not.toThrow();
    });

    it('lets a courier who abandons a job return it to the pool', () => {
      expect(() =>
        assertFoodTransition(
          FoodOrderStatus.ASSIGNED,
          FoodOrderStatus.READY_FOR_PICKUP,
          RoleCode.DRIVER,
        ),
      ).not.toThrow();
    });

    it('lets a customer cancel before the kitchen accepts', () => {
      expect(() =>
        assertFoodTransition(FoodOrderStatus.PLACED, FoodOrderStatus.CANCELLED, RoleCode.USER),
      ).not.toThrow();
    });

    it('lets a restaurant reject an order it cannot fulfil', () => {
      expect(() =>
        assertFoodTransition(
          FoodOrderStatus.PLACED,
          FoodOrderStatus.REJECTED,
          RoleCode.RESTAURANT,
        ),
      ).not.toThrow();
    });

    it('offers couriers jobs from the moment the kitchen accepts', () => {
      expect(FOOD_ORDER_AWAITING_COURIER).toEqual(
        expect.arrayContaining([
          FoodOrderStatus.ACCEPTED,
          FoodOrderStatus.PREPARING,
          FoodOrderStatus.READY_FOR_PICKUP,
        ]),
      );
      expect(FOOD_ORDER_AWAITING_COURIER).not.toContain(FoodOrderStatus.PLACED);
    });
  });

  describe('terminal states', () => {
    it.each([FoodOrderStatus.DELIVERED, FoodOrderStatus.CANCELLED, FoodOrderStatus.REJECTED])(
      '%s is terminal',
      (status) => {
        expect(isTerminal(status)).toBe(true);
      },
    );

    it.each([FoodOrderStatus.PLACED, FoodOrderStatus.PREPARING, FoodOrderStatus.ASSIGNED])(
      '%s is not terminal',
      (status) => {
        expect(isTerminal(status)).toBe(false);
      },
    );
  });
});
