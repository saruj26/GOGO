/// Shapes the API returns.
///
/// Money is carried as the exact decimal string the backend produced and is
/// never parsed into a double. A fare that renders as `1,234.50` must be the
/// same value the server charged, and binary floating point cannot promise
/// that. Only the presentation layer formats it.
library;

/// A coordinate. Named to avoid colliding with `latlong2`'s `LatLng`, which is
/// a map-rendering concern rather than a contract type.
class GeoPoint {
  const GeoPoint({required this.lat, required this.lng});

  final double lat;
  final double lng;

  factory GeoPoint.fromJson(Map<String, dynamic> json) => GeoPoint(
        lat: _toDouble(json['lat'] ?? json['latitude']),
        lng: _toDouble(json['lng'] ?? json['longitude']),
      );

  Map<String, dynamic> toJson() => {'lat': lat, 'lng': lng};
}

class Place {
  const Place({required this.address, required this.lat, required this.lng});

  final String address;
  final double lat;
  final double lng;

  GeoPoint get point => GeoPoint(lat: lat, lng: lng);

  factory Place.fromJson(Map<String, dynamic> json) => Place(
        address: (json['address'] ?? '') as String,
        lat: _toDouble(json['lat'] ?? json['latitude']),
        lng: _toDouble(json['lng'] ?? json['longitude']),
      );

  Map<String, dynamic> toJson() => {'address': address, 'lat': lat, 'lng': lng};

  @override
  bool operator ==(Object other) =>
      other is Place && other.address == address && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(address, lat, lng);
}

class SavedPlace {
  const SavedPlace({
    required this.id,
    required this.label,
    required this.address,
    required this.lat,
    required this.lng,
  });

  final String id;
  final String label;
  final String address;
  final double lat;
  final double lng;

  Place get place => Place(address: address, lat: lat, lng: lng);

  factory SavedPlace.fromJson(Map<String, dynamic> json) => SavedPlace(
        id: json['id'] as String,
        label: (json['label'] ?? '') as String,
        address: (json['address'] ?? '') as String,
        lat: _toDouble(json['lat'] ?? json['latitude']),
        lng: _toDouble(json['lng'] ?? json['longitude']),
      );
}

/// Cursor pagination, used by every customer-facing feed.
class CursorPage<T> {
  const CursorPage({required this.items, this.nextCursor, this.hasMore = false});

  final List<T> items;
  final String? nextCursor;
  final bool hasMore;

  static CursorPage<T> fromJson<T>(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) item,
  ) {
    final raw = json['items'];
    return CursorPage<T>(
      items: raw is List
          ? raw.whereType<Map<String, dynamic>>().map(item).toList(growable: false)
          : const [],
      nextCursor: json['nextCursor'] as String?,
      hasMore: json['hasMore'] == true,
    );
  }

  CursorPage<T> append(CursorPage<T> next) => CursorPage<T>(
        items: [...items, ...next.items],
        nextCursor: next.nextCursor,
        hasMore: next.hasMore,
      );
}

class FareLine {
  const FareLine({required this.code, required this.label, required this.amount});

  final String code;
  final String label;
  final String amount;

  factory FareLine.fromJson(Map<String, dynamic> json) => FareLine(
        code: (json['code'] ?? '') as String,
        label: (json['label'] ?? '') as String,
        amount: asMoney(json['amount']),
      );
}

/// The fare the passenger sees. Every field stays a string.
class PublicFare {
  const PublicFare({
    required this.currency,
    required this.subtotal,
    required this.discount,
    required this.serviceFee,
    required this.tax,
    required this.total,
    required this.breakdown,
  });

  final String currency;
  final String subtotal;
  final String discount;
  final String serviceFee;
  final String tax;
  final String total;
  final List<FareLine> breakdown;

  factory PublicFare.fromJson(Map<String, dynamic> json) => PublicFare(
        currency: (json['currency'] ?? 'LKR') as String,
        subtotal: asMoney(json['subtotal']),
        discount: asMoney(json['discount']),
        serviceFee: asMoney(json['serviceFee']),
        tax: asMoney(json['tax']),
        total: asMoney(json['total']),
        breakdown: asList(json['breakdown']).map(FareLine.fromJson).toList(growable: false),
      );
}

class RouteGeometry {
  const RouteGeometry({this.polyline, this.distanceM, this.durationS, this.version});

  final String? polyline;
  final int? distanceM;
  final int? durationS;
  final int? version;

  factory RouteGeometry.fromJson(Map<String, dynamic> json) => RouteGeometry(
        polyline: (json['polyline'] ?? json['encodedPolyline']) as String?,
        distanceM: _toIntOrNull(json['distanceM']),
        durationS: _toIntOrNull(json['durationS']),
        version: _toIntOrNull(json['version']),
      );
}

// ------------------------------------------------------------------ parsing

/// Everything monetary arrives as a string; a number would mean the backend
/// changed shape, so it is stringified rather than silently coerced to double.
String asMoney(dynamic value) {
  if (value == null) return '0.00';
  if (value is String) return value;
  return '$value';
}

String? asMoneyOrNull(dynamic value) => value == null ? null : asMoney(value);

double _toDouble(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}

double toDoubleValue(dynamic value) => _toDouble(value);

int? _toIntOrNull(dynamic value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

int? toIntOrNull(dynamic value) => _toIntOrNull(value);

int toInt(dynamic value, {int fallback = 0}) => _toIntOrNull(value) ?? fallback;

DateTime? toDate(dynamic value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value)?.toLocal();
  return null;
}

List<Map<String, dynamic>> asList(dynamic value) {
  if (value is List) return value.whereType<Map<String, dynamic>>().toList(growable: false);
  return const [];
}

/// The API always sends enums as SCREAMING_SNAKE strings. An unknown value is
/// kept verbatim rather than mapped to a default, so a backend that grows a new
/// status shows something truthful instead of the wrong one.
String asEnum(dynamic value, String fallback) =>
    value is String && value.isNotEmpty ? value : fallback;
