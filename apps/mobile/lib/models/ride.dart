import 'common.dart';

/// One vehicle class the backend priced for this journey.
///
/// `sharedFareFrom` and `sharedSaving` are the server's numbers. The app shows
/// them; it never derives a saving by subtracting one fare from another.
class VehicleEstimate {
  const VehicleEstimate({
    required this.vehicleTypeId,
    required this.code,
    required this.name,
    required this.seatCapacity,
    required this.maxPassengers,
    required this.sharedRideEligible,
    required this.distanceM,
    required this.durationS,
    required this.etaMinutes,
    required this.currency,
    required this.soloFare,
    this.sharedFareFrom,
    this.sharedSaving,
  });

  final String vehicleTypeId;
  final String code;
  final String name;
  final int seatCapacity;
  final int maxPassengers;
  final bool sharedRideEligible;
  final int distanceM;
  final int durationS;
  final int etaMinutes;
  final String currency;
  final String soloFare;
  final String? sharedFareFrom;
  final String? sharedSaving;

  factory VehicleEstimate.fromJson(Map<String, dynamic> json) => VehicleEstimate(
        vehicleTypeId: json['vehicleTypeId'] as String,
        code: (json['code'] ?? '') as String,
        name: (json['name'] ?? '') as String,
        seatCapacity: toInt(json['seatCapacity'], fallback: 1),
        maxPassengers: toInt(json['maxPassengers'], fallback: 1),
        sharedRideEligible: json['sharedRideEligible'] == true,
        distanceM: toInt(json['distanceM']),
        durationS: toInt(json['durationS']),
        etaMinutes: toInt(json['etaMinutes']),
        currency: (json['currency'] ?? 'LKR') as String,
        soloFare: asMoney(json['soloFare']),
        sharedFareFrom: asMoneyOrNull(json['sharedFareFrom']),
        sharedSaving: asMoneyOrNull(json['sharedSaving']),
      );
}

class DriverSummary {
  const DriverSummary({
    required this.firstName,
    this.avatarUrl,
    this.rating,
    this.trips,
    this.phone,
  });

  final String firstName;
  final String? avatarUrl;
  final String? rating;
  final int? trips;
  final String? phone;

  factory DriverSummary.fromJson(Map<String, dynamic> json) => DriverSummary(
        firstName: (json['firstName'] ?? '') as String,
        avatarUrl: json['avatarUrl'] as String?,
        rating: json['rating'] as String?,
        trips: toIntOrNull(json['trips']),
        phone: json['phone'] as String?,
      );
}

class VehicleSummary {
  const VehicleSummary({
    required this.make,
    required this.model,
    required this.colour,
    this.plateNumber,
  });

  final String make;
  final String model;
  final String colour;
  final String? plateNumber;

  String get description => '$colour $make $model';

  factory VehicleSummary.fromJson(Map<String, dynamic> json) => VehicleSummary(
        make: (json['make'] ?? '') as String,
        model: (json['model'] ?? '') as String,
        colour: (json['colour'] ?? '') as String,
        plateNumber: json['plateNumber'] as String?,
      );
}

class CreatedRide {
  const CreatedRide({
    required this.rideId,
    required this.reference,
    required this.status,
    required this.fare,
    this.route,
  });

  final String rideId;
  final String reference;
  final String status;
  final PublicFare fare;
  final RouteGeometry? route;

  factory CreatedRide.fromJson(Map<String, dynamic> json) => CreatedRide(
        rideId: json['rideId'] as String,
        reference: (json['reference'] ?? '') as String,
        status: asEnum(json['status'], 'SEARCHING'),
        fare: PublicFare.fromJson((json['fare'] ?? const {}) as Map<String, dynamic>),
        route: json['route'] is Map<String, dynamic>
            ? RouteGeometry.fromJson(json['route'] as Map<String, dynamic>)
            : null,
      );
}

class RideStop {
  const RideStop({
    required this.id,
    required this.sequence,
    required this.type,
    required this.address,
    required this.lat,
    required this.lng,
    this.status,
    this.estimatedArrivalAt,
  });

  final String id;
  final int sequence;
  final String type;
  final String address;
  final double lat;
  final double lng;
  final String? status;
  final DateTime? estimatedArrivalAt;

  bool get isPickup => type.toUpperCase().contains('PICK');

  factory RideStop.fromJson(Map<String, dynamic> json) => RideStop(
        id: json['id'] as String,
        sequence: toInt(json['sequence']),
        type: asEnum(json['type'], 'PICKUP'),
        address: (json['address'] ?? '') as String,
        lat: toDoubleValue(json['latitude'] ?? json['lat']),
        lng: toDoubleValue(json['longitude'] ?? json['lng']),
        status: json['status'] as String?,
        estimatedArrivalAt: toDate(json['estimatedArrivalAt']),
      );
}

/// This passenger's own leg of a ride. On a shared ride the other passengers'
/// legs are deliberately not part of this payload.
class RideLeg {
  const RideLeg({
    required this.id,
    required this.status,
    required this.seats,
    required this.isSharedJoin,
    required this.pickup,
    required this.dropoff,
    this.estimatedPickupAt,
    this.estimatedDropoffAt,
    this.fareTotal,
    this.currency,
    this.paymentMethod,
    this.paymentStatus,
  });

  final String id;
  final String status;
  final int seats;
  final bool isSharedJoin;
  final Place pickup;
  final Place dropoff;
  final DateTime? estimatedPickupAt;
  final DateTime? estimatedDropoffAt;
  final String? fareTotal;
  final String? currency;
  final String? paymentMethod;
  final String? paymentStatus;

