import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../models/food.dart';
import 'food_providers.dart';

class RestaurantsScreen extends ConsumerStatefulWidget {
  const RestaurantsScreen({super.key});

  @override
  ConsumerState<RestaurantsScreen> createState() => _RestaurantsScreenState();
}

class _RestaurantsScreenState extends ConsumerState<RestaurantsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 350),
      () => setState(() => _query = value.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final restaurants = ref.watch(restaurantsProvider(_query));
    final carts = ref.watch(cartsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Food')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextField(
                controller: _search,
                onChanged: _onChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search restaurants or dishes',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close),
                          tooltip: 'Clear',
                          onPressed: () {
                            _search.clear();
                            _onChanged('');
                          },
                        ),
                ),
              ),
            ),
            carts.maybeWhen(
              data: (open) => open.isEmpty
                  ? const SizedBox.shrink()
                  : _OpenCartsStrip(carts: open),
              orElse: () => const SizedBox.shrink(),
            ),
            Expanded(
              child: restaurants.when(
                loading: () => const LoadingState(),
                error: (error, _) => ErrorState(
                  error: error,
                  onRetry: () => ref.invalidate(restaurantsProvider(_query)),
                ),
                data: (page) => page.items.isEmpty
                    ? EmptyState(
                        title: _query.isEmpty ? 'No restaurants yet' : 'Nothing matched',
                        message: _query.isEmpty
                            ? 'There are no restaurants available right now.'
                            : 'Try a different search.',
                        icon: Icons.restaurant_outlined,
                      )
                    : RefreshIndicator(
                        onRefresh: () async => ref.invalidate(restaurantsProvider(_query)),
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                          itemCount: page.items.length,
                          separatorBuilder: (_, _) => Gap.md,
                          itemBuilder: (context, index) =>
                              _RestaurantCard(restaurant: page.items[index]),
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpenCartsStrip extends StatelessWidget {
  const _OpenCartsStrip({required this.carts});

  final List<Cart> carts;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        itemCount: carts.length,
        separatorBuilder: (_, _) => Gap.sm,
        itemBuilder: (context, index) {
          final cart = carts[index];
          return ActionChip(
            avatar: const Icon(Icons.shopping_bag_outlined, size: 18),
            label: Text('${cart.restaurantName} · ${cart.itemCount}'),
            onPressed: () => context.push('/food/cart/${cart.restaurantId}'),
          );
        },
      ),
    );
  }
}

class _RestaurantCard extends StatelessWidget {
  const _RestaurantCard({required this.restaurant});

  final RestaurantSummary restaurant;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final closed = !restaurant.isAcceptingOrders;

    return Card(
      child: InkWell(
        onTap: () => context.push('/food/restaurant/${restaurant.id}'),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.storefront_rounded,
                  color: closed ? theme.colorScheme.outline : AppColors.warning,
                ),
              ),
              Gap.md,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      restaurant.name,
                      style: theme.textTheme.titleSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Gap.xs,
                    Text(
                      [
                        '★ ${restaurant.ratingAverage} (${restaurant.ratingCount})',
                        '${restaurant.prepMinutes} min',
                        if (restaurant.distanceM != null) fmt.distance(restaurant.distanceM),
                      ].join(' · '),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                    if (closed || restaurant.withinDeliveryRange == false) ...[
                      Gap.xs,
                      Text(
                        closed ? 'Closed right now' : 'Outside their delivery area',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.error),
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}
