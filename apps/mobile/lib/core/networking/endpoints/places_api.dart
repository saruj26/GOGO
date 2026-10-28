import 'package:dio/dio.dart';

import '../../../models/common.dart';
import '../api_client.dart';

class PlacesApi {
  const PlacesApi(this._client);

  final ApiClient _client;

  /// Address lookup. Takes a [CancelToken] because the search field issues one
  /// of these per keystroke and stale responses must not overwrite newer ones.
  Future<PlaceSearchResult> search(String query, {GeoPoint? near, CancelToken? cancelToken}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/places/search',
      query: {'q': query, 'lat': near?.lat, 'lng': near?.lng},
      cancelToken: cancelToken,
    );

    return PlaceSearchResult(
      results: asList(data['results']).map(Place.fromJson).toList(growable: false),
      attribution: data['attribution'] as String?,
    );
  }

  Future<Place> reverse(GeoPoint point, {CancelToken? cancelToken}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/places/reverse',
      query: {'lat': point.lat, 'lng': point.lng},
      cancelToken: cancelToken,
    );
    return Place.fromJson(data);
  }

  Future<List<SavedPlace>> saved() async {
    final data = await _client.get<List<dynamic>>('/places/saved');
    return data
        .whereType<Map<String, dynamic>>()
        .map(SavedPlace.fromJson)
        .toList(growable: false);
  }

  Future<SavedPlace> save({
    required String label,
    required String address,
    required double lat,
    required double lng,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/places/saved',
      body: {'label': label, 'address': address, 'lat': lat, 'lng': lng},
    );
    return SavedPlace.fromJson(data);
  }

  Future<void> removeSaved(String id) => _client.delete<void>('/places/saved/$id');
}

class PlaceSearchResult {
  const PlaceSearchResult({required this.results, this.attribution});

  final List<Place> results;

  /// The geocoder's required attribution string. Displayed wherever its results
  /// are, because the keyless provider's terms require it.
  final String? attribution;
}
