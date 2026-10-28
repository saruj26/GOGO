import 'common.dart';

/// Whether the driver is taking work, and what kind.
///
/// `acceptsShared` is the driver's standing consent to having passengers added
/// to a journey they are already making. The backend treats it as the consent
/// gate at match time, which is why the driver app exposes it as a setting
/// rather than as a per-passenger prompt.
class DriverAvailability {
  const DriverAvailability({
    required this.presence,
    this.activeVehicleId,
    this.acceptsShared = false,
    this.acceptsFood = false,
    this.acceptsParcel = false,
  });

  final String presence;
  final String? activeVehicleId;
  final bool acceptsShared;
  final bool acceptsFood;
  final bool acceptsParcel;

  bool get isOnline => presence == 'ONLINE' || presence == 'ON_TRIP';
  bool get isOnTrip => presence == 'ON_TRIP';

  factory DriverAvailability.fromJson(Map<String, dynamic> json) => DriverAvailability(
        presence: asEnum(json['presence'], 'OFFLINE'),
        activeVehicleId: json['activeVehicleId'] as String?,
        acceptsShared: json['acceptsShared'] == true,
        acceptsFood: json['acceptsFood'] == true,
        acceptsParcel: json['acceptsParcel'] == true,
      );
}

/// An open ride request a driver could accept.
class RideRequestOffer {
  const RideRequestOffer({
    required this.rideId,
    required this.reference,
    required this.rideType,
    required this.currency,
    required this.driverNet,
    required this.passengerCount,
    required this.seatsTotal,
    required this.seatsOccupied,
    this.pickup,
    this.dropoff,
    this.distanceM,
    this.durationS,
    this.vehicleTypeName,
    this.requestedAt,
    this.scheduledPickupAt,
  });

  final String rideId;
  final String reference;
  final String rideType;
  final String currency;

  /// What the driver keeps after commission, as the backend computed it.
  final String driverNet;

  final int passengerCount;
  final int seatsTotal;
  final int seatsOccupied;
  final Place? pickup;
  final Place? dropoff;
  final int? distanceM;
  final int? durationS;
  final String? vehicleTypeName;
  final DateTime? requestedAt;
  final DateTime? scheduledPickupAt;

  bool get isShared => rideType == 'SHARED';

  factory RideRequestOffer.fromJson(Map<String, dynamic> json) {
    final seats = json['seats'];
    final vehicleType = json['vehicleType'];

    return RideRequestOffer(
      rideId: json['rideId'] as String,
      reference: (json['reference'] ?? '') as String,
      rideType: asEnum(json['rideType'], 'SOLO'),
      currency: (json['currency'] ?? 'LKR') as String,
      driverNet: asMoney(json['driverNet']),
      passengerCount: toInt(json['passengerCount']),
      seatsTotal: seats is Map ? toInt(seats['total'], fallback: 1) : 1,
      seatsOccupied: seats is Map ? toInt(seats['occupied']) : 0,
      pickup: json['pickup'] is Map<String, dynamic>
          ? Place.fromJson(json['pickup'] as Map<String, dynamic>)
          : null,
      dropoff: json['dropoff'] is Map<String, dynamic>
          ? Place.fromJson(json['dropoff'] as Map<String, dynamic>)
          : null,
      distanceM: toIntOrNull(json['distanceM']),
      durationS: toIntOrNull(json['durationS']),
      vehicleTypeName: vehicleType is Map ? vehicleType['name'] as String? : null,
      requestedAt: toDate(json['requestedAt']),
      scheduledPickupAt: toDate(json['scheduledPickupAt']),
    );
  }
}

/// The ride a driver is currently working, with the remaining stop sequence.
class DriverActiveRide {
  const DriverActiveRide({
    required this.id,
    required this.reference,
    required this.rideType,
    required this.status,
    required this.joinable,
    required this.seatsTotal,
    required this.seatsOccupied,
    required this.stops,
    this.distanceM,
    this.durationS,
    this.polyline,
  });

