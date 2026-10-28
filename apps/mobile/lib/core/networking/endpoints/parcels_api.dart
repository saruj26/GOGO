import 'package:dio/dio.dart';

import '../../../models/common.dart';
import '../../../models/parcel.dart';
import '../api_client.dart';

/// A pickup or drop-off point together with the person there.
class ParcelContact {
  const ParcelContact({
    required this.place,
    required this.contactName,
    required this.contactPhone,
  });

  final Place place;
  final String contactName;
  final String contactPhone;

  Map<String, dynamic> toJson() => {
        ...place.toJson(),
        'contactName': contactName,
        'contactPhone': contactPhone,
      };
}

class ParcelsApi {
  const ParcelsApi(this._client);

  final ApiClient _client;

  Future<List<ParcelType>> types() async {
    final data = await _client.get<List<dynamic>>('/parcels/types');
    return data.whereType<Map<String, dynamic>>().map(ParcelType.fromJson).toList(growable: false);
  }

  /// Prices the job for each vehicle class that can legally carry it. Which
  /// classes those are is the backend's decision, not a client-side rule.
  Future<List<ParcelQuote>> estimate({
    required ParcelContact pickup,
    required ParcelContact dropoff,
    required String parcelTypeId,
    double? weightKg,
    String? vehicleTypeId,
    CancelToken? cancelToken,
  }) async {
    final data = await _client.post<List<dynamic>>(
      '/parcels/estimate',
      body: {
        'pickup': pickup.toJson(),
        'dropoff': dropoff.toJson(),
        'parcelTypeId': parcelTypeId,
        'weightKg': ?weightKg,
        'vehicleTypeId': ?vehicleTypeId,
      },
      cancelToken: cancelToken,
    );
    return data.whereType<Map<String, dynamic>>().map(ParcelQuote.fromJson).toList(growable: false);
  }

  Future<CreatedParcel> create({
    required ParcelContact pickup,
    required ParcelContact dropoff,
    required String parcelTypeId,
    required String vehicleTypeId,
    required String paymentMethod,
    double? weightKg,
    double? declaredValue,
    String? notes,
    DateTime? scheduledFor,
    String? promotionCode,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/parcels',
      body: {
        'pickup': pickup.toJson(),
        'dropoff': dropoff.toJson(),
        'parcelTypeId': parcelTypeId,
        'vehicleTypeId': vehicleTypeId,
        'paymentMethod': paymentMethod,
        'weightKg': ?weightKg,
        'declaredValue': ?declaredValue,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (scheduledFor != null) 'scheduledFor': scheduledFor.toUtc().toIso8601String(),
        if (promotionCode != null && promotionCode.isNotEmpty) 'promotionCode': promotionCode,
      },
    );
    return CreatedParcel.fromJson(data);
  }

  Future<CursorPage<ParcelHistoryItem>> list({String? cursor, int? limit}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/parcels',
      query: {'cursor': cursor, 'limit': limit},
    );
    return CursorPage.fromJson(data, ParcelHistoryItem.fromJson);
  }

  Future<ParcelDetail> get(String parcelId, {CancelToken? cancelToken}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/parcels/$parcelId',
      cancelToken: cancelToken,
    );
    return ParcelDetail.fromJson(data);
  }

  Future<CursorPage<ParcelTrackingEntry>> tracking(
    String parcelId, {
    String? cursor,
    int? limit,
    CancelToken? cancelToken,
  }) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/parcels/$parcelId/tracking',
      query: {'cursor': cursor, 'limit': limit},
      cancelToken: cancelToken,
    );
    return CursorPage.fromJson(data, ParcelTrackingEntry.fromJson);
  }

  Future<void> cancel(String parcelId, {String? reason}) => _client.post<dynamic>(
        '/parcels/$parcelId/cancel',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );
}
