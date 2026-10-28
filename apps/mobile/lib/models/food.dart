import 'common.dart';

class RestaurantSummary {
  const RestaurantSummary({
    required this.id,
    required this.name,
    required this.slug,
    required this.isAcceptingOrders,
    required this.prepMinutes,
    required this.minOrderAmount,
    required this.ratingAverage,
    required this.ratingCount,
    required this.address,
    this.description,
    this.logoUrl,
    this.coverUrl,
    this.distanceM,
    this.withinDeliveryRange,
  });

  final String id;
  final String name;
  final String slug;
  final bool isAcceptingOrders;
  final int prepMinutes;
  final String minOrderAmount;
  final String ratingAverage;
  final int ratingCount;
  final String address;
  final String? description;
  final String? logoUrl;
  final String? coverUrl;
  final int? distanceM;

  /// Null when the caller did not supply a location, which is different from
  /// "out of range" and is rendered differently.
  final bool? withinDeliveryRange;

  factory RestaurantSummary.fromJson(Map<String, dynamic> json) {
    final rating = json['rating'];

    return RestaurantSummary(
      id: json['id'] as String,
      name: (json['name'] ?? '') as String,
      slug: (json['slug'] ?? '') as String,
      isAcceptingOrders: json['isAcceptingOrders'] == true,
      prepMinutes: toInt(json['prepMinutes']),
      minOrderAmount: asMoney(json['minOrderAmount']),
      ratingAverage: rating is Map ? asMoney(rating['average']) : '0.00',
      ratingCount: rating is Map ? toInt(rating['count']) : 0,
      address: (json['address'] ?? '') as String,
      description: json['description'] as String?,
      logoUrl: json['logoUrl'] as String?,
      coverUrl: json['coverUrl'] as String?,
      distanceM: toIntOrNull(json['distanceM']),
      withinDeliveryRange: json['withinDeliveryRange'] as bool?,
    );
  }
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    required this.currency,
    required this.available,
    this.description,
    this.imageUrl,
    this.prepMinutes,
  });

  final String id;
  final String name;
  final String price;
  final String currency;
  final bool available;
  final String? description;
  final String? imageUrl;
  final int? prepMinutes;

  factory MenuItem.fromJson(Map<String, dynamic> json) => MenuItem(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
        price: asMoney(json['price']),
        currency: (json['currency'] ?? 'LKR') as String,
        available: json['available'] == true,
        description: json['description'] as String?,
        imageUrl: json['imageUrl'] as String?,
        prepMinutes: toIntOrNull(json['prepMinutes']),
      );
}

class MenuCategory {
  const MenuCategory({required this.id, required this.name, required this.items});

  final String id;
  final String name;
  final List<MenuItem> items;

  factory MenuCategory.fromJson(Map<String, dynamic> json) => MenuCategory(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
        items: asList(json['items']).map(MenuItem.fromJson).toList(growable: false),
      );
}

class RestaurantDetail {
  const RestaurantDetail({
    required this.id,
    required this.name,
    required this.slug,
    required this.phone,
    required this.isAcceptingOrders,
    required this.defaultPrepMinutes,
    required this.minOrderAmount,
    required this.ratingAverage,
    required this.ratingCount,
    required this.addressLine,
    required this.lat,
    required this.lng,
    required this.categories,
    this.description,
    this.logoUrl,
    this.coverUrl,
  });

  final String id;
  final String name;
  final String slug;
  final String phone;
  final bool isAcceptingOrders;
  final int defaultPrepMinutes;
  final String minOrderAmount;
  final String ratingAverage;
  final int ratingCount;
  final String addressLine;
  final double lat;
  final double lng;
  final List<MenuCategory> categories;
  final String? description;
  final String? logoUrl;
  final String? coverUrl;

  factory RestaurantDetail.fromJson(Map<String, dynamic> json) {
    final rating = json['rating'];

    return RestaurantDetail(
      id: json['id'] as String,
      name: (json['name'] ?? '') as String,
      slug: (json['slug'] ?? '') as String,
      phone: (json['phone'] ?? '') as String,
      isAcceptingOrders: json['isAcceptingOrders'] == true,
      defaultPrepMinutes: toInt(json['defaultPrepMinutes']),
      minOrderAmount: asMoney(json['minOrderAmount']),
      ratingAverage: rating is Map ? asMoney(rating['average']) : '0.00',
      ratingCount: rating is Map ? toInt(rating['count']) : 0,
      addressLine: (json['addressLine'] ?? '') as String,
      lat: toDoubleValue(json['latitude']),
      lng: toDoubleValue(json['longitude']),
      categories: asList(json['categories']).map(MenuCategory.fromJson).toList(growable: false),
      description: json['description'] as String?,
      logoUrl: json['logoUrl'] as String?,
      coverUrl: json['coverUrl'] as String?,
    );
  }
}

