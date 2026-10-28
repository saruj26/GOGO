import 'common.dart';

class ParcelType {
  const ParcelType({
    required this.id,
    required this.code,
    required this.name,
    required this.maxWeightKg,
    required this.requiresSignature,
    this.description,
    this.maxLengthCm,
    this.minVehicleTypeCode,
  });

  final String id;
  final String code;
  final String name;
  final String maxWeightKg;
  final bool requiresSignature;
  final String? description;
  final int? maxLengthCm;

  /// The smallest vehicle class this parcel may go in. The backend enforces it;
  /// the app shows it so the choice makes sense.
  final String? minVehicleTypeCode;

  factory ParcelType.fromJson(Map<String, dynamic> json) => ParcelType(
        id: json['id'] as String,
        code: (json['code'] ?? '') as String,
        name: (json['name'] ?? '') as String,
        maxWeightKg: asMoney(json['maxWeightKg']),
        requiresSignature: json['requiresSignature'] == true,
        description: json['description'] as String?,
        maxLengthCm: toIntOrNull(json['maxLengthCm']),
        minVehicleTypeCode: json['minVehicleTypeCode'] as String?,
      );
}

class ParcelQuote {
  const ParcelQuote({
    required this.vehicleTypeId,
    required this.vehicleTypeCode,
    required this.vehicleTypeName,
    required this.distanceM,
    required this.durationS,
    required this.etaMinutes,
    required this.currency,
    required this.total,
    required this.breakdown,
  });

  final String vehicleTypeId;
  final String vehicleTypeCode;
  final String vehicleTypeName;
  final int distanceM;
  final int durationS;
  final int etaMinutes;
  final String currency;
  final String total;
  final List<FareLine> breakdown;

  factory ParcelQuote.fromJson(Map<String, dynamic> json) => ParcelQuote(
        vehicleTypeId: json['vehicleTypeId'] as String,
        vehicleTypeCode: (json['vehicleTypeCode'] ?? '') as String,
        vehicleTypeName: (json['vehicleTypeName'] ?? '') as String,
        distanceM: toInt(json['distanceM']),
        durationS: toInt(json['durationS']),
        etaMinutes: toInt(json['etaMinutes']),
        currency: (json['currency'] ?? 'LKR') as String,
        total: asMoney(json['total']),
        breakdown: asList(json['breakdown']).map(FareLine.fromJson).toList(growable: false),
      );
}

class CreatedParcel {
  const CreatedParcel({
    required this.parcelId,
    required this.reference,
    required this.status,
    required this.charge,
    this.route,
  });

  final String parcelId;
  final String reference;
  final String status;
  final PublicFare charge;
  final RouteGeometry? route;

  factory CreatedParcel.fromJson(Map<String, dynamic> json) => CreatedParcel(
        parcelId: json['parcelId'] as String,
        reference: (json['reference'] ?? '') as String,
        status: asEnum(json['status'], 'PLACED'),
        charge: PublicFare.fromJson((json['charge'] ?? const {}) as Map<String, dynamic>),
        route: json['route'] is Map<String, dynamic>
            ? RouteGeometry.fromJson(json['route'] as Map<String, dynamic>)
            : null,
      );
}

class ParcelDetail {
  const ParcelDetail({
    required this.id,
    required this.reference,
    required this.status,
    required this.parcelTypeName,
    required this.vehicleTypeName,
    required this.pickupAddress,
    required this.pickupContactName,
    required this.pickupContactPhone,
    required this.dropoffAddress,
    required this.receiverName,
    required this.receiverPhone,
    required this.requiresSignature,
    this.weightKg,
    this.declaredValue,
    this.notes,
    this.total,
    this.currency,
    this.paymentMethod,
    this.paymentStatus,
    this.courier,
    this.route,
    this.cancellationReason,
  });

  final String id;
  final String reference;
  final String status;
  final String parcelTypeName;
  final String vehicleTypeName;
  final String pickupAddress;
  final String pickupContactName;
  final String pickupContactPhone;
  final String dropoffAddress;
  final String receiverName;
  final String receiverPhone;
  final bool requiresSignature;
  final String? weightKg;
  final String? declaredValue;
  final String? notes;
  final String? total;
  final String? currency;
  final String? paymentMethod;
  final String? paymentStatus;
  final ParcelCourier? courier;
  final RouteGeometry? route;
  final String? cancellationReason;

  bool get isActive => !const {'DELIVERED', 'CANCELLED', 'FAILED'}.contains(status);

  bool get canCancel =>
      const {'PLACED', 'PENDING_PAYMENT', 'SEARCHING_DRIVER', 'ASSIGNED'}.contains(status);

