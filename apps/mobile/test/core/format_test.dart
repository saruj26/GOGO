import 'package:flutter_test/flutter_test.dart';
import 'package:rideflow_mobile/core/format/format.dart' as fmt;
import 'package:rideflow_mobile/core/format/labels.dart';

void main() {
  group('money', () {
    test('groups thousands without ever parsing the value', () {
      expect(fmt.money('1234.50'), 'LKR 1,234.50');
      expect(fmt.money('999.99'), 'LKR 999.99');
      expect(fmt.money('1000000.00'), 'LKR 1,000,000.00');
      expect(fmt.money('0.00'), 'LKR 0.00');
    });

    test('preserves the exact fraction the backend sent', () {
      // The point of keeping money as a string: these must survive verbatim,
      // which a double round-trip would not guarantee.
      expect(fmt.money('0.10'), 'LKR 0.10');
      expect(fmt.money('1234567.89'), 'LKR 1,234,567.89');
      expect(fmt.amount('12345678901234.56'), '12,345,678,901,234.56');
    });

    test('handles a negative amount', () {
      expect(fmt.amount('-1500.00'), '-1,500.00');
    });

    test('renders an em dash for a missing amount rather than zero', () {
      expect(fmt.money(null), '—');
      expect(fmt.money(''), '—');
      expect(fmt.amount(null), '—');
    });

    test('honours a non-default currency', () {
      expect(fmt.money('50.00', currency: 'USD'), 'USD 50.00');
    });
  });

  group('distance and duration', () {
    test('switches from metres to kilometres at 1 km', () {
      expect(fmt.distance(950), '950 m');
      expect(fmt.distance(1000), '1.0 km');
      expect(fmt.distance(12345), '12.3 km');
    });

    test('formats durations in minutes then hours', () {
      expect(fmt.duration(90), '2 min');
      expect(fmt.duration(3540), '59 min');
      expect(fmt.duration(3600), '1 h');
      expect(fmt.duration(5400), '1 h 30 min');
    });

    test('renders an em dash when the value is unknown', () {
      expect(fmt.distance(null), '—');
      expect(fmt.duration(null), '—');
    });
  });

  group('phone', () {
    test('spaces a full international number without changing it', () {
      expect(fmt.phone('+94771234567'), '+94 77 123 4567');
    });

    test('leaves an unrecognised format untouched rather than mangling it', () {
      expect(fmt.phone('0771234567'), '0771234567');
      expect(fmt.phone(null), '—');
    });
  });

  group('relativeTime', () {
    test('describes recent moments in words', () {
      final now = DateTime.now();
      expect(fmt.relativeTime(now.subtract(const Duration(seconds: 20))), 'just now');
      expect(fmt.relativeTime(now.subtract(const Duration(minutes: 5))), '5 min ago');
      expect(fmt.relativeTime(now.subtract(const Duration(hours: 3))), '3 h ago');
      expect(fmt.relativeTime(now.subtract(const Duration(days: 2))), '2 d ago');
    });

    test('falls back to an absolute date for anything older than a week', () {
      final old = DateTime.now().subtract(const Duration(days: 40));
      expect(fmt.relativeTime(old), isNot(contains('ago')));
    });
  });

  group('status labels', () {
    test('translate backend states into what a person reads', () {
      expect(labelFor(foodStatusLabel, 'PLACED'), 'Sent to restaurant');
      expect(labelFor(foodStatusLabel, 'READY_FOR_PICKUP'), 'Ready for collection');
      expect(labelFor(rideStatusLabel, 'DRIVER_ARRIVING'), 'Driver on the way');
      expect(labelFor(parcelStatusLabel, 'SEARCHING_DRIVER'), 'Finding a courier');
    });

    test('humanise an unknown status rather than mislabelling it', () {
      // A status the backend grows later must not be shown as the wrong thing.
      expect(labelFor(rideStatusLabel, 'AWAITING_ESCORT'), 'Awaiting escort');
      expect(labelFor(foodStatusLabel, ''), '—');
    });

    test('map lifecycle states onto tones', () {
      expect(toneFor('COMPLETED'), StatusTone.success);
      expect(toneFor('DELIVERED'), StatusTone.success);
      expect(toneFor('CANCELLED'), StatusTone.danger);
      expect(toneFor('FAILED'), StatusTone.danger);
      expect(toneFor('SEARCHING'), StatusTone.warning);
      expect(toneFor('DRAFT'), StatusTone.neutral);
      expect(toneFor('IN_PROGRESS'), StatusTone.progress);
    });
  });
}
