import 'common.dart';
import 'ride.dart';

/// One ride the matching engine decided this journey could join.
///
/// Every field is a decision the backend already made: route overlap, direction,
/// stop ordering, detour ceilings, capacity, safety constraints and price. The
/// application renders this and nothing more — it has no notion of whether two
/// journeys are compatible.
class SharedRideOffer {
  const SharedRideOffer({
    required this.rideId,
    required this.pickupWalkMeters,
    required this.dropoffWalkMeters,
    required this.seatsAvailable,
    required this.coPassengerCount,
    required this.fare,
    required this.saving,
    required this.matchQuality,
    this.reference,
    this.vehicleTypeName,
    this.vehicle,
    this.driver,
    this.estimatedPickupAt,
    this.estimatedDropoffAt,
  });

  final String rideId;
  final int pickupWalkMeters;
  final int dropoffWalkMeters;
  final int seatsAvailable;
  final int coPassengerCount;
  final PublicFare fare;

  /// What the backend says this passenger saves against the solo fare.
  final String saving;

  /// 0–100, the engine's own ranking score.
  final int matchQuality;

  final String? reference;
  final String? vehicleTypeName;
  final VehicleSummary? vehicle;
  final DriverSummary? driver;
  final DateTime? estimatedPickupAt;
  final DateTime? estimatedDropoffAt;

  factory SharedRideOffer.fromJson(Map<String, dynamic> json) {
    final vehicleType = json['vehicleType'];

    return SharedRideOffer(
      rideId: json['rideId'] as String,
      pickupWalkMeters: toInt(json['pickupWalkMeters']),
      dropoffWalkMeters: toInt(json['dropoffWalkMeters']),
      seatsAvailable: toInt(json['seatsAvailable'], fallback: 1),
      coPassengerCount: toInt(json['coPassengerCount']),
      fare: PublicFare.fromJson((json['fare'] ?? const {}) as Map<String, dynamic>),
      saving: asMoney(json['saving']),
      matchQuality: toInt(json['matchQuality']),
      reference: json['reference'] as String?,
      vehicleTypeName: vehicleType is Map ? vehicleType['name'] as String? : null,
      vehicle: json['vehicle'] is Map<String, dynamic>
          ? VehicleSummary.fromJson(json['vehicle'] as Map<String, dynamic>)
          : null,
      driver: json['driver'] is Map<String, dynamic>
          ? DriverSummary.fromJson(json['driver'] as Map<String, dynamic>)
          : null,
      estimatedPickupAt: toDate(json['estimatedPickupAt']),
      estimatedDropoffAt: toDate(json['estimatedDropoffAt']),
    );
  }
}

class SharedRideSearchResult {
  const SharedRideSearchResult({
    required this.requestId,
    required this.offers,
    this.expiresAt,
    this.noMatchReason,
  });

  final String requestId;
  final List<SharedRideOffer> offers;
  final DateTime? expiresAt;

  /// The backend's explanation when nothing matched. Shown verbatim: the app
  /// must not guess why a journey was not compatible.
  final String? noMatchReason;

  bool get isEmpty => offers.isEmpty;

  factory SharedRideSearchResult.fromJson(Map<String, dynamic> json) => SharedRideSearchResult(
        requestId: json['requestId'] as String,
        offers: asList(json['offers']).map(SharedRideOffer.fromJson).toList(growable: false),
        expiresAt: toDate(json['expiresAt']),
        noMatchReason: json['noMatchReason'] as String?,
      );
}

/// The result of asking to join a shared ride.
///
/// Asking is not joining. The seat is held, but the driver decides — so this
/// comes back as OFFERED and the application says the request is waiting rather
/// than announcing a confirmed seat it cannot promise.
class JoinedSharedRide {
  const JoinedSharedRide({
    required this.ridePassengerId,
    required this.rideId,
    required this.seats,
    required this.currency,
    required this.status,
    this.fare,
    this.estimatedPickupAt,
  });

  final String ridePassengerId;
  final String rideId;
  final int seats;
  final String currency;

  /// `OFFERED` while the driver has not answered; `CONFIRMED` once they have.
  final String status;

  final String? fare;
  final DateTime? estimatedPickupAt;

  bool get awaitingDriver => status == 'OFFERED';

  factory JoinedSharedRide.fromJson(Map<String, dynamic> json) => JoinedSharedRide(
        ridePassengerId: json['ridePassengerId'] as String,
        rideId: json['rideId'] as String,
        seats: toInt(json['seats'], fallback: 1),
        currency: (json['currency'] ?? 'LKR') as String,
        status: asEnum(json['status'], 'OFFERED'),
        fare: asMoneyOrNull(json['fare']),
        estimatedPickupAt: toDate(json['estimatedPickupAt']),
      );
}