  factory RideLeg.fromJson(Map<String, dynamic> json) {
    final fare = json['fare'];
    final payment = json['payment'];

    return RideLeg(
      id: json['id'] as String,
      status: asEnum(json['status'], 'CONFIRMED'),
      seats: toInt(json['seats'], fallback: 1),
      isSharedJoin: json['isSharedJoin'] == true,
      pickup: Place.fromJson((json['pickup'] ?? const {}) as Map<String, dynamic>),
      dropoff: Place.fromJson((json['dropoff'] ?? const {}) as Map<String, dynamic>),
      estimatedPickupAt: toDate(json['estimatedPickupAt']),
      estimatedDropoffAt: toDate(json['estimatedDropoffAt']),
      fareTotal: fare is Map ? asMoneyOrNull(fare['total']) : null,
      currency: fare is Map ? fare['currency'] as String? : null,
      paymentMethod: payment is Map ? payment['method'] as String? : null,
      paymentStatus: payment is Map ? payment['status'] as String? : null,
    );
  }
}

class RideDetail {
  const RideDetail({
    required this.id,
    required this.reference,
    required this.rideType,
    required this.status,
    required this.currency,
    required this.seatsTotal,
    required this.seatsOccupied,
    required this.coPassengerCount,
    required this.stops,
    this.vehicleTypeName,
    this.route,
    this.vehicle,
    this.driver,
    this.myLeg,
    this.scheduledPickupAt,
    this.startedAt,
    this.completedAt,
  });

  final String id;
  final String reference;
  final String rideType;
  final String status;
  final String currency;
  final int seatsTotal;
  final int seatsOccupied;
  final int coPassengerCount;
  final List<RideStop> stops;
  final String? vehicleTypeName;
  final RouteGeometry? route;
  final VehicleSummary? vehicle;
  final DriverSummary? driver;
  final RideLeg? myLeg;
  final DateTime? scheduledPickupAt;
  final DateTime? startedAt;
  final DateTime? completedAt;

  bool get isShared => rideType == 'SHARED';

  bool get isActive => const {
        'SEARCHING',
        'SCHEDULED',
        'ACCEPTED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS',
      }.contains(status);

  /// Whether the app should offer a cancel button. The backend re-checks and
  /// may still refuse — this only avoids showing an action that is obviously
  /// impossible.
  bool get canCancel => const {
        'SEARCHING',
        'SCHEDULED',
        'ACCEPTED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
      }.contains(status);

  factory RideDetail.fromJson(Map<String, dynamic> json) {
    final seats = json['seats'];
    final vehicleType = json['vehicleType'];

    return RideDetail(
      id: json['id'] as String,
      reference: (json['reference'] ?? '') as String,
      rideType: asEnum(json['rideType'], 'SOLO'),
      status: asEnum(json['status'], 'SEARCHING'),
      currency: (json['currency'] ?? 'LKR') as String,
      seatsTotal: seats is Map ? toInt(seats['total'], fallback: 1) : 1,
      seatsOccupied: seats is Map ? toInt(seats['occupied']) : 0,
      coPassengerCount: toInt(json['coPassengerCount']),
      stops: asList(json['myStops']).map(RideStop.fromJson).toList(growable: false),
      vehicleTypeName: vehicleType is Map ? vehicleType['name'] as String? : null,
      route: json['route'] is Map<String, dynamic>
          ? RouteGeometry.fromJson(json['route'] as Map<String, dynamic>)
          : null,
      vehicle: json['vehicle'] is Map<String, dynamic>
          ? VehicleSummary.fromJson(json['vehicle'] as Map<String, dynamic>)
          : null,
      driver: json['driver'] is Map<String, dynamic>
          ? DriverSummary.fromJson(json['driver'] as Map<String, dynamic>)
          : null,
      myLeg: json['myLeg'] is Map<String, dynamic>
          ? RideLeg.fromJson(json['myLeg'] as Map<String, dynamic>)
          : null,
      scheduledPickupAt: toDate(json['scheduledPickupAt']),
      startedAt: toDate(json['startedAt']),
      completedAt: toDate(json['completedAt']),
    );
  }
}

class RideHistoryItem {
  const RideHistoryItem({
    required this.id,
    required this.rideId,
    required this.status,
    required this.isSharedJoin,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.createdAt,
    this.total,
    this.currency,
    this.isSharedFare = false,
    this.vehicleTypeName,
    this.reference,
  });

  final String id;
  final String rideId;
  final String status;
  final bool isSharedJoin;
  final String pickupAddress;
  final String dropoffAddress;
  final DateTime? createdAt;
  final String? total;
  final String? currency;
  final bool isSharedFare;
  final String? vehicleTypeName;
  final String? reference;

  factory RideHistoryItem.fromJson(Map<String, dynamic> json) {
    final quote = json['fareQuote'];
    final ride = json['ride'];
    final vehicleType = ride is Map ? ride['vehicleType'] : null;

    return RideHistoryItem(
      id: json['id'] as String,
      rideId: ride is Map ? (ride['id'] ?? '') as String : '',
      status: asEnum(ride is Map ? ride['status'] : json['status'], 'COMPLETED'),
      isSharedJoin: json['isSharedJoin'] == true,
      pickupAddress: (json['pickupAddress'] ?? '') as String,
      dropoffAddress: (json['dropoffAddress'] ?? '') as String,
      createdAt: toDate(json['createdAt']),
      total: quote is Map ? asMoneyOrNull(quote['passengerTotal']) : null,
      currency: quote is Map ? quote['currency'] as String? : null,
      isSharedFare: quote is Map && quote['isShared'] == true,
      vehicleTypeName: vehicleType is Map ? vehicleType['name'] as String? : null,
      reference: ride is Map ? ride['reference'] as String? : null,
    );
  }
}
