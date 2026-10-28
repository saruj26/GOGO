import 'package:dio/dio.dart';

import '../../../models/common.dart';
import '../../../models/food.dart';
import '../api_client.dart';

class FoodApi {
  const FoodApi(this._client);

  final ApiClient _client;

  Future<CursorPage<RestaurantSummary>> restaurants({
    String? query,
    GeoPoint? near,
    bool? openOnly,
    String? cursor,
    int? limit,
    CancelToken? cancelToken,
  }) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/restaurants',
      query: {
        'q': query,
        'lat': near?.lat,
        'lng': near?.lng,
        'openOnly': openOnly,
        'cursor': cursor,
        'limit': limit,
      },
      cancelToken: cancelToken,
    );
    return CursorPage.fromJson(data, RestaurantSummary.fromJson);
  }

  Future<RestaurantDetail> restaurant(String idOrSlug) async {
    final data = await _client.get<Map<String, dynamic>>('/restaurants/$idOrSlug');
    return RestaurantDetail.fromJson(data);
  }

  Future<List<Cart>> carts() async {
    final data = await _client.get<List<dynamic>>('/food/carts');
    return data.whereType<Map<String, dynamic>>().map(Cart.fromJson).toList(growable: false);
  }

  Future<Cart> cart(String restaurantId) async {
    final data = await _client.get<Map<String, dynamic>>('/food/carts/$restaurantId');
    return Cart.fromJson(data);
  }

  /// Every mutation returns the whole cart, so the app replaces its copy with
  /// the server's rather than adjusting quantities locally and drifting.
  Future<Cart> addItem({
    required String menuItemId,
    required int quantity,
    String? notes,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/food/carts/items',
      body: {
        'menuItemId': menuItemId,
        'quantity': quantity,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
    return Cart.fromJson(data);
  }

  Future<Cart> updateItem(String cartItemId, {required int quantity, String? notes}) async {
    final data = await _client.put<Map<String, dynamic>>(
      '/food/carts/items/$cartItemId',
      body: {'quantity': quantity, 'notes': ?notes},
    );
    return Cart.fromJson(data);
  }

  Future<Cart> removeItem(String cartItemId) async {
    final data = await _client.delete<Map<String, dynamic>>('/food/carts/items/$cartItemId');
    return Cart.fromJson(data);
  }

  Future<void> clearCart(String restaurantId) =>
      _client.delete<dynamic>('/food/carts/$restaurantId');

  Future<PlacedFoodOrder> checkout({
    required String restaurantId,
    required Place deliveryAddress,
    required String paymentMethod,
    String? deliveryNote,
    String? promotionCode,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/food/carts/$restaurantId/checkout',
      body: {
        'deliveryAddress': deliveryAddress.toJson(),
        'paymentMethod': paymentMethod,
        if (deliveryNote != null && deliveryNote.isNotEmpty) 'deliveryNote': deliveryNote,
        if (promotionCode != null && promotionCode.isNotEmpty) 'promotionCode': promotionCode,
      },
    );
    return PlacedFoodOrder.fromJson(data);
  }

  Future<CursorPage<FoodOrderHistoryItem>> orders({String? cursor, int? limit}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/food/orders',
      query: {'cursor': cursor, 'limit': limit},
    );
    return CursorPage.fromJson(data, FoodOrderHistoryItem.fromJson);
  }

  Future<FoodOrderDetail> order(String orderId, {CancelToken? cancelToken}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/food/orders/$orderId',
      cancelToken: cancelToken,
    );
    return FoodOrderDetail.fromJson(data);
  }

  Future<FoodOrderTracking> tracking(String orderId, {CancelToken? cancelToken}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/food/orders/$orderId/tracking',
      cancelToken: cancelToken,
    );
    return FoodOrderTracking.fromJson(data);
  }

  Future<void> cancelOrder(String orderId, {String? reason}) => _client.post<dynamic>(
        '/food/orders/$orderId/cancel',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );
}
