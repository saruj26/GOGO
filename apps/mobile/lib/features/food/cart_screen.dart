import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/api_exception.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../models/food.dart';
import 'food_providers.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key, required this.restaurantId});

  final String restaurantId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider(restaurantId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your cart'),
        actions: [
          if (cart.value != null && !cart.value!.isEmpty)
            IconButton(
              tooltip: 'Empty cart',
              icon: const Icon(Icons.delete_outline),
              onPressed: () => _confirmClear(context, ref),
            ),
        ],
      ),
      body: cart.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(cartProvider(restaurantId)),
        ),
        data: (value) => value == null || value.isEmpty
            ? EmptyState(
                title: 'Your cart is empty',
                message: 'Add something from the menu to get started.',
                icon: Icons.shopping_bag_outlined,
                action: FilledButton(
                  onPressed: () => context.go('/food'),
                  child: const Text('Browse restaurants'),
                ),
              )
            : _CartBody(cart: value),
      ),
    );
  }

  Future<void> _confirmClear(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Empty this cart?'),
        content: const Text('Everything in it will be removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Empty'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await ref.read(cartActionsProvider).clear(restaurantId);
  }
}

class _CartBody extends ConsumerWidget {
  const _CartBody({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              Text(cart.restaurantName, style: theme.textTheme.titleMedium),
              Gap.md,
              if (cart.hasUnavailableItems)
                const InfoNote(
                  icon: Icons.remove_shopping_cart_outlined,
                  message: 'Some items are no longer available. Remove them to continue.',
                ),
              if (cart.hasPriceChanges) ...[
                Gap.sm,
                const InfoNote(
                  icon: Icons.price_change_outlined,
                  message: 'Some prices changed since you added them. The new price is shown.',
                ),
              ],
              if (!cart.restaurantAcceptingOrders) ...[
                Gap.sm,
                const InfoNote(
                  icon: Icons.schedule_rounded,
                  message: 'This restaurant is not accepting orders right now.',
                ),
              ],
              Gap.md,
              for (final line in cart.items) ...[
                _CartLineTile(line: line, restaurantId: cart.restaurantId, currency: cart.currency),
                const Divider(height: 24),
              ],
              // The subtotal is the server's figure. The app never adds the
              // lines up itself: delivery, service fee, tax and any discount
              // are calculated at checkout by the backend.
              DetailRow(
                label: 'Items subtotal',
                value: fmt.money(cart.itemsSubtotal, currency: cart.currency),
                emphasise: true,
              ),
              if (!cart.meetsMinimum)
                Text(
                  'Minimum order is ${fmt.money(cart.minimumOrderAmount, currency: cart.currency)}.',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                ),
              Gap.md,
              Text(
                'Delivery, service fee and any discount are calculated at checkout.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ],
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton(
              onPressed: cart.canCheckout
                  ? () => context.push('/food/checkout/${cart.restaurantId}')
                  : null,
              child: const Text('Go to checkout'),
            ),
          ),
        ),
      ],
    );
  }
}

class _CartLineTile extends ConsumerStatefulWidget {
  const _CartLineTile({
    required this.line,
    required this.restaurantId,
    required this.currency,
  });

  final CartLine line;
  final String restaurantId;
  final String currency;

  @override
  ConsumerState<_CartLineTile> createState() => _CartLineTileState();
}

class _CartLineTileState extends ConsumerState<_CartLineTile> {
  bool _busy = false;

  Future<void> _change(int quantity) async {
    setState(() => _busy = true);

    try {
      await ref.read(cartActionsProvider).setQuantity(
            restaurantId: widget.restaurantId,
            cartItemId: widget.line.id,
            quantity: quantity,
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
    final line = widget.line;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(line.name, style: theme.textTheme.titleSmall),
              Gap.xs,
              Text(
                fmt.money(line.unitPrice, currency: widget.currency),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
              if (line.priceChanged)
                Text(
                  'Now ${fmt.money(line.currentPrice, currency: widget.currency)}',
                  style: theme.textTheme.bodySmall?.copyWith(color: AppColors.warning),
                ),
              if (!line.available)
                Text(
                  'No longer available',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                ),
              if (line.notes != null && line.notes!.isNotEmpty)
                Text(
                  line.notes!,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
            ],
          ),
        ),
        Gap.sm,
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              fmt.money(line.lineTotal, currency: widget.currency),
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            Gap.xs,
            Row(
              children: [
                IconButton(
                  // 44dp targets keep the steppers usable one-handed.
                  constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                  tooltip: line.quantity == 1 ? 'Remove' : 'Decrease',
                  onPressed: _busy ? null : () => _change(line.quantity - 1),
                  icon: Icon(line.quantity == 1 ? Icons.delete_outline : Icons.remove),
                ),
                SizedBox(
                  width: 28,
                  child: Center(
                    child: _busy
                        ? const SizedBox(
                            height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text('${line.quantity}', style: theme.textTheme.titleSmall),
                  ),
                ),
                IconButton(
                  constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                  tooltip: 'Increase',
                  onPressed: _busy ? null : () => _change(line.quantity + 1),
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}
