import 'package:dio/dio.dart';

import '../../../models/auth.dart';
import '../../../models/common.dart';
import '../../../models/ride.dart';
import '../../../models/shared_ride.dart';
import '../api_client.dart';

class RidesApi {
  const RidesApi(this._client);

  final ApiClient _client;

  Future<List<VehicleEstimate>> estimate({
    required Place pickup,
    required Place dropoff,
    DateTime? scheduledPickupAt,
    CancelToken? cancelToken,
  }) async {
    final data = await _client.post<List<dynamic>>(
      '/rides/estimate',
      body: {
        'pickup': pickup.toJson(),
        'dropoff': dropoff.toJson(),
        if (scheduledPickupAt != null)
          'scheduledPickupAt': scheduledPickupAt.toUtc().toIso8601String(),
      },
      cancelToken: cancelToken,
    );

    return data
        .whereType<Map<String, dynamic>>()
        .map(VehicleEstimate.fromJson)
        .toList(growable: false);
  }

  Future<CreatedRide> create({
    required String rideType,
    required String vehicleTypeId,
    required Place pickup,
    required Place dropoff,
    int? seats,
    String? note,
    String? promotionCode,
    GenderPreference? genderPreference,
    DateTime? scheduledPickupAt,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/rides',
      body: {
        'rideType': rideType,
        'vehicleTypeId': vehicleTypeId,
        'pickup': pickup.toJson(),
        'dropoff': dropoff.toJson(),
        'seats': ?seats,
        if (note != null && note.isNotEmpty) 'note': note,
        if (promotionCode != null && promotionCode.isNotEmpty) 'promotionCode': promotionCode,
        if (genderPreference != null) 'genderPreference': genderPreference.wire,
        if (scheduledPickupAt != null)
          'scheduledPickupAt': scheduledPickupAt.toUtc().toIso8601String(),
      },
    );
    return CreatedRide.fromJson(data);
  }

  /// Asks the backend which rides already under way this journey could join.
  ///
  /// The request carries the journey and the safety preference; every decision
  /// about compatibility, ordering, detour and price is made server-side and
  /// comes back as offers.
  Future<SharedRideSearchResult> searchShared({
    required Place pickup,
    required Place dropoff,
    int? seats,
    String? vehicleTypeId,
    GenderPreference? genderPreference,
    DateTime? scheduledPickupAt,
    CancelToken? cancelToken,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/rides/shared/search',
      body: {
        'pickup': pickup.toJson(),
        'dropoff': dropoff.toJson(),
        'seats': ?seats,
        'vehicleTypeId': ?vehicleTypeId,
        if (genderPreference != null) 'genderPreference': genderPreference.wire,
        if (scheduledPickupAt != null)
          'scheduledPickupAt': scheduledPickupAt.toUtc().toIso8601String(),
      },
      cancelToken: cancelToken,
    );
    return SharedRideSearchResult.fromJson(data);
  }

  Future<JoinedSharedRide> joinShared({
    required String requestId,
    required String rideId,
    String? note,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/rides/shared/join',
      body: {
        'requestId': requestId,
        'rideId': rideId,
        if (note != null && note.isNotEmpty) 'note': note,
      },
    );
    return JoinedSharedRide.fromJson(data);
  }

  Future<RideDetail> get(String rideId, {CancelToken? cancelToken}) async {
    final data =
        await _client.get<Map<String, dynamic>>('/rides/$rideId', cancelToken: cancelToken);
    return RideDetail.fromJson(data);
  }

  Future<CursorPage<RideHistoryItem>> history({String? cursor, int? limit}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/rides',
      query: {'cursor': cursor, 'limit': limit},
    );
    return CursorPage.fromJson(data, RideHistoryItem.fromJson);
  }

  Future<void> cancel(String rideId, {String? reason}) => _client.post<dynamic>(
        '/rides/$rideId/cancel',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );
}