  final String id;
  final String reference;
  final String rideType;
  final String status;

  /// Whether the matching engine may still add passengers to this journey.
  final bool joinable;

  final int seatsTotal;
  final int seatsOccupied;

  /// Pending stops in the order the backend resequenced them. When a shared
  /// passenger joins, this list is how the driver learns the new order.
  final List<DriverStop> stops;

  final int? distanceM;
  final int? durationS;
  final String? polyline;

  bool get isShared => rideType == 'SHARED';
  int get seatsFree => (seatsTotal - seatsOccupied).clamp(0, seatsTotal);

  factory DriverActiveRide.fromJson(Map<String, dynamic> json) {
    final route = json['activeRoute'];

    return DriverActiveRide(
      id: json['id'] as String,
      reference: (json['reference'] ?? '') as String,
      rideType: asEnum(json['rideType'], 'SOLO'),
      status: asEnum(json['status'], 'ACCEPTED'),
      joinable: json['joinable'] == true,
      seatsTotal: toInt(json['seatsTotal'], fallback: 1),
      seatsOccupied: toInt(json['seatsOccupied']),
      stops: asList(json['stops']).map(DriverStop.fromJson).toList(growable: false),
      distanceM: toIntOrNull(route is Map ? route['distanceM'] : json['plannedDistanceM']),
      durationS: toIntOrNull(route is Map ? route['durationS'] : json['plannedDurationS']),
      polyline: route is Map ? route['encodedPolyline'] as String? : null,
    );
  }
}

