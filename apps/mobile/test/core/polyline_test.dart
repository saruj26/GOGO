import 'package:flutter_test/flutter_test.dart';
import 'package:rideflow_mobile/core/maps/polyline.dart';
import 'package:rideflow_mobile/models/common.dart';

void main() {
  group('decodePolyline', () {
    test('decodes the reference precision-5 example', () {
      // The canonical Google example: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453).
      final points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

      expect(points, hasLength(3));
      expect(points[0].lat, closeTo(38.5, 0.00001));
      expect(points[0].lng, closeTo(-120.2, 0.00001));
      expect(points[2].lat, closeTo(43.252, 0.00001));
      expect(points[2].lng, closeTo(-126.453, 0.00001));
    });

    test('returns nothing for an absent or empty polyline', () {
      expect(decodePolyline(null), isEmpty);
      expect(decodePolyline(''), isEmpty);
    });

    test('stops cleanly on a truncated polyline instead of throwing', () {
      // A clipped payload must not crash a tracking screen.
      expect(() => decodePolyline('_p~iF~ps|U_ulLnnq'), returnsNormally);
    });
  });

  group('GeoBounds', () {
    test('frames every point given', () {
      final bounds = GeoBounds.of(const [
        GeoPoint(lat: 6.9, lng: 79.8),
        GeoPoint(lat: 9.6, lng: 80.0),
        GeoPoint(lat: 7.2, lng: 81.1),
      ]);

      expect(bounds, isNotNull);
      expect(bounds!.minLat, 6.9);
      expect(bounds.maxLat, 9.6);
      expect(bounds.minLng, 79.8);
      expect(bounds.maxLng, 81.1);
      expect(bounds.centre.lat, closeTo(8.25, 0.001));
    });

    test('is null when there is nothing to frame', () {
      expect(GeoBounds.of(const []), isNull);
    });
  });
}
