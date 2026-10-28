import 'common.dart';

/// A place a courier collects from or delivers to.
///
/// The contact fields are populated only once the job belongs to this courier —
/// on the open-jobs list the backend withholds them.
class DeliveryContact {
  const DeliveryContact({
    required this.address,
    required this.lat,
    required this.lng,
    this.name,
    this.phone,
    this.note,
  });

  final String address;
  final double lat;
  final double lng;
  final String? name;
  final String? phone;
  final String? note;

  factory DeliveryContact.fromJson(Map<String, dynamic> json) => DeliveryContact(
        address: (json['address'] ?? '') as String,
        lat: toDoubleValue(json['lat']),
        lng: toDoubleValue(json['lng']),
        name: (json['name'] ?? json['customerFirstName']) as String?,
        phone: json['phone'] as String?,
        note: json['note'] as String?,
      );
}

/// One open job on the courier's board, food or parcel.
///
/// Both services are collapsed into a single shape because a courier is one
/// person with one queue: the driver application does not have a food identity
/// and a separate parcel identity.
class DeliveryJobOffer {
  const DeliveryJobOffer({
    required this.id,
    required this.kind,
    required this.reference,
    required this.currency,
    required this.collectFrom,
    this.collectFromName,
    this.deliverToArea,
    this.earning,
    this.distanceM,
    this.durationS,
    this.status,
    this.parcelType,
    this.weightKg,
    this.requiresSignature = false,
    this.readyInMinutes,
    this.scheduledFor,
  });

  /// `deliveryId` for food, `parcelId` for parcel — whichever the action
  /// endpoints take.
  final String id;

  /// `food` or `parcel`.
  final String kind;

  final String reference;
  final String currency;
  final DeliveryContact collectFrom;
  final String? collectFromName;

  /// A coarse destination only; the exact address arrives with the job.
  final String? deliverToArea;

  final String? earning;
  final int? distanceM;
  final int? durationS;
  final String? status;
  final String? parcelType;
  final String? weightKg;
  final bool requiresSignature;
  final int? readyInMinutes;
  final DateTime? scheduledFor;

  bool get isFood => kind == 'food';

  factory DeliveryJobOffer.food(Map<String, dynamic> json) {
    final collect = (json['collectFrom'] ?? const {}) as Map<String, dynamic>;

    return DeliveryJobOffer(
      id: json['deliveryId'] as String,
      kind: 'food',
      reference: (json['reference'] ?? '') as String,
      currency: (json['currency'] ?? 'LKR') as String,
      collectFrom: DeliveryContact.fromJson(collect),
      collectFromName: collect['name'] as String?,
      earning: asMoneyOrNull(json['yourEarning']),
      distanceM: toIntOrNull(json['distanceM']),
      durationS: toIntOrNull(json['durationS']),
      status: json['orderStatus'] as String?,
      readyInMinutes: toIntOrNull(json['estimatedReadyInMinutes']),
    );
  }

  factory DeliveryJobOffer.parcel(Map<String, dynamic> json) => DeliveryJobOffer(
        id: json['parcelId'] as String,
        kind: 'parcel',
        reference: (json['reference'] ?? '') as String,
        currency: (json['currency'] ?? 'LKR') as String,
        collectFrom:
            DeliveryContact.fromJson((json['collectFrom'] ?? const {}) as Map<String, dynamic>),
        deliverToArea: json['deliverToArea'] as String?,
        earning: asMoneyOrNull(json['yourEarning']),
        distanceM: toIntOrNull(json['distanceM']),
        durationS: toIntOrNull(json['durationS']),
        status: json['status'] as String?,
        parcelType: json['parcelType'] as String?,
        weightKg: json['weightKg'] as String?,
        requiresSignature: json['requiresSignature'] == true,
        scheduledFor: toDate(json['scheduledFor']),
      );
}

/// The job a courier currently holds.
class ActiveDeliveryJob {
  const ActiveDeliveryJob({
    required this.id,
    required this.kind,
    required this.reference,
    required this.status,
    required this.currency,
    required this.collectFrom,
    required this.deliverTo,
    this.orderId,
    this.orderStatus,
    this.items = const [],
    this.itemCount = 0,

    /// Present only when the customer still owes cash on delivery. Null means
    /// nothing is to be collected — never rendered as zero.
    this.cashToCollect,
    this.earning,
    this.distanceM,
    this.durationS,
    this.polyline,
    this.parcelType,
    this.weightKg,
    this.notes,
    this.requiresSignature = false,
  });

  final String id;
  final String kind;
  final String reference;
  final String status;
  final String currency;
  final DeliveryContact collectFrom;
  final DeliveryContact deliverTo;
  final String? orderId;
  final String? orderStatus;
  final List<DeliveryLineItem> items;
  final int itemCount;
  final String? cashToCollect;
  final String? earning;
  final int? distanceM;
  final int? durationS;
  final String? polyline;
  final String? parcelType;
  final String? weightKg;
  final String? notes;
  final bool requiresSignature;

