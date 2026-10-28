import { StopType } from '@prisma/client';
import {
  CHAVAKACHCHERI,
  JAFFNA,
  KOPAY,
  NELLIYADY,
  POINT_PEDRO,
} from '../../test/support/geo-fixtures';
import { LatLng } from '../common/utils/geo';
import { PlannedStop, peakOccupancy, sequenceStops, stopPlanIsValid } from './stop-sequencer';

/**
 * §10 of the specification: with passengers
 *   A Jaffna → Point Pedro, B Kopay → Nelliyady, C Chavakachcheri → Point Pedro
 * the plan must be
 *   pickup A, pickup B, pickup C, drop-off B, drop-off A/C
 * and must NOT simply follow booking order.
 */
describe('stop sequencing', () => {
  const stop = (
    key: string,
    passenger: string,
    type: StopType,
    location: LatLng,
    routeFraction: number,
  ): PlannedStop => ({
    key,
    ridePassengerId: passenger,
    type,
    address: key,
    location,
    routeFraction,
  });

  const pickupA = stop('A-pick', 'A', StopType.PICKUP, JAFFNA, 0.0);
  const dropA = stop('A-drop', 'A', StopType.DROPOFF, POINT_PEDRO, 1.0);
  const pickupB = stop('B-pick', 'B', StopType.PICKUP, KOPAY, 0.2);
  const dropB = stop('B-drop', 'B', StopType.DROPOFF, NELLIYADY, 0.78);
  const pickupC = stop('C-pick', 'C', StopType.PICKUP, CHAVAKACHCHERI, 0.45);
  const dropC = stop('C-drop', 'C', StopType.DROPOFF, POINT_PEDRO, 1.0);

  it('orders stops by position along the route, not by booking order', () => {
    // Deliberately shuffled: C booked first, then A, then B.
    const booked = [pickupC, dropC, pickupA, dropA, pickupB, dropB];
    const plan = sequenceStops(booked);

    expect(plan.map((s) => s.key)).toEqual([
      'A-pick',
      'B-pick',
      'C-pick',
      'B-drop',
      'A-drop',
      'C-drop',
    ]);
  });

  it('produces a plan every passenger is collected before being dropped off', () => {
    const plan = sequenceStops([dropB, pickupC, dropA, pickupA, dropC, pickupB]);
    expect(stopPlanIsValid(plan)).toBe(true);
  });

  it('repairs a drop-off that would otherwise precede its own pickup', () => {
    // A projection artefact places the drop-off earlier along the route than
    // the pickup; the repair pass must still yield a servable plan.
    const brokenDrop = { ...dropB, routeFraction: 0.05 };
    const plan = sequenceStops([pickupA, pickupB, brokenDrop, dropA]);

    expect(stopPlanIsValid(plan)).toBe(true);
    const keys = plan.map((s) => s.key);
    expect(keys.indexOf('B-pick')).toBeLessThan(keys.indexOf('B-drop'));
  });

  it('detects an invalid plan', () => {
    expect(stopPlanIsValid([dropB, pickupB])).toBe(false);
  });

  it('measures peak occupancy across the plan', () => {
    const plan = sequenceStops([pickupA, dropA, pickupB, dropB, pickupC, dropC]);
    const seats = new Map([
      ['A', 1],
      ['B', 1],
      ['C', 2],
    ]);

    // All three are aboard between C's pickup and B's drop-off: 1 + 1 + 2.
    expect(peakOccupancy(plan, seats)).toBe(4);
  });

  it('frees a seat before claiming one at an identical point', () => {
    const arrive = stop('X-drop', 'X', StopType.DROPOFF, KOPAY, 0.5);
    const board = stop('Y-pick', 'Y', StopType.PICKUP, KOPAY, 0.5);
    const boardX = stop('X-pick', 'X', StopType.PICKUP, JAFFNA, 0.0);

    const plan = sequenceStops([boardX, board, arrive]);
    const keys = plan.map((s) => s.key);

    expect(keys.indexOf('X-drop')).toBeLessThan(keys.indexOf('Y-pick'));
  });

  it('handles a single passenger', () => {
    const plan = sequenceStops([dropA, pickupA]);
    expect(plan.map((s) => s.key)).toEqual(['A-pick', 'A-drop']);
  });

  it('handles an empty plan', () => {
    expect(sequenceStops([])).toEqual([]);
  });
});