class CartLine {
  const CartLine({
    required this.id,
    required this.name,
    required this.unitPrice,
    required this.quantity,
    required this.lineTotal,
    required this.available,
    required this.priceChanged,
    required this.currentPrice,
    this.menuItemId,
    this.imageUrl,
    this.notes,
  });

  final String id;
  final String name;
  final String unitPrice;
  final int quantity;
  final String lineTotal;
  final bool available;

  /// The restaurant repriced this item after it went into the cart. Surfaced so
  /// the person is not surprised at checkout; the backend re-prices anyway.
  final bool priceChanged;

  final String currentPrice;
  final String? menuItemId;
  final String? imageUrl;
  final String? notes;

  factory CartLine.fromJson(Map<String, dynamic> json) => CartLine(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
        unitPrice: asMoney(json['unitPrice']),
        quantity: toInt(json['quantity'], fallback: 1),
        lineTotal: asMoney(json['lineTotal']),
        available: json['available'] == true,
        priceChanged: json['priceChanged'] == true,
        currentPrice: asMoney(json['currentPrice']),
        menuItemId: json['menuItemId'] as String?,
        imageUrl: json['imageUrl'] as String?,
        notes: json['notes'] as String?,
      );
}

/// A cart as the server holds it.
///
/// Totals, availability and the minimum-order check are all server fields. The
/// app never adds up line totals itself, so what is shown is what will be
/// charged.
class Cart {
  const Cart({
    required this.cartId,
    required this.reference,
    required this.currency,
    required this.restaurantId,
    required this.restaurantName,
    required this.restaurantAcceptingOrders,
    required this.items,
    required this.itemsSubtotal,
    required this.minimumOrderAmount,
    required this.meetsMinimum,
    required this.hasUnavailableItems,
    required this.hasPriceChanges,
    this.restaurantLogoUrl,
    this.prepMinutes,
  });

  final String cartId;
  final String reference;
  final String currency;
  final String restaurantId;
  final String restaurantName;
  final bool restaurantAcceptingOrders;
  final List<CartLine> items;
  final String itemsSubtotal;
  final String minimumOrderAmount;
  final bool meetsMinimum;
  final bool hasUnavailableItems;
  final bool hasPriceChanges;
  final String? restaurantLogoUrl;
  final int? prepMinutes;

  int get itemCount => items.fold(0, (sum, line) => sum + line.quantity);
  bool get isEmpty => items.isEmpty;

  /// Whether checkout is worth offering. The backend enforces each of these
  /// again; this only avoids a round trip that is certain to fail.
  bool get canCheckout =>
      items.isNotEmpty && meetsMinimum && !hasUnavailableItems && restaurantAcceptingOrders;

  factory Cart.fromJson(Map<String, dynamic> json) {
    final restaurant = json['restaurant'] is Map
        ? json['restaurant'] as Map
        : const <String, dynamic>{};

    return Cart(
      cartId: json['cartId'] as String,
      reference: (json['reference'] ?? '') as String,
      currency: (json['currency'] ?? 'LKR') as String,
      restaurantId: (restaurant['id'] ?? '') as String,
      restaurantName: (restaurant['name'] ?? '') as String,
      restaurantAcceptingOrders: restaurant['isAcceptingOrders'] == true,
      items: asList(json['items']).map(CartLine.fromJson).toList(growable: false),
      itemsSubtotal: asMoney(json['itemsSubtotal']),
      minimumOrderAmount: asMoney(json['minimumOrderAmount']),
      meetsMinimum: json['meetsMinimum'] == true,
      hasUnavailableItems: json['hasUnavailableItems'] == true,
      hasPriceChanges: json['hasPriceChanges'] == true,
      restaurantLogoUrl: restaurant['logoUrl'] as String?,
      prepMinutes: toIntOrNull(restaurant['prepMinutes']),
    );
  }
}

class FoodCharge {
  const FoodCharge({
    required this.currency,
    required this.itemsSubtotal,
    required this.deliveryFee,
    required this.serviceFee,
    required this.tax,
    required this.discount,
    required this.total,
  });

