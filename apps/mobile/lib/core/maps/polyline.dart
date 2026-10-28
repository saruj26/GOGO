import '../../models/common.dart';

/// Decodes an encoded polyline.
///
/// The API stores every route at precision 5 whichever provider produced it, so
/// one decoder covers the whole application. This mirrors the web client's
/// decoder exactly, because both draw the same stored geometry.
List<GeoPoint> decodePolyline(String? encoded, {int precision = 5}) {
  if (encoded == null || encoded.isEmpty) return const [];

  final factor = _pow10(precision);
  final points = <GeoPoint>[];

  var index = 0;
  var lat = 0;
  var lng = 0;

  while (index < encoded.length) {
    var result = 0;
    var shift = 0;
    int byte;

    do {
      if (index >= encoded.length) return points;
      byte = encoded.codeUnitAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) != 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) return points;
      byte = encoded.codeUnitAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) != 0 ? ~(result >> 1) : result >> 1;

    points.add(GeoPoint(lat: lat / factor, lng: lng / factor));
  }

  return points;
}

double _pow10(int exponent) {
  var value = 1.0;
  for (var i = 0; i < exponent; i++) {
    value *= 10;
  }
  return value;
}

/// Bounding box of a set of points, for fitting a map to a route.
class GeoBounds {
  const GeoBounds({
    required this.minLat,
    required this.minLng,
    required this.maxLat,
    required this.maxLng,
  });

  final double minLat;
  final double minLng;
  final double maxLat;
  final double maxLng;

  static GeoBounds? of(Iterable<GeoPoint> points) {
    if (points.isEmpty) return null;

    var minLat = points.first.lat;
    var maxLat = points.first.lat;
    var minLng = points.first.lng;
    var maxLng = points.first.lng;

    for (final point in points) {
      if (point.lat < minLat) minLat = point.lat;
      if (point.lat > maxLat) maxLat = point.lat;
      if (point.lng < minLng) minLng = point.lng;
      if (point.lng > maxLng) maxLng = point.lng;
    }

    return GeoBounds(minLat: minLat, minLng: minLng, maxLat: maxLat, maxLng: maxLng);
  }

  GeoPoint get centre => GeoPoint(lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2);
}
