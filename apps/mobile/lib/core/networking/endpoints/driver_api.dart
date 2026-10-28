import '../../../models/common.dart';
import '../../../models/delivery.dart';
import '../../../models/driver.dart';
import '../api_client.dart';

/// Everything the driver application calls.
///
/// One driver identity covers rides, food and parcels — there is no separate
/// courier account — so ride work and delivery work sit side by side here.
class DriverApi {
  const DriverApi(this._client);

  final ApiClient _client;

  // -------------------------------------------------------------- presence

  /// Approval, availability, vehicles and document statuses in one read. The
  /// driver shell cannot decide anything before this has come back.
  Future<DriverProfile> profile() async {
    final data = await _client.get<Map<String, dynamic>>('/drivers/me');
    return DriverProfile.fromJson(data);
  }

  Future<DriverAvailability> updateAvailability({
    String? presence,
    String? activeVehicleId,
    bool? acceptsShared,
    bool? acceptsFood,
    bool? acceptsParcel,
  }) async {
    final data = await _client.put<Map<String, dynamic>>(
      '/drivers/me/availability',
      body: {
        'presence': ?presence,
        'activeVehicleId': ?activeVehicleId,
        'acceptsShared': ?acceptsShared,
        'acceptsFood': ?acceptsFood,
        'acceptsParcel': ?acceptsParcel,
      },
    );
    return DriverAvailability.fromJson(data);
  }

  /// Reports the vehicle's position. Fire-and-forget from the caller's point of
  /// view: a dropped ping is replaced by the next one, so a failure here must
  /// never surface as an error dialog over the driver's navigation.
  Future<void> reportLocation({
    required double lat,
    required double lng,
    double? headingDeg,
    double? speedKph,
    double? accuracyM,
    DateTime? recordedAt,
  }) =>
      _client.post<dynamic>(
        '/drivers/me/location',
        body: {
          'lat': lat,
          'lng': lng,
          'headingDeg': ?headingDeg,
          'speedKph': ?speedKph,
          'accuracyM': ?accuracyM,
          'recordedAt': (recordedAt ?? DateTime.now()).toUtc().toIso8601String(),
        },
      );

  // -------------------------------------------------------------- ride work

  Future<List<RideRequestOffer>> availableRides() async {
    final data = await _client.get<List<dynamic>>('/rides/driver/available');
    return data
        .whereType<Map<String, dynamic>>()
        .map(RideRequestOffer.fromJson)
        .toList(growable: false);
  }

  Future<DriverActiveRide?> activeRide() async {
    final data = await _client.get<dynamic>('/rides/driver/active');
    if (data is! Map<String, dynamic>) return null;
    return DriverActiveRide.fromJson(data);
  }

  /// One ride in the driver's own projection, including the passenger list and
  /// the current stop sequence.
  Future<DriverRideDetail> rideDetail(String rideId) async {
    final data = await _client.get<Map<String, dynamic>>('/rides/$rideId');
    return DriverRideDetail.fromJson(data);
  }

