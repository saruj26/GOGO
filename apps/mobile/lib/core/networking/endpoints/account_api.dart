import '../../../models/account.dart';
import '../../../models/common.dart';
import '../api_client.dart';

class AccountApi {
  const AccountApi(this._client);

  final ApiClient _client;

  Future<AccountSummary> summary() async {
    final data = await _client.get<Map<String, dynamic>>('/account/summary');
    return AccountSummary.fromJson(data);
  }

  Future<WalletView> wallet({String? cursor, int? limit}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/account/wallet',
      query: {'cursor': cursor, 'limit': limit},
    );
    return WalletView.fromJson(data);
  }

  Future<CursorPage<PaymentHistoryItem>> payments({
    String? cursor,
    int? limit,
    String? serviceType,
  }) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/account/payments',
      query: {'cursor': cursor, 'limit': limit, 'serviceType': serviceType},
    );
    return CursorPage.fromJson(data, PaymentHistoryItem.fromJson);
  }

  Future<List<AvailablePromotion>> promotions() async {
    final data = await _client.get<List<dynamic>>('/account/promotions');
    return data
        .whereType<Map<String, dynamic>>()
        .map(AvailablePromotion.fromJson)
        .toList(growable: false);
  }
}

class NotificationsApi {
  const NotificationsApi(this._client);

  final ApiClient _client;

  Future<CursorPage<NotificationItem>> list({String? cursor, int? limit, bool? unread}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/notifications',
      query: {'cursor': cursor, 'limit': limit, 'unread': unread},
    );
    return CursorPage.fromJson(data, NotificationItem.fromJson);
  }

  Future<int> unreadCount() async {
    final data = await _client.get<Map<String, dynamic>>('/notifications/unread-count');
    return toInt(data['count']);
  }

  Future<void> markRead(String id) => _client.post<dynamic>('/notifications/$id/read');

  Future<void> markAllRead() => _client.post<dynamic>('/notifications/read-all');
}

class RatingsApi {
  const RatingsApi(this._client);

  final ApiClient _client;

  Future<PendingRatings> pending() async {
    final data = await _client.get<Map<String, dynamic>>('/ratings/pending');
    return PendingRatings.fromJson(data);
  }

  /// One call for all three services. The backend refuses a second rating for
  /// the same job, which is what actually prevents duplicates — the app only
  /// hides the prompt once it has been used.
  Future<void> rate({
    required String kind,
    required String id,
    required int score,
    String? comment,
  }) {
    final path = switch (kind) {
      'food' => '/ratings/food-orders/$id',
      'parcel' => '/ratings/parcels/$id',
      _ => '/ratings/rides/$id',
    };

    return _client.post<dynamic>(
      path,
      body: {'score': score, if (comment != null && comment.isNotEmpty) 'comment': comment},
    );
  }
}