class DriverStop {
  const DriverStop({
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

  /// Absent on `/rides/driver/active`, which already filters to pending stops.
  final String? status;

  final DateTime? estimatedArrivalAt;

  bool get isPickup => type.toUpperCase().contains('PICK');

  factory DriverStop.fromJson(Map<String, dynamic> json) => DriverStop(
        id: json['id'] as String,
        sequence: toInt(json['sequence']),
        type: asEnum(json['type'], 'PICKUP'),
        address: (json['address'] ?? '') as String,
        lat: toDoubleValue(json['latitude']),
        lng: toDoubleValue(json['longitude']),
        status: json['status'] as String?,
        estimatedArrivalAt: toDate(json['estimatedArrivalAt']),
      );
}

class EarningsSummary {
  const EarningsSummary({
    required this.currency,
    required this.gross,
    required this.commission,
    required this.net,
    required this.bonus,
    required this.trips,
    required this.sharedNet,
    required this.sharedCount,
    this.byStatus = const [],
  });

  final String currency;
  final String gross;
  final String commission;
  final String net;
  final String bonus;
  final int trips;

  /// What shared passengers added, kept separate because it is the platform's
  /// central claim to drivers and should never be inferred from the total.
  final String sharedNet;
  final int sharedCount;

  final List<EarningsBucket> byStatus;

  factory EarningsSummary.fromJson(Map<String, dynamic> json) {
    final shared = json['fromSharedPassengers'];

    return EarningsSummary(
      // The endpoint aggregates a driver's own earnings, which are all in the
      // platform currency; it does not repeat it per row.
      currency: (json['currency'] ?? 'LKR') as String,
      gross: asMoney(json['gross']),
      commission: asMoney(json['commission']),
      net: asMoney(json['net']),
      bonus: asMoney(json['bonus']),
      trips: toInt(json['trips']),
      sharedNet: shared is Map ? asMoney(shared['net']) : '0.00',
      sharedCount: shared is Map ? toInt(shared['count']) : 0,
      byStatus: asList(json['byStatus']).map(EarningsBucket.fromJson).toList(growable: false),
    );
  }
}

class EarningsBucket {
  const EarningsBucket({required this.status, required this.net, required this.count});

  final String status;
  final String net;
  final int count;

  factory EarningsBucket.fromJson(Map<String, dynamic> json) => EarningsBucket(
        status: asEnum(json['status'], 'PENDING'),
        net: asMoney(json['net']),
        count: toInt(json['count']),
      );
}

class EarningRecord {
  const EarningRecord({
    required this.id,
    required this.status,
    required this.gross,
    required this.commission,
    required this.net,
    required this.currency,
    required this.isSharedIncrement,
    this.serviceType,
    this.createdAt,
  });

  final String id;
  final String status;
  final String gross;
  final String commission;
  final String net;
  final String currency;
  final bool isSharedIncrement;
  final String? serviceType;
  final DateTime? createdAt;

  factory EarningRecord.fromJson(Map<String, dynamic> json) => EarningRecord(
        id: json['id'] as String,
        status: asEnum(json['status'], 'PENDING'),
        gross: asMoney(json['grossAmount']),
        commission: asMoney(json['commissionAmount']),
        net: asMoney(json['netAmount']),
        currency: (json['currency'] ?? 'LKR') as String,
        isSharedIncrement: json['isSharedIncrement'] == true,
        serviceType: json['serviceType'] as String?,
        createdAt: toDate(json['createdAt']),
      );
}


/// The driver's own working profile.
class DriverProfile {
  const DriverProfile({
    required this.driverId,
    required this.approvalStatus,
    required this.availability,
    required this.vehicles,
    required this.documents,
    required this.completedTrips,
    this.ratingAverage,
    this.ratingCount = 0,
    this.sharedRideOptIn = false,
  });

  final String driverId;
  final String approvalStatus;
  final DriverAvailability availability;
  final List<DriverVehicle> vehicles;
  final List<DriverDocument> documents;
  final int completedTrips;
  final String? ratingAverage;
  final int ratingCount;
  final bool sharedRideOptIn;

  bool get isApproved => approvalStatus == 'APPROVED';

  DriverVehicle? get activeVehicle {
    final id = availability.activeVehicleId;
    if (id == null) return null;

    for (final vehicle in vehicles) {
      if (vehicle.id == id) return vehicle;
    }
    return null;
  }

  factory DriverProfile.fromJson(Map<String, dynamic> json) {
    final rating = json['rating'];

    return DriverProfile(
      driverId: json['driverId'] as String,
      approvalStatus: asEnum(json['approvalStatus'], 'PENDING'),
      availability: DriverAvailability.fromJson(
        (json['availability'] ?? const {}) as Map<String, dynamic>,
      ),
      vehicles: asList(json['vehicles']).map(DriverVehicle.fromJson).toList(growable: false),
      documents: asList(json['documents']).map(DriverDocument.fromJson).toList(growable: false),
      completedTrips: toInt(json['completedTrips']),
      ratingAverage: rating is Map ? rating['average'] as String? : null,
      ratingCount: rating is Map ? toInt(rating['count']) : 0,
      sharedRideOptIn: json['sharedRideOptIn'] == true,
    );
  }
}

class DriverVehicle {
  const DriverVehicle({
    required this.id,
    required this.plateNumber,
    required this.make,
    required this.model,
    required this.colour,
    required this.seatCapacity,
    required this.status,
    required this.isPrimary,
    this.year,
    this.vehicleTypeName,
  });

  final String id;
  final String plateNumber;
  final String make;
  final String model;
  final String colour;
  final int seatCapacity;
  final String status;
  final bool isPrimary;
  final int? year;
  final String? vehicleTypeName;

  String get description => '$colour $make $model';

  /// Only a verified vehicle may be driven; the backend refuses to go online
  /// on anything else.
  bool get isUsable => status == 'ACTIVE' || status == 'VERIFIED';

  factory DriverVehicle.fromJson(Map<String, dynamic> json) {
    final vehicleType = json['vehicleType'];

    return DriverVehicle(
      id: json['id'] as String,
      plateNumber: (json['plateNumber'] ?? '') as String,
      make: (json['make'] ?? '') as String,
      model: (json['model'] ?? '') as String,
      colour: (json['colour'] ?? '') as String,
      seatCapacity: toInt(json['seatCapacity'], fallback: 1),
      status: asEnum(json['status'], 'PENDING'),
      isPrimary: json['isPrimary'] == true,
      year: toIntOrNull(json['year']),
      vehicleTypeName: vehicleType is Map ? vehicleType['name'] as String? : null,
    );
  }
}

/// A compliance document's status. The file itself is never exposed here — the
/// API returns only what state it is in.
class DriverDocument {
  const DriverDocument({
    required this.type,
    required this.status,
    this.expiresAt,
    this.reviewNotes,
  });

  final String type;
  final String status;
  final DateTime? expiresAt;
  final String? reviewNotes;

  bool get isExpired => expiresAt != null && expiresAt!.isBefore(DateTime.now());

  factory DriverDocument.fromJson(Map<String, dynamic> json) => DriverDocument(
        type: asEnum(json['type'], 'OTHER'),
        status: asEnum(json['status'], 'PENDING'),
        expiresAt: toDate(json['expiresAt']),
        reviewNotes: json['reviewNotes'] as String?,
      );
}

/// A ride as its assigned driver sees it.
///
/// The passenger list carries what a driver needs to find and carry people —
/// name, phone, their two ends of the journey — and nothing else. Gender and
/// safety preferences are deliberately absent from this projection.
class DriverRideDetail {
  const DriverRideDetail({
    required this.id,
    required this.reference,
    required this.rideType,
    required this.status,
    required this.currency,
    required this.seatsTotal,
    required this.seatsOccupied,
    required this.passengers,
    required this.stops,
    this.vehicleTypeName,
    this.distanceM,
    this.durationS,
    this.polyline,
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
  final List<RidePassengerLeg> passengers;

  /// Every stop, in the order the backend sequenced them. When a shared
  /// passenger is added this list comes back reordered — that reordering is the
  /// backend's, and it is what the driver is told to follow.
  final List<DriverStop> stops;

  final String? vehicleTypeName;
  final int? distanceM;
  final int? durationS;
  final String? polyline;
  final DateTime? scheduledPickupAt;
  final DateTime? startedAt;
  final DateTime? completedAt;

  bool get isShared => rideType == 'SHARED';

  List<DriverStop> get pendingStops =>
      stops.where((stop) => stop.status != 'DONE' && stop.status != 'SKIPPED').toList(
            growable: false,
          );

  /// Whether every passenger who should be aboard has been collected. Used only
  /// to decide which action to offer; the backend still validates the
  /// transition.
  bool get allPassengersOnboard =>
      passengers.isNotEmpty &&
      passengers.every(
        (leg) => leg.status == 'ONBOARD' || leg.status == 'DROPPED_OFF' || leg.status == 'CANCELLED',
      );

  factory DriverRideDetail.fromJson(Map<String, dynamic> json) {
    final seats = json['seats'];
    final vehicleType = json['vehicleType'];
    final route = json['route'];

    return DriverRideDetail(
      id: json['id'] as String,
      reference: (json['reference'] ?? '') as String,
      rideType: asEnum(json['rideType'], 'SOLO'),
      status: asEnum(json['status'], 'ACCEPTED'),
      currency: (json['currency'] ?? 'LKR') as String,
      seatsTotal: seats is Map ? toInt(seats['total'], fallback: 1) : 1,
      seatsOccupied: seats is Map ? toInt(seats['occupied']) : 0,
      passengers:
          asList(json['passengers']).map(RidePassengerLeg.fromJson).toList(growable: false),
      stops: asList(json['stops']).map(DriverStop.fromJson).toList(growable: false),
      vehicleTypeName: vehicleType is Map ? vehicleType['name'] as String? : null,
      distanceM: toIntOrNull(route is Map ? route['distanceM'] : null),
      durationS: toIntOrNull(route is Map ? route['durationS'] : null),
      polyline: route is Map ? route['encodedPolyline'] as String? : null,
      scheduledPickupAt: toDate(json['scheduledPickupAt']),
      startedAt: toDate(json['startedAt']),
      completedAt: toDate(json['completedAt']),
    );
  }
}

/// One passenger's leg, as the driver sees it.
class RidePassengerLeg {
  const RidePassengerLeg({
    required this.id,
    required this.status,
    required this.seats,
    required this.isSharedJoin,
    required this.firstName,
    required this.pickup,
    required this.dropoff,
    this.phone,
    this.note,
    this.paymentMethod,
  });

  final String id;
  final String status;
  final int seats;

  /// True when this passenger was added to a journey already under way, rather
  /// than being the one who booked it.
  final bool isSharedJoin;

  final String firstName;
  final Place pickup;
  final Place dropoff;
  final String? phone;
  final String? note;
  final String? paymentMethod;

  bool get isOnboard => status == 'ONBOARD';
  bool get isDone => status == 'DROPPED_OFF' || status == 'CANCELLED';

  factory RidePassengerLeg.fromJson(Map<String, dynamic> json) => RidePassengerLeg(
        id: json['id'] as String,
        status: asEnum(json['status'], 'CONFIRMED'),
        seats: toInt(json['seats'], fallback: 1),
        isSharedJoin: json['isSharedJoin'] == true,
        firstName: (json['firstName'] ?? '') as String,
        pickup: Place.fromJson((json['pickup'] ?? const {}) as Map<String, dynamic>),
        dropoff: Place.fromJson((json['dropoff'] ?? const {}) as Map<String, dynamic>),
        phone: json['phone'] as String?,
        note: json['note'] as String?,
        paymentMethod: json['paymentMethod'] as String?,
      );
}

/// A shared passenger waiting for this driver's decision.
///
/// Every number here was computed by the matching engine when the candidate was
/// scored. The application displays them; it does not work out what a detour
/// costs or what the driver would earn for it.
class SharedPassengerRequest {
  const SharedPassengerRequest({
    required this.ridePassengerId,
    required this.rideId,
    required this.rideReference,
    required this.passengerFirstName,
    required this.seats,
    required this.pickup,
    required this.dropoff,
    required this.currency,
    this.additionalDistanceM,
    this.additionalDurationS,
    this.additionalEarning,
    this.estimatedPickupAt,
    this.requestedAt,
    this.note,
    this.matchScore,
  });

  final String ridePassengerId;
  final String rideId;
  final String rideReference;
  final String passengerFirstName;
  final int seats;
  final Place pickup;
  final Place dropoff;
  final String currency;

  /// How much further the driver travels to carry this person.
  final int? additionalDistanceM;
  final int? additionalDurationS;

  /// What they earn for it, net of commission.
  final String? additionalEarning;

  final DateTime? estimatedPickupAt;
  final DateTime? requestedAt;
  final String? note;
  final String? matchScore;

  factory SharedPassengerRequest.fromJson(Map<String, dynamic> json) {
    final passenger = json['passenger'];

    return SharedPassengerRequest(
      ridePassengerId: json['ridePassengerId'] as String,
      rideId: json['rideId'] as String,
      rideReference: (json['rideReference'] ?? '') as String,
      passengerFirstName:
          passenger is Map ? (passenger['firstName'] ?? 'Passenger') as String : 'Passenger',
      seats: toInt(json['seats'], fallback: 1),
      pickup: Place.fromJson((json['pickup'] ?? const {}) as Map<String, dynamic>),
      dropoff: Place.fromJson((json['dropoff'] ?? const {}) as Map<String, dynamic>),
      currency: (json['currency'] ?? 'LKR') as String,
      additionalDistanceM: toIntOrNull(json['additionalDistanceM']),
      additionalDurationS: toIntOrNull(json['additionalDurationS']),
      additionalEarning: asMoneyOrNull(json['additionalEarning']),
      estimatedPickupAt: toDate(json['estimatedPickupAt']),
      requestedAt: toDate(json['requestedAt']),
      note: json['note'] as String?,
      matchScore: json['matchScore'] as String?,
    );
  }
}