  Future<CursorPage<Map<String, dynamic>>> assignedRides({String? cursor, int? limit}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/rides/driver/assigned',
      query: {'cursor': cursor, 'limit': limit},
    );
    return CursorPage.fromJson(data, (json) => json);
  }

  Future<void> acceptRide(String rideId) => _client.post<dynamic>('/rides/$rideId/accept');

  // ------------------------------------------------------ shared passengers

  /// Requests waiting on this driver's decision.
  Future<List<SharedPassengerRequest>> pendingSharedPassengers() async {
    final data = await _client.get<List<dynamic>>('/rides/driver/shared-requests');
    return data
        .whereType<Map<String, dynamic>>()
        .map(SharedPassengerRequest.fromJson)
        .toList(growable: false);
  }

  /// Takes the passenger onto the ride.
  ///
  /// The backend re-checks capacity, safety and ride state under a row lock
  /// before confirming, so this can legitimately be refused even though the
  /// request was on screen a moment ago.
  Future<void> acceptSharedPassenger({
    required String rideId,
    required String ridePassengerId,
  }) =>
      _client.post<dynamic>('/rides/$rideId/shared-passengers/$ridePassengerId/accept');

  Future<void> rejectSharedPassenger({
    required String rideId,
    required String ridePassengerId,
    String? reason,
  }) =>
      _client.post<dynamic>(
        '/rides/$rideId/shared-passengers/$ridePassengerId/reject',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );

  Future<void> markArriving(String rideId) => _client.post<dynamic>('/rides/$rideId/arriving');

  Future<void> markArrived(String rideId) => _client.post<dynamic>('/rides/$rideId/arrived');

  Future<void> startRide(String rideId) => _client.post<dynamic>('/rides/$rideId/start');

  Future<void> completeRide(String rideId) => _client.post<dynamic>('/rides/$rideId/complete');

  Future<void> cancelRide(String rideId, {String? reason}) => _client.post<dynamic>(
        '/rides/$rideId/cancel',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );

  // ---------------------------------------------------------- delivery work

  /// Open jobs across both delivery services.
  ///
  /// The two boards are fetched independently so one being unavailable — a
  /// courier who has food enabled but not parcels, say — still shows the other.
  Future<List<DeliveryJobOffer>> availableDeliveries({
    bool food = true,
    bool parcel = true,
  }) async {
    final jobs = <DeliveryJobOffer>[];

    if (food) {
      final data = await _client.get<List<dynamic>>('/food/deliveries/available');
      jobs.addAll(
        data.whereType<Map<String, dynamic>>().map(DeliveryJobOffer.food),
      );
    }

    if (parcel) {
      final data = await _client.get<List<dynamic>>('/parcels/jobs/available');
      jobs.addAll(
        data.whereType<Map<String, dynamic>>().map(DeliveryJobOffer.parcel),
      );
    }

    return jobs;
  }

  Future<ActiveDeliveryJob?> currentDelivery() async {
    final food = await _client.get<dynamic>('/food/deliveries/current');
    if (food is Map<String, dynamic>) return ActiveDeliveryJob.food(food);

    final parcel = await _client.get<dynamic>('/parcels/jobs/current');
    if (parcel is Map<String, dynamic>) return ActiveDeliveryJob.parcel(parcel);

    return null;
  }

  Future<CursorPage<DeliveryHistoryItem>> deliveryHistory({
    required String kind,
    String? cursor,
    int? limit,
  }) async {
    final path = kind == 'food' ? '/food/deliveries/history' : '/parcels/jobs/history';
    final data = await _client.get<Map<String, dynamic>>(
      path,
      query: {'cursor': cursor, 'limit': limit},
    );

    return CursorPage.fromJson(
      data,
      kind == 'food' ? DeliveryHistoryItem.food : DeliveryHistoryItem.parcel,
    );
  }

  // --- food delivery lifecycle ---

  Future<void> acceptFoodDelivery(String id) =>
      _client.post<dynamic>('/food/deliveries/$id/accept');

  Future<void> releaseFoodDelivery(String id, {String? reason}) => _client.post<dynamic>(
        '/food/deliveries/$id/release',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );

  Future<void> foodHeadingToPickup(String id) =>
      _client.post<dynamic>('/food/deliveries/$id/heading-to-pickup');

  Future<void> foodArrived(String id) => _client.post<dynamic>('/food/deliveries/$id/arrived');

  Future<void> foodPickedUp(String id) => _client.post<dynamic>('/food/deliveries/$id/pickup');

  Future<void> foodDelivering(String id) =>
      _client.post<dynamic>('/food/deliveries/$id/delivering');

  Future<void> foodDelivered(String id) => _client.post<dynamic>('/food/deliveries/$id/deliver');

  // --- parcel lifecycle ---

  Future<void> acceptParcelJob(String id) => _client.post<dynamic>('/parcels/jobs/$id/accept');

  Future<void> releaseParcelJob(String id, {String? reason}) => _client.post<dynamic>(
        '/parcels/jobs/$id/release',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );

  /// Each parcel step optionally carries where the courier was when it
  /// happened. The backend stores it on the tracking entry, which is the only
  /// reason a parcel's history ever has coordinates on it — so the position is
  /// passed through when the device has one and omitted when it does not,
  /// rather than being invented.
  Future<void> parcelHeadingToPickup(String id, {GeoPoint? at}) =>
      _client.post<dynamic>('/parcels/jobs/$id/heading-to-pickup', body: _position(at));

  Future<void> parcelPickedUp(String id, {GeoPoint? at}) =>
      _client.post<dynamic>('/parcels/jobs/$id/pickup', body: _position(at));

  Future<void> parcelInTransit(String id, {GeoPoint? at}) =>
      _client.post<dynamic>('/parcels/jobs/$id/in-transit', body: _position(at));

  Future<void> parcelDelivered(String id, {GeoPoint? at}) =>
      _client.post<dynamic>('/parcels/jobs/$id/deliver', body: _position(at));

  Map<String, dynamic> _position(GeoPoint? at) =>
      at == null ? const {} : {'lat': at.lat, 'lng': at.lng};

  Future<void> parcelFailed(String id, {required String reason}) =>
      _client.post<dynamic>('/parcels/jobs/$id/fail', body: {'reason': reason});

  // -------------------------------------------------------------- earnings

  Future<EarningsSummary> earningsSummary({DateTime? from, DateTime? to}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/drivers/me/earnings/summary',
      query: {
        'from': from?.toUtc().toIso8601String(),
        'to': to?.toUtc().toIso8601String(),
      },
    );
    return EarningsSummary.fromJson(data);
  }

  Future<CursorPage<EarningRecord>> earnings({String? cursor, int? limit, String? status}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/drivers/me/earnings',
      query: {'cursor': cursor, 'limit': limit, 'status': status},
    );
    return CursorPage.fromJson(data, EarningRecord.fromJson);
  }
}