  factory ParcelDetail.fromJson(Map<String, dynamic> json) {
    final parcelType = json['parcelType'] is Map ? json['parcelType'] as Map : const {};
    final vehicleType = json['vehicleType'] is Map ? json['vehicleType'] as Map : const {};
    final pickup = json['pickup'] is Map ? json['pickup'] as Map : const {};
    final dropoff = json['dropoff'] is Map ? json['dropoff'] as Map : const {};
    final charge = json['charge'];
    final payment = json['payment'];

    return ParcelDetail(
      id: json['id'] as String,
      reference: (json['reference'] ?? '') as String,
      status: asEnum(json['status'], 'PLACED'),
      parcelTypeName: (parcelType['name'] ?? '') as String,
      vehicleTypeName: (vehicleType['name'] ?? '') as String,
      pickupAddress: (pickup['address'] ?? '') as String,
      pickupContactName: (pickup['contactName'] ?? '') as String,
      pickupContactPhone: (pickup['contactPhone'] ?? '') as String,
      dropoffAddress: (dropoff['address'] ?? '') as String,
      receiverName: (dropoff['receiverName'] ?? '') as String,
      receiverPhone: (dropoff['receiverPhone'] ?? '') as String,
      requiresSignature: parcelType['requiresSignature'] == true,
      weightKg: json['weightKg'] as String?,
      declaredValue: json['declaredValue'] as String?,
      notes: json['notes'] as String?,
      total: charge is Map ? asMoneyOrNull(charge['total']) : null,
      currency: charge is Map ? charge['currency'] as String? : null,
      paymentMethod: payment is Map ? payment['method'] as String? : null,
      paymentStatus: payment is Map ? payment['status'] as String? : null,
      courier: json['courier'] is Map<String, dynamic>
          ? ParcelCourier.fromJson(json['courier'] as Map<String, dynamic>)
          : null,
      route: json['route'] is Map<String, dynamic>
          ? RouteGeometry.fromJson(json['route'] as Map<String, dynamic>)
          : null,
      cancellationReason: json['cancellationReason'] as String?,
    );
  }
}

class ParcelCourier {
  const ParcelCourier({required this.firstName, this.avatarUrl, this.rating, this.phone});

  final String firstName;
  final String? avatarUrl;
  final String? rating;
  final String? phone;

  factory ParcelCourier.fromJson(Map<String, dynamic> json) => ParcelCourier(
        firstName: (json['firstName'] ?? '') as String,
        avatarUrl: json['avatarUrl'] as String?,
        rating: json['rating'] as String?,
        phone: json['phone'] as String?,
      );
}

/// One recorded step in a parcel's journey.
///
/// Coordinates are present only where the backend actually recorded them. The
/// app draws nothing when they are absent rather than interpolating a position.
class ParcelTrackingEntry {
  const ParcelTrackingEntry({
    required this.id,
    required this.status,
    this.note,
    this.createdAt,
    this.lat,
    this.lng,
  });

  final String id;
  final String status;
  final String? note;
  final DateTime? createdAt;
  final double? lat;
  final double? lng;

  bool get hasPosition => lat != null && lng != null;

  factory ParcelTrackingEntry.fromJson(Map<String, dynamic> json) {
    final lat = json['latitude'];
    final lng = json['longitude'];

    return ParcelTrackingEntry(
      id: json['id'] as String,
      status: asEnum(json['status'], 'PLACED'),
      note: json['note'] as String?,
      createdAt: toDate(json['createdAt']),
      lat: lat == null ? null : toDoubleValue(lat),
      lng: lng == null ? null : toDoubleValue(lng),
    );
  }
}

class ParcelHistoryItem {
  const ParcelHistoryItem({
    required this.id,
    required this.reference,
    required this.status,
    required this.parcelType,
    required this.from,
    required this.to,
    this.total,
    this.currency,
    this.bookedAt,
    this.deliveredAt,
  });

  final String id;
  final String reference;
  final String status;
  final String parcelType;
  final String from;
  final String to;
  final String? total;
  final String? currency;
  final DateTime? bookedAt;
  final DateTime? deliveredAt;

  factory ParcelHistoryItem.fromJson(Map<String, dynamic> json) => ParcelHistoryItem(
        id: json['id'] as String,
        reference: (json['reference'] ?? '') as String,
        status: asEnum(json['status'], 'PLACED'),
        parcelType: (json['parcelType'] ?? '') as String,
        from: (json['from'] ?? '') as String,
        to: (json['to'] ?? '') as String,
        total: asMoneyOrNull(json['total']),
        currency: json['currency'] as String?,
        bookedAt: toDate(json['bookedAt']),
        deliveredAt: toDate(json['deliveredAt']),
      );
}
