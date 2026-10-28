import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/location/location_providers.dart';
import '../../core/providers.dart';
import '../../core/realtime/live_updates.dart';
import '../../models/common.dart';
import '../../models/food.dart';

/// The restaurant list, located when the device position is already known.
final restaurantsProvider =
    FutureProvider.autoDispose.family<CursorPage<RestaurantSummary>, String>((ref, query) {
  final near = ref.watch(lastKnownLocationProvider).value?.point;
  return ref.watch(apiProvider).food.restaurants(query: query, near: near, limit: 20);
});

final restaurantProvider =
    FutureProvider.autoDispose.family<RestaurantDetail, String>((ref, idOrSlug) {
  return ref.watch(apiProvider).food.restaurant(idOrSlug);
});

/// Every open cart. The backend keeps one per restaurant, which is why this is
/// a list rather than a single cart.
final cartsProvider = FutureProvider.autoDispose<List<Cart>>(
  (ref) => ref.watch(apiProvider).food.carts(),
);

/// One restaurant's cart, as the server holds it.
final cartProvider = FutureProvider.autoDispose.family<Cart?, String>((ref, restaurantId) async {
  try {
    return await ref.watch(apiProvider).food.cart(restaurantId);
  } on ApiException catch (error) {
    // Not having a cart yet is a normal state, not a failure.
    if (error.kind == ApiErrorKind.notFound) return null;
    rethrow;
  }
});

/// Cart mutations.
///
/// Every one of these endpoints returns the recalculated cart, and the app
/// throws its copy away and re-reads rather than adjusting a quantity or a
/// subtotal locally. That is what keeps what is on screen identical to what
/// checkout will charge — availability, price changes and the minimum-order
/// check included.
class CartActions {
  const CartActions(this._ref);

  final Ref _ref;

  Future<Cart> add({
    required String restaurantId,
    required String menuItemId,
    int quantity = 1,
    String? notes,
  }) async {
    final cart = await _ref.read(apiProvider).food.addItem(
          menuItemId: menuItemId,
          quantity: quantity,
          notes: notes,
        );
    _refresh(restaurantId);
    return cart;
  }

  Future<void> setQuantity({
    required String restaurantId,
    required String cartItemId,
    required int quantity,
  }) async {
    // Zero is a removal, which is a different endpoint; sending it as an update
    // would be a quantity the backend rejects.
    if (quantity <= 0) {
      await _ref.read(apiProvider).food.removeItem(cartItemId);
    } else {
      await _ref.read(apiProvider).food.updateItem(cartItemId, quantity: quantity);
    }
    _refresh(restaurantId);
  }

  Future<void> remove({required String restaurantId, required String cartItemId}) async {
    await _ref.read(apiProvider).food.removeItem(cartItemId);
    _refresh(restaurantId);
  }

  Future<void> clear(String restaurantId) async {
    await _ref.read(apiProvider).food.clearCart(restaurantId);
    _refresh(restaurantId);
  }

  void _refresh(String restaurantId) {
    _ref.invalidate(cartProvider(restaurantId));
    _ref.invalidate(cartsProvider);
  }
}

final cartActionsProvider = Provider<CartActions>(CartActions.new);

final foodOrdersProvider = FutureProvider.autoDispose<CursorPage<FoodOrderHistoryItem>>(
  (ref) => ref.watch(apiProvider).food.orders(limit: 20),
);

/// Polls one order while it is still in progress.
///
/// There is no push transport, so this is how an order screen stays current. It
/// stops on its own once the order reaches a terminal state.
final foodOrderStreamProvider =
    StreamProvider.autoDispose.family<FoodOrderDetail, String>((ref, orderId) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<FoodOrderDetail>(
    () => api.food.order(orderId),
    interval: const Duration(seconds: 15),
    stopWhen: (order) => !order.isActive,
  );
});
