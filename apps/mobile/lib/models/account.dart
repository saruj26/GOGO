import 'common.dart';

class AccountSummary {
  const AccountSummary({
    required this.rides,
    required this.foodOrders,
    required this.parcels,
    required this.unreadNotifications,
    required this.walletBalance,
    required this.currency,
  });

  final int rides;
  final int foodOrders;
  final int parcels;
  final int unreadNotifications;
  final String walletBalance;
  final String currency;

  factory AccountSummary.fromJson(Map<String, dynamic> json) {
    final wallet = json['wallet'] is Map ? json['wallet'] as Map : const {};

    return AccountSummary(
      rides: toInt(json['rides']),
      foodOrders: toInt(json['foodOrders']),
      parcels: toInt(json['parcels']),
      unreadNotifications: toInt(json['unreadNotifications']),
      walletBalance: asMoney(wallet['balance']),
      currency: (wallet['currency'] ?? 'LKR') as String,
    );
  }
}

class WalletTransaction {
  const WalletTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.balanceAfter,
    this.description,
    this.reference,
    this.at,
  });

  final String id;
  final String type;
  final String amount;
  final String balanceAfter;
  final String? description;
  final String? reference;
  final DateTime? at;

  bool get isCredit => type == 'CREDIT';

  factory WalletTransaction.fromJson(Map<String, dynamic> json) => WalletTransaction(
        id: json['id'] as String,
        type: asEnum(json['type'], 'DEBIT'),
        amount: asMoney(json['amount']),
        balanceAfter: asMoney(json['balanceAfter']),
        description: json['description'] as String?,
        reference: json['reference'] as String?,
        at: toDate(json['at']),
      );
}

class WalletView {
  const WalletView({
    required this.balance,
    required this.currency,
    required this.frozen,
    required this.transactions,
  });

  final String balance;
  final String currency;

  /// A frozen wallet cannot be spent. Surfaced so the payment picker can
  /// explain why the option is unavailable instead of silently hiding it.
  final bool frozen;

  final CursorPage<WalletTransaction> transactions;

  factory WalletView.fromJson(Map<String, dynamic> json) {
    final page = json['transactions'];

    return WalletView(
      balance: asMoney(json['balance']),
      currency: (json['currency'] ?? 'LKR') as String,
      frozen: json['frozen'] == true,
      transactions: page is Map<String, dynamic>
          ? CursorPage.fromJson(page, WalletTransaction.fromJson)
          : const CursorPage(items: []),
    );
  }
}

class PaymentHistoryItem {
  const PaymentHistoryItem({
    required this.id,
    required this.serviceType,
    required this.method,
    required this.status,
    required this.amount,
    required this.refunded,
    required this.currency,
    this.paidAt,
    this.createdAt,
    this.reference,
    this.description,
  });

  final String id;
  final String serviceType;
  final String method;
  final String status;
  final String amount;
  final String refunded;
  final String currency;
  final DateTime? paidAt;
  final DateTime? createdAt;
  final String? reference;
  final String? description;

  factory PaymentHistoryItem.fromJson(Map<String, dynamic> json) => PaymentHistoryItem(
        id: json['id'] as String,
        serviceType: asEnum(json['serviceType'], 'RIDE'),
        method: asEnum(json['method'], 'CASH'),
        status: asEnum(json['status'], 'PENDING'),
        amount: asMoney(json['amount']),
        refunded: asMoney(json['refunded']),
        currency: (json['currency'] ?? 'LKR') as String,
        paidAt: toDate(json['paidAt']),
        createdAt: toDate(json['createdAt']),
        reference: json['reference'] as String?,
        description: json['description'] as String?,
      );
}

/// A promotion the backend says this account may use.
///
/// Whether it actually applies to a given booking is decided server-side at
/// quote time — these fields describe the offer, they are not a client-side
/// eligibility rule.
class AvailablePromotion {
  const AvailablePromotion({
    required this.code,
    required this.name,
    required this.type,
    required this.value,
    required this.minOrderAmount,
    required this.usesLeft,
    this.description,
    this.maxDiscount,
    this.appliesTo,
    this.expiresAt,
  });

  final String code;
  final String name;
  final String type;
  final String value;
  final String minOrderAmount;
  final int usesLeft;
  final String? description;
  final String? maxDiscount;

  /// Null means the promotion is not restricted by service.
  final List<String>? appliesTo;

  final DateTime? expiresAt;

  bool get isPercent => type == 'PERCENT';

  bool appliesToService(String serviceType) =>
      appliesTo == null || appliesTo!.contains(serviceType);

  factory AvailablePromotion.fromJson(Map<String, dynamic> json) {
    final applies = json['appliesTo'];

    return AvailablePromotion(
      code: (json['code'] ?? '') as String,
      name: (json['name'] ?? '') as String,
      type: asEnum(json['type'], 'FIXED'),
      value: asMoney(json['value']),
      minOrderAmount: asMoney(json['minOrderAmount']),
      usesLeft: toInt(json['usesLeft']),
      description: json['description'] as String?,
      maxDiscount: asMoneyOrNull(json['maxDiscount']),
      appliesTo: applies is List ? applies.whereType<String>().toList(growable: false) : null,
      expiresAt: toDate(json['expiresAt']),
    );
  }
}

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.data,
    this.readAt,
    this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final Map<String, dynamic>? data;
  final DateTime? readAt;
  final DateTime? createdAt;

  bool get isUnread => readAt == null;

  factory NotificationItem.fromJson(Map<String, dynamic> json) => NotificationItem(
        id: json['id'] as String,
        type: asEnum(json['type'], 'SYSTEM'),
        title: (json['title'] ?? '') as String,
        body: (json['body'] ?? '') as String,
        data: json['data'] is Map<String, dynamic> ? json['data'] as Map<String, dynamic> : null,
        readAt: toDate(json['readAt']),
        createdAt: toDate(json['createdAt']),
      );
}

class PendingRatingItem {
  const PendingRatingItem({
    required this.id,
    required this.reference,
    required this.kind,
    this.subtitle,
    this.completedAt,
  });

  final String id;
  final String reference;

  /// `ride`, `food` or `parcel` — decides which rating endpoint is called.
  final String kind;

  final String? subtitle;
  final DateTime? completedAt;
}

class PendingRatings {
  const PendingRatings({required this.items});

  final List<PendingRatingItem> items;

  bool get isEmpty => items.isEmpty;

  factory PendingRatings.fromJson(Map<String, dynamic> json) {
    final items = <PendingRatingItem>[
      for (final ride in asList(json['rides']))
        PendingRatingItem(
          id: ride['id'] as String,
          reference: (ride['reference'] ?? '') as String,
          kind: 'ride',
          completedAt: toDate(ride['completedAt']),
        ),
      for (final order in asList(json['foodOrders']))
        PendingRatingItem(
          id: order['id'] as String,
          reference: (order['reference'] ?? '') as String,
          kind: 'food',
          subtitle: order['restaurant'] as String?,
          completedAt: toDate(order['completedAt']),
        ),
      for (final parcel in asList(json['parcels']))
        PendingRatingItem(
          id: parcel['id'] as String,
          reference: (parcel['reference'] ?? '') as String,
          kind: 'parcel',
          completedAt: toDate(parcel['completedAt']),
        ),
    ];

    return PendingRatings(items: items);
  }
}