  final String currency;
  final String itemsSubtotal;
  final String deliveryFee;
  final String serviceFee;
  final String tax;
  final String discount;
  final String total;

  factory FoodCharge.fromJson(Map<String, dynamic> json, {String currency = 'LKR'}) => FoodCharge(
        currency: (json['currency'] ?? currency) as String,
        itemsSubtotal: asMoney(json['itemsSubtotal']),
        deliveryFee: asMoney(json['deliveryFee']),
        serviceFee: asMoney(json['serviceFee']),
        tax: asMoney(json['tax']),
        discount: asMoney(json['discount']),
        total: asMoney(json['total']),
      );
}

class PlacedFoodOrder {
  const PlacedFoodOrder({
    required this.orderId,
    required this.reference,
    required this.status,
    required this.charge,
    this.estimatedPrepMinutes,
    this.estimatedDeliveryMinutes,
  });

  final String orderId;
  final String reference;
  final String status;
  final FoodCharge charge;
  final int? estimatedPrepMinutes;
  final int? estimatedDeliveryMinutes;

  factory PlacedFoodOrder.fromJson(Map<String, dynamic> json) => PlacedFoodOrder(
        orderId: json['orderId'] as String,
        reference: (json['reference'] ?? '') as String,
        status: asEnum(json['status'], 'PLACED'),
        charge: FoodCharge.fromJson(
          (json['charge'] ?? const {}) as Map<String, dynamic>,
          currency: (json['currency'] ?? 'LKR') as String,
        ),
        estimatedPrepMinutes: toIntOrNull(json['estimatedPrepMinutes']),
        estimatedDeliveryMinutes: toIntOrNull(json['estimatedDeliveryMinutes']),
      );
}

class FoodOrderItem {
  const FoodOrderItem({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    this.notes,
  });

  final String name;
  final int quantity;
  final String unitPrice;
  final String lineTotal;
  final String? notes;

  factory FoodOrderItem.fromJson(Map<String, dynamic> json) => FoodOrderItem(
        name: (json['name'] ?? '') as String,
        quantity: toInt(json['quantity'], fallback: 1),
        unitPrice: asMoney(json['unitPrice']),
        lineTotal: asMoney(json['lineTotal']),
        notes: json['notes'] as String?,
      );
}

class CourierSummary {
  const CourierSummary({required this.firstName, this.avatarUrl, this.rating, this.phone});

  final String firstName;
  final String? avatarUrl;
  final String? rating;
  final String? phone;

  factory CourierSummary.fromJson(Map<String, dynamic> json) => CourierSummary(
        firstName: (json['firstName'] ?? '') as String,
        avatarUrl: json['avatarUrl'] as String?,
        rating: json['rating'] as String?,
        phone: json['phone'] as String?,
      );
}

class FoodOrderDetail {
  const FoodOrderDetail({
    required this.id,
    required this.reference,
    required this.status,
    required this.restaurantId,
    required this.restaurantName,
    required this.restaurantAddress,
    required this.items,
    required this.charge,
    required this.deliveryAddress,
    required this.progress,
    this.restaurantLogoUrl,
    this.paymentMethod,
    this.paymentStatus,
    this.courier,
    this.deliveryNote,
    this.estimatedPrepMinutes,
    this.cancellationReason,
    this.rejectionReason,
  });

  final String id;
  final String reference;
  final String status;
  final String restaurantId;
  final String restaurantName;
  final String restaurantAddress;
  final List<FoodOrderItem> items;
  final FoodCharge charge;
  final String deliveryAddress;
  final List<FoodProgressEntry> progress;
  final String? restaurantLogoUrl;
  final String? paymentMethod;
  final String? paymentStatus;
  final CourierSummary? courier;
  final String? deliveryNote;
  final int? estimatedPrepMinutes;
  final String? cancellationReason;
  final String? rejectionReason;

  bool get isActive => !const {'DELIVERED', 'CANCELLED', 'REJECTED'}.contains(status);

  /// Cancellation is only plausible before the kitchen commits. The backend
  /// owns the real rule and will refuse otherwise.
  bool get canCancel => const {'PLACED', 'PENDING_PAYMENT'}.contains(status);

