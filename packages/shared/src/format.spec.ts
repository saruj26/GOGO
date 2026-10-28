import { describe, expect, it } from 'vitest';
import {
  FOOD_PROGRESS_STEPS,
  FOOD_STATUS_LABEL,
  PARCEL_PROGRESS_STEPS,
  PARCEL_STATUS_LABEL,
  RIDE_STATUS_LABEL,
  amount,
  distance,
  duration,
  money,
  statusTone,
} from './format';
import { boundsOf, decodePolyline } from './polyline';

describe('money', () => {
  /**
   * Money arrives as a fixed-point string and must be displayed as one. Parsing
   * it into a float here would eventually disagree with the receipt.
   */
  it('formats without going through a float', () => {
    expect(money('3202.45')).toBe('LKR 3,202.45');
    expect(money('0.05')).toBe('LKR 0.05');
    expect(money('1234567.89')).toBe('LKR 1,234,567.89');
  });

  it('preserves trailing precision exactly', () => {
    // 0.10 must not become 0.1, and 1.005 must not be re-rounded.
    expect(money('0.10')).toBe('LKR 0.10');
    expect(amount('1.005')).toBe('1.005');
  });

  it('handles a missing amount without inventing a zero', () => {
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
    expect(amount('')).toBe('—');
  });

  it('respects the currency the backend reported', () => {
    expect(money('100.00', 'USD')).toBe('USD 100.00');
  });
});

describe('distance and duration', () => {
  it('switches to kilometres above a kilometre', () => {
    expect(distance(850)).toBe('850 m');
    expect(distance(1500)).toBe('1.5 km');
    expect(distance(38723)).toBe('38.7 km');
  });

  it('switches to hours above an hour', () => {
    expect(duration(90)).toBe('2 min');
    expect(duration(3600)).toBe('1 h 0 min');
    expect(duration(3983)).toBe('1 h 6 min');
  });

  it('does not pretend to know a missing value', () => {
    expect(distance(null)).toBe('—');
    expect(duration(undefined)).toBe('—');
  });
});

describe('status labels', () => {
  /**
   * The brief asks for friendly labels without changing backend state. These
   * tests pin that every status the API can return has one, so a new state
   * cannot reach a customer as a raw enum.
   */
  it('names every food status', () => {
    const statuses = [
      'DRAFT', 'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'REJECTED', 'PREPARING',
      'READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED',
    ] as const;

    for (const status of statuses) {
      expect(FOOD_STATUS_LABEL[status]).toBeTruthy();
      expect(FOOD_STATUS_LABEL[status]).not.toBe(status);
    }
  });

  it('maps PLACED to something a waiting customer understands', () => {
    expect(FOOD_STATUS_LABEL.PLACED).toBe('Sent to restaurant');
    expect(FOOD_STATUS_LABEL.ACCEPTED).toBe('Confirmed');
  });

  it('names every parcel and ride status', () => {
    expect(PARCEL_STATUS_LABEL.SEARCHING_DRIVER).toBe('Finding a courier');
    expect(RIDE_STATUS_LABEL.DRIVER_ARRIVING).toBe('Driver on the way');
  });

  it('excludes terminal failures from the progress steps', () => {
    expect(FOOD_PROGRESS_STEPS).not.toContain('CANCELLED');
    expect(FOOD_PROGRESS_STEPS).not.toContain('REJECTED');
    expect(PARCEL_PROGRESS_STEPS).not.toContain('FAILED');
  });

  it('ends each progress sequence at delivery', () => {
    expect(FOOD_PROGRESS_STEPS.at(-1)).toBe('DELIVERED');
    expect(PARCEL_PROGRESS_STEPS.at(-1)).toBe('DELIVERED');
  });
});

describe('status tone', () => {
  it('colours outcomes consistently across services', () => {
    expect(statusTone('DELIVERED')).toBe('success');
    expect(statusTone('COMPLETED')).toBe('success');
    expect(statusTone('CANCELLED')).toBe('danger');
    expect(statusTone('REJECTED')).toBe('danger');
    expect(statusTone('FAILED')).toBe('danger');
    expect(statusTone('SEARCHING_DRIVER')).toBe('warning');
    expect(statusTone('IN_PROGRESS')).toBe('progress');
  });

  it('falls back to progress for an unrecognised status', () => {
    // A status added to the backend must still render, not crash.
    expect(statusTone('SOME_NEW_STATE')).toBe('progress');
  });
});

describe('polyline', () => {
  it('round-trips a known encoding', () => {
    // The canonical Google example.
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(points).toHaveLength(3);
    expect(points[0].lat).toBeCloseTo(38.5, 5);
    expect(points[0].lng).toBeCloseTo(-120.2, 5);
    expect(points[2].lat).toBeCloseTo(43.252, 5);
  });

  it('treats an empty polyline as no points rather than throwing', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(boundsOf([])).toBeNull();
  });

  it('computes bounds for fitting a map', () => {
    const bounds = boundsOf([
      { lat: 9.66, lng: 80.02 },
      { lat: 9.81, lng: 80.23 },
    ]);

    expect(bounds).toEqual([
      [80.02, 9.66],
      [80.23, 9.81],
    ]);
  });
});
