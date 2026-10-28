import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/api_exception.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../models/food.dart';
import 'food_providers.dart';

class RestaurantScreen extends ConsumerWidget {
  const RestaurantScreen({super.key, required this.restaurantId});

  final String restaurantId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final restaurant = ref.watch(restaurantProvider(restaurantId));
    final cart = ref.watch(cartProvider(restaurantId));

    return Scaffold(
      appBar: AppBar(title: Text(restaurant.value?.name ?? 'Restaurant')),
      body: restaurant.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(restaurantProvider(restaurantId)),
        ),
        data: (detail) => _Menu(detail: detail),
      ),
      bottomNavigationBar: cart.value == null || cart.value!.isEmpty
          ? null
          : _CartBar(cart: cart.value!),
    );
  }
}

class _Menu extends ConsumerStatefulWidget {
  const _Menu({required this.detail});

  final RestaurantDetail detail;

  @override
  ConsumerState<_Menu> createState() => _MenuState();
}

class _MenuState extends ConsumerState<_Menu> {
  String? _categoryId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final detail = widget.detail;

    final categories = detail.categories.where((c) => c.items.isNotEmpty).toList(growable: false);
    final selected = _categoryId == null
        ? categories
        : categories.where((c) => c.id == _categoryId).toList(growable: false);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(detail.name, style: theme.textTheme.titleLarge),
                  Gap.xs,
                  Text(
                    '★ ${detail.ratingAverage} (${detail.ratingCount}) · ${detail.defaultPrepMinutes} min',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                  Gap.xs,
                  Text(
                    detail.addressLine,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (detail.description != null) ...[Gap.md, Text(detail.description!)],
        Gap.md,
        if (!detail.isAcceptingOrders)
          const InfoNote(
            icon: Icons.schedule_rounded,
            message: 'This restaurant is not accepting orders right now. You can still browse '
                'the menu.',
          ),
        Gap.md,
        Text(
          'Minimum order ${fmt.money(detail.minOrderAmount)}',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        Gap.lg,
        if (categories.length > 1)
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('All'),
                    selected: _categoryId == null,
                    onSelected: (_) => setState(() => _categoryId = null),
                  ),
                ),
                for (final category in categories)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(category.name),
                      selected: _categoryId == category.id,
                      onSelected: (_) => setState(() => _categoryId = category.id),
                    ),
                  ),
              ],
            ),
          ),
        Gap.lg,
        if (categories.isEmpty)
          const EmptyState(
            title: 'No menu yet',
            message: 'This restaurant has not published any dishes.',
            icon: Icons.restaurant_menu_outlined,
          ),
        for (final category in selected) ...[
          Text(category.name, style: theme.textTheme.titleMedium),
          Gap.sm,
          for (final item in category.items) ...[
            _MenuItemTile(
              item: item,
              restaurantId: detail.id,
              enabled: detail.isAcceptingOrders,
            ),
            Gap.sm,
          ],
          Gap.md,
        ],
      ],
    );
  }
}

class _MenuItemTile extends ConsumerStatefulWidget {
  const _MenuItemTile({required this.item, required this.restaurantId, required this.enabled});

  final MenuItem item;
  final String restaurantId;
  final bool enabled;

  @override
  ConsumerState<_MenuItemTile> createState() => _MenuItemTileState();
}

class _MenuItemTileState extends ConsumerState<_MenuItemTile> {
  bool _busy = false;

  Future<void> _add() async {
    setState(() => _busy = true);

    try {
      await ref.read(cartActionsProvider).add(
            restaurantId: widget.restaurantId,
            menuItemId: widget.item.id,
          );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${widget.item.name} added')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final item = widget.item;
    final available = item.available && widget.enabled;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name, style: theme.textTheme.titleSmall),
                  if (item.description != null) ...[
                    Gap.xs,
                    Text(
                      item.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ],
                  Gap.sm,
                  Text(
                    fmt.money(item.price, currency: item.currency),
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  if (!item.available)
                    Text(
                      'Unavailable',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.error),
                    ),
                ],
              ),
            ),
            Gap.md,
            IconButton.filledTonal(
              tooltip: 'Add to cart',
              onPressed: available && !_busy ? _add : null,
              icon: _busy
                  ? const SizedBox(
                      height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.add),
            ),
          ],
        ),
      ),
    );
  }
}

class _CartBar extends StatelessWidget {
  const _CartBar({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton(
          onPressed: () => context.push('/food/cart/${cart.restaurantId}'),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${cart.itemCount} ${cart.itemCount == 1 ? 'item' : 'items'}'),
              const Text('View cart'),
              Text(fmt.money(cart.itemsSubtotal, currency: cart.currency)),
            ],
          ),
        ),
      ),
    );
  }
}