  factory FoodOrderDetail.fromJson(Map<String, dynamic> json) {
    final restaurant = json['restaurant'] is Map ? json['restaurant'] as Map : const {};
    final payment = json['payment'];
    final delivery = json['delivery'] is Map ? json['delivery'] as Map : const {};

    return FoodOrderDetail(
      id: json['id'] as String,
      reference: (json['reference'] ?? '') as String,
      status: asEnum(json['status'], 'PLACED'),
      restaurantId: (restaurant['id'] ?? '') as String,
      restaurantName: (restaurant['name'] ?? '') as String,
      restaurantAddress: (restaurant['address'] ?? '') as String,
      items: asList(json['items']).map(FoodOrderItem.fromJson).toList(growable: false),
      charge: FoodCharge.fromJson((json['charge'] ?? const {}) as Map<String, dynamic>),
      deliveryAddress: (delivery['address'] ?? '') as String,
      progress: asList(json['progress']).map(FoodProgressEntry.fromJson).toList(growable: false),
      restaurantLogoUrl: restaurant['logoUrl'] as String?,
      paymentMethod: payment is Map ? payment['method'] as String? : null,
      paymentStatus: payment is Map ? payment['status'] as String? : null,
      courier: json['courier'] is Map<String, dynamic>
          ? CourierSummary.fromJson(json['courier'] as Map<String, dynamic>)
          : null,
      deliveryNote: delivery['note'] as String?,
      estimatedPrepMinutes: toIntOrNull(json['estimatedPrepMinutes']),
      cancellationReason: json['cancellationReason'] as String?,
      rejectionReason: json['rejectionReason'] as String?,
    );
  }
}

class FoodProgressEntry {
  const FoodProgressEntry({required this.status, this.at, this.note});

  final String status;
  final DateTime? at;
  final String? note;

  factory FoodProgressEntry.fromJson(Map<String, dynamic> json) => FoodProgressEntry(
        status: asEnum(json['status'], 'PLACED'),
        at: toDate(json['at']),
        note: json['note'] as String?,
      );
}

class FoodOrderTracking {
  const FoodOrderTracking({
    required this.orderId,
    required this.reference,
    required this.status,
    required this.restaurantName,
    required this.steps,
    this.courierFirstName,
    this.deliveryStatus,
    this.estimatedMinutesRemaining,
  });

  final String orderId;
  final String reference;
  final String status;
  final String restaurantName;
  final List<FoodProgressEntry> steps;
  final String? courierFirstName;
  final String? deliveryStatus;
  final int? estimatedMinutesRemaining;

  factory FoodOrderTracking.fromJson(Map<String, dynamic> json) => FoodOrderTracking(
        orderId: json['orderId'] as String,
        reference: (json['reference'] ?? '') as String,
        status: asEnum(json['status'], 'PLACED'),
        restaurantName: (json['restaurantName'] ?? '') as String,
        steps: asList(json['steps']).map(FoodProgressEntry.fromJson).toList(growable: false),
        courierFirstName: json['courierFirstName'] as String?,
        deliveryStatus: json['deliveryStatus'] as String?,
        estimatedMinutesRemaining: toIntOrNull(json['estimatedMinutesRemaining']),
      );
}

class FoodOrderHistoryItem {
  const FoodOrderHistoryItem({
    required this.id,
    required this.reference,
    required this.status,
    required this.total,
    required this.currency,
    required this.restaurantName,
    required this.itemLines,
    this.restaurantLogoUrl,
    this.placedAt,
    this.deliveredAt,
  });

  final String id;
  final String reference;
  final String status;
  final String total;
  final String currency;
  final String restaurantName;
  final int itemLines;
  final String? restaurantLogoUrl;
  final DateTime? placedAt;
  final DateTime? deliveredAt;

  factory FoodOrderHistoryItem.fromJson(Map<String, dynamic> json) {
    final restaurant = json['restaurant'] is Map ? json['restaurant'] as Map : const {};

    return FoodOrderHistoryItem(
      id: json['id'] as String,
      reference: (json['reference'] ?? '') as String,
      status: asEnum(json['status'], 'PLACED'),
      total: asMoney(json['total']),
      currency: (json['currency'] ?? 'LKR') as String,
      restaurantName: (restaurant['name'] ?? '') as String,
      itemLines: toInt(json['itemLines']),
      restaurantLogoUrl: restaurant['logoUrl'] as String?,
      placedAt: toDate(json['placedAt']),
      deliveredAt: toDate(json['deliveredAt']),
    );
  }
}