  bool get isFood => kind == 'food';

  /// The status the courier's own leg is in, which for food is the delivery
  /// row rather than the order.
  String get legStatus => status;

  factory ActiveDeliveryJob.food(Map<String, dynamic> json) {
    final order = json['order'] is Map ? json['order'] as Map : const {};
    final route = json['route'] is Map ? json['route'] as Map : const {};
    final collect = (json['collectFrom'] ?? const {}) as Map<String, dynamic>;

    return ActiveDeliveryJob(
      id: json['deliveryId'] as String,
      kind: 'food',
      reference: (order['reference'] ?? '') as String,
      status: asEnum(json['status'], 'ASSIGNED'),
      currency: (json['currency'] ?? 'LKR') as String,
      collectFrom: DeliveryContact.fromJson(collect),
      deliverTo: DeliveryContact.fromJson((json['deliverTo'] ?? const {}) as Map<String, dynamic>),
      orderId: order['id'] as String?,
      orderStatus: order['status'] as String?,
      items: asList(order['items']).map(DeliveryLineItem.fromJson).toList(growable: false),
      itemCount: toInt(order['itemCount']),
      cashToCollect: asMoneyOrNull(json['cashToCollect']),
      earning: asMoneyOrNull(json['yourEarning']),
      distanceM: toIntOrNull(route['distanceM']),
      durationS: toIntOrNull(route['durationS']),
      polyline: route['polyline'] as String?,
    );
  }

  factory ActiveDeliveryJob.parcel(Map<String, dynamic> json) {
    final route = json['route'] is Map ? json['route'] as Map : const {};

    return ActiveDeliveryJob(
      id: json['parcelId'] as String,
      kind: 'parcel',
      reference: (json['reference'] ?? '') as String,
      status: asEnum(json['status'], 'ASSIGNED'),
      currency: (json['currency'] ?? 'LKR') as String,
      collectFrom:
          DeliveryContact.fromJson((json['collectFrom'] ?? const {}) as Map<String, dynamic>),
      deliverTo: DeliveryContact.fromJson((json['deliverTo'] ?? const {}) as Map<String, dynamic>),
      cashToCollect: asMoneyOrNull(json['cashToCollect']),
      earning: asMoneyOrNull(json['yourEarning']),
      distanceM: toIntOrNull(route['distanceM']),
      durationS: toIntOrNull(route['durationS']),
      polyline: route['polyline'] as String?,
      parcelType: json['parcelType'] as String?,
      weightKg: json['weightKg'] as String?,
      notes: json['notes'] as String?,
      requiresSignature: json['requiresSignature'] == true,
    );
  }
}

class DeliveryLineItem {
  const DeliveryLineItem({required this.name, required this.quantity});

  final String name;
  final int quantity;

  factory DeliveryLineItem.fromJson(Map<String, dynamic> json) => DeliveryLineItem(
        name: (json['name'] ?? '') as String,
        quantity: toInt(json['quantity'], fallback: 1),
      );
}

class DeliveryHistoryItem {
  const DeliveryHistoryItem({
    required this.id,
    required this.kind,
    required this.reference,
    required this.status,
    this.title,
    this.earning,
    this.currency,
    this.distanceM,
    this.assignedAt,
    this.deliveredAt,
  });

  final String id;
  final String kind;
  final String reference;
  final String status;
  final String? title;
  final String? earning;
  final String? currency;
  final int? distanceM;
  final DateTime? assignedAt;
  final DateTime? deliveredAt;

  factory DeliveryHistoryItem.food(Map<String, dynamic> json) {
    final order = json['order'] is Map ? json['order'] as Map : const {};
    final restaurant = order['restaurant'] is Map ? order['restaurant'] as Map : const {};
    final quote = order['fareQuote'];

    return DeliveryHistoryItem(
      id: json['id'] as String,
      kind: 'food',
      reference: (order['reference'] ?? '') as String,
      status: asEnum(json['status'], 'DELIVERED'),
      title: restaurant['name'] as String?,
      earning: quote is Map ? asMoneyOrNull(quote['driverNet']) : null,
      currency: quote is Map ? quote['currency'] as String? : null,
      distanceM: toIntOrNull(json['distanceM']),
      assignedAt: toDate(json['assignedAt']),
      deliveredAt: toDate(json['deliveredAt']),
    );
  }

  factory DeliveryHistoryItem.parcel(Map<String, dynamic> json) {
    final quote = json['fareQuote'];

    return DeliveryHistoryItem(
      id: json['id'] as String,
      kind: 'parcel',
      reference: (json['reference'] ?? '') as String,
      status: asEnum(json['status'], 'DELIVERED'),
      earning: quote is Map ? asMoneyOrNull(quote['driverNet']) : null,
      currency: quote is Map ? quote['currency'] as String? : null,
      distanceM: toIntOrNull(json['distanceM']),
      assignedAt: toDate(json['assignedAt']),
      deliveredAt: toDate(json['deliveredAt']),
    );
  }
}
