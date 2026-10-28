import 'package:flutter_test/flutter_test.dart';
import 'package:tugo_mobile/core/providers.dart';
import 'package:tugo_mobile/features/food/food_providers.dart';
import 'package:tugo_mobile/models/common.dart';

import '../support/fake_http.dart';
import '../support/fixtures.dart';
import '../support/harness.dart';

void main() {
  group('restaurants', () {
    test('lists restaurants and reads the fields a person chooses on', () async {
      final http = FakeHttp()
        ..on(
          'GET /restaurants',
          Reply.ok({
            'items': [
              {
                'id': 'rest-1',
                'name': 'Green Cabin',
                'slug': 'green-cabin',
                'description': 'Sri Lankan',
                'isAcceptingOrders': true,
                'prepMinutes': 20,
                'minOrderAmount': '500.00',
                'rating': {'average': '4.60', 'count': 128},
                'address': 'Colombo 03',
                'distanceM': 1800,
                'withinDeliveryRange': true,
              },
            ],
            'nextCursor': null,
            'hasMore': false,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final page = await container.read(apiProvider).food.restaurants();

      expect(page.items, hasLength(1));
      expect(page.items.first.name, 'Green Cabin');
      expect(page.items.first.minOrderAmount, '500.00');
      expect(page.items.first.withinDeliveryRange, isTrue);
    });

    test('distinguishes "no location given" from "out of range"', () async {
      final http = FakeHttp()
        ..on(
          'GET /restaurants',
          Reply.ok({
            'items': [
              {
                'id': 'r',
                'name': 'X',
                'slug': 'x',
                'isAcceptingOrders': true,
                'prepMinutes': 10,
                'minOrderAmount': '0.00',
                'rating': {'average': '0.00', 'count': 0},
                'address': 'A',
                'distanceM': null,
                'withinDeliveryRange': null,
              },
            ],
            'hasMore': false,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final page = await container.read(apiProvider).food.restaurants();

      // Null is not false: the interface renders these differently.
      expect(page.items.first.withinDeliveryRange, isNull);
    });

    test('loads a menu grouped into categories', () async {
      final http = FakeHttp()
        ..on(
          'GET /restaurants/rest-1',
          Reply.ok({
            'id': 'rest-1',
            'name': 'Green Cabin',
            'slug': 'green-cabin',
            'phone': '+94112345678',
            'isAcceptingOrders': true,
            'defaultPrepMinutes': 20,
            'minOrderAmount': '500.00',
            'rating': {'average': '4.60', 'count': 128},
            'addressLine': 'Colombo 03',
            'latitude': '6.9',
            'longitude': '79.85',
            'deliveryRadiusM': 6000,
            'hours': const [],
            'categories': [
              {
                'id': 'cat-1',
                'name': 'Rice & Curry',
                'sortOrder': 0,
                'items': [
                  {
                    'id': 'item-1',
                    'name': 'Kottu',
                    'description': 'Chicken',
                    'price': '750.00',
                    'currency': 'LKR',
                    'imageUrl': null,
                    'available': true,
                    'prepMinutes': 15,
                  },
                  {
                    'id': 'item-2',
                    'name': 'Sold out dish',
                    'description': null,
                    'price': '600.00',
                    'currency': 'LKR',
                    'imageUrl': null,
                    'available': false,
                    'prepMinutes': null,
                  },
                ],
              },
            ],
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final detail = await container.read(apiProvider).food.restaurant('rest-1');

      expect(detail.categories, hasLength(1));
      expect(detail.categories.first.items, hasLength(2));
      expect(detail.categories.first.items[0].available, isTrue);
      expect(detail.categories.first.items[1].available, isFalse);
    });
  });

  group('cart', () {
    test('adds an item and takes the whole recalculated cart back', () async {
      final http = FakeHttp()
        ..on('GET /food/carts/rest-1', Reply.ok(cartJson(quantity: 1)))
        ..on('POST /food/carts/items', Reply.ok(cartJson(quantity: 1)));

      final container = buildContainer(http, session: sessionTokens);

      final cart = await container.read(cartActionsProvider).add(
            restaurantId: 'rest-1',
            menuItemId: 'item-1',
          );

      // The subtotal is the server's, not a local sum.
      expect(cart.itemsSubtotal, '750.00');
      expect(cart.itemCount, 1);
    });

    test('a quantity change goes to the update endpoint', () async {
      final http = FakeHttp()
        ..on('PUT /food/carts/items/line-1', Reply.ok(cartJson(quantity: 3)))
        ..on('GET /food/carts/rest-1', Reply.ok(cartJson(quantity: 3)));

      final container = buildContainer(http, session: sessionTokens);

      await container.read(cartActionsProvider).setQuantity(
            restaurantId: 'rest-1',
            cartItemId: 'line-1',
            quantity: 3,
          );

      final sent = http.forRoute('PUT /food/carts/items/line-1').single.body as Map;
      expect(sent['quantity'], 3);
    });

    test('decreasing to zero removes the line instead of sending quantity 0', () async {
      final http = FakeHttp()
        ..on('DELETE /food/carts/items/line-1', Reply.ok(cartJson(quantity: 1)))
        ..on('GET /food/carts/rest-1', Reply.ok(cartJson(quantity: 1)));

      final container = buildContainer(http, session: sessionTokens);

      await container.read(cartActionsProvider).setQuantity(
            restaurantId: 'rest-1',
            cartItemId: 'line-1',
            quantity: 0,
          );

      expect(http.hits('DELETE /food/carts/items/line-1'), 1);
      expect(http.hits('PUT /food/carts/items/line-1'), 0);
    });

    test('blocks checkout below the minimum order', () async {
      final http = FakeHttp()
        ..on('GET /food/carts/rest-1', Reply.ok(cartJson(quantity: 1, meetsMinimum: false)));

      final container = buildContainer(http, session: sessionTokens);
      final cart = await container.read(cartProvider('rest-1').future);

      expect(cart!.meetsMinimum, isFalse);
      expect(cart.canCheckout, isFalse);
    });

    test('blocks checkout when an item has become unavailable', () async {
      final http = FakeHttp()
        ..on('GET /food/carts/rest-1', Reply.ok(cartJson(unavailable: true)));

      final container = buildContainer(http, session: sessionTokens);
      final cart = await container.read(cartProvider('rest-1').future);

      expect(cart!.hasUnavailableItems, isTrue);
      expect(cart.canCheckout, isFalse);
    });

    test('an absent cart is an empty state, not a failure', () async {
      final http = FakeHttp()
        ..on('GET /food/carts/rest-9', Reply.error(404, 'NOT_FOUND', 'No cart'));

      final container = buildContainer(http, session: sessionTokens);
      expect(await container.read(cartProvider('rest-9').future), isNull);
    });
  });

  group('checkout', () {
    test('places an order and reports the backend total', () async {
      final http = FakeHttp()
        ..on(
          'POST /food/carts/rest-1/checkout',
          Reply.ok({
            'orderId': 'order-1',
            'reference': 'FO-1001',
            'status': 'PLACED',
            'placedAt': '2026-09-10T08:00:00.000Z',
            'currency': 'LKR',
            'charge': {
              'itemsSubtotal': '1500.00',
              'deliveryFee': '250.00',
              'serviceFee': '75.00',
              'tax': '0.00',
              'discount': '150.00',
              'total': '1675.00',
            },
            'estimatedPrepMinutes': 20,
            'estimatedDeliveryMinutes': 35,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);

      final order = await container.read(apiProvider).food.checkout(
            restaurantId: 'rest-1',
            deliveryAddress: const Place(address: 'Home', lat: 6.9, lng: 79.85),
            paymentMethod: 'CASH',
            promotionCode: 'SAVE10',
          );

      expect(order.orderId, 'order-1');
      // Every component is the server's; the app adds nothing up.
      expect(order.charge.total, '1675.00');
      expect(order.charge.discount, '150.00');

      final sent = http.forRoute('POST /food/carts/rest-1/checkout').single.body as Map;
      expect(sent['paymentMethod'], 'CASH');
      expect(sent['promotionCode'], 'SAVE10');
    });

    test('surfaces a refused payment method rather than faking success', () async {
      final http = FakeHttp()
        ..on(
          'POST /food/carts/rest-1/checkout',
          Reply.error(
            400,
            'PAYMENT_FAILED',
            'Card and online payments are not available yet. Please choose cash or wallet.',
          ),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(apiProvider).food.checkout(
              restaurantId: 'rest-1',
              deliveryAddress: const Place(address: 'Home', lat: 6.9, lng: 79.85),
              paymentMethod: 'CARD',
            ),
        throwsA(anything),
      );
    });
  });

  group('order tracking', () {
    test('reads the progress steps and knows when an order is still live', () async {
      final http = FakeHttp()
        ..on(
          'GET /food/orders/order-1',
          Reply.ok({
            'id': 'order-1',
            'reference': 'FO-1001',
            'status': 'PREPARING',
            'restaurant': {
              'id': 'rest-1',
              'name': 'Green Cabin',
              'slug': 'green-cabin',
              'logoUrl': null,
              'address': 'Colombo 03',
              'lat': 6.9,
              'lng': 79.85,
            },
            'items': [
              {
                'name': 'Kottu',
                'quantity': 2,
                'unitPrice': '750.00',
                'lineTotal': '1500.00',
                'notes': null,
              },
            ],
            'charge': {
              'currency': 'LKR',
              'itemsSubtotal': '1500.00',
              'deliveryFee': '250.00',
              'serviceFee': '75.00',
              'tax': '0.00',
              'discount': '0.00',
              'total': '1825.00',
            },
            'payment': {'method': 'CASH', 'status': 'PENDING'},
            'delivery': {'address': 'Home', 'note': null, 'status': null},
            'courier': null,
            'timeline': const {},
            'progress': [
              {'status': 'PLACED', 'at': '2026-09-10T08:00:00.000Z', 'note': null},
              {'status': 'ACCEPTED', 'at': '2026-09-10T08:02:00.000Z', 'note': null},
              {'status': 'PREPARING', 'at': '2026-09-10T08:05:00.000Z', 'note': null},
            ],
            'estimatedPrepMinutes': 20,
            'cancellationReason': null,
            'rejectionReason': null,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final order = await container.read(apiProvider).food.order('order-1');

      expect(order.status, 'PREPARING');
      expect(order.progress, hasLength(3));
      expect(order.isActive, isTrue);
      // Once the kitchen has started, cancelling is not offered.
      expect(order.canCancel, isFalse);
      expect(order.charge.total, '1825.00');
    });

    test('a delivered order is neither active nor cancellable', () async {
      final http = FakeHttp()
        ..on(
          'GET /food/orders/order-2',
          Reply.ok({
            'id': 'order-2',
            'reference': 'FO-1002',
            'status': 'DELIVERED',
            'restaurant': {'id': 'r', 'name': 'X', 'slug': 'x', 'address': 'A', 'lat': 0, 'lng': 0},
            'items': const [],
            'charge': {
              'currency': 'LKR',
              'itemsSubtotal': '0.00',
              'deliveryFee': '0.00',
              'serviceFee': '0.00',
              'tax': '0.00',
              'discount': '0.00',
              'total': '0.00',
            },
            'delivery': {'address': 'Home'},
            'progress': const [],
            'timeline': const {},
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final order = await container.read(apiProvider).food.order('order-2');

      expect(order.isActive, isFalse);
      expect(order.canCancel, isFalse);
    });
  });
}
