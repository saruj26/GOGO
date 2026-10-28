import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/api_exception.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/payment_picker.dart';
import '../../core/widgets/states.dart';
import '../../models/common.dart';
import '../payments/wallet_providers.dart';
import '../rides/location_search_screen.dart';
import 'food_providers.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, required this.restaurantId});

  final String restaurantId;

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _note = TextEditingController();
  final _promo = TextEditingController();

  Place? _address;
  String _paymentMethod = 'CASH';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    _promo.dispose();
    super.dispose();
  }

  Future<void> _pickAddress() async {
    final place = await Navigator.of(context).push<Place>(
      MaterialPageRoute(builder: (_) => const LocationSearchScreen(title: 'Delivery address')),
    );

    if (place == null || !mounted) return;
    setState(() => _address = place);
  }

  Future<void> _placeOrder() async {
    if (_address == null) {
      setState(() => _error = 'Choose where this should be delivered.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final order = await ref.read(apiProvider).food.checkout(
            restaurantId: widget.restaurantId,
            deliveryAddress: _address!,
            paymentMethod: _paymentMethod,
            deliveryNote: _note.text.trim(),
            promotionCode: _promo.text.trim(),
          );

      ref.invalidate(cartsProvider);
      ref.invalidate(cartProvider(widget.restaurantId));
      ref.invalidate(foodOrdersProvider);

      if (!mounted) return;
      context.go('/food/order/${order.orderId}');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider(widget.restaurantId));
    final wallet = ref.watch(walletProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: cart.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(error: error),
        data: (value) {
          if (value == null || value.isEmpty) {
            return const EmptyState(
              title: 'Nothing to check out',
              message: 'Your cart is empty.',
              icon: Icons.shopping_bag_outlined,
            );
          }

          return ListView(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 8,
              bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
            ),
            children: [
              SectionCard(
                title: 'Delivering to',
                child: InkWell(
                  onTap: _pickAddress,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 52),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.place_outlined, size: 18),
                        Gap.md,
                        Expanded(
                          child: Text(
                            _address?.address ?? 'Choose a delivery address',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: _address == null
                                  ? theme.colorScheme.outline
                                  : theme.colorScheme.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Gap.lg,
              SectionCard(
                title: 'Order',
                child: Column(
                  children: [
                    for (final line in value.items)
                      DetailRow(
                        label: '${line.quantity} × ${line.name}',
                        value: fmt.money(line.lineTotal, currency: value.currency),
                      ),
                    const Divider(height: 24),
                    DetailRow(
                      label: 'Items subtotal',
                      value: fmt.money(value.itemsSubtotal, currency: value.currency),
                      emphasise: true,
                    ),
                    Gap.sm,
                    // Deliberately not a total: delivery, service fee, tax and
                    // any discount are priced by the backend when the order is
                    // placed, and quoting a figure here would risk showing one
                    // the receipt disagrees with.
                    Text(
                      'Delivery, service fee, tax and any promotion are applied when you place '
                      'the order. The final total is shown on the confirmation.',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ],
                ),
              ),
              Gap.lg,
              SectionCard(
                title: 'Payment',
                child: PaymentPicker(
                  value: _paymentMethod,
                  onChanged: (method) => setState(() => _paymentMethod = method),
                  walletBalance: wallet.value?.balance,
                  walletCurrency: wallet.value?.currency ?? 'LKR',
                  walletFrozen: wallet.value?.frozen ?? false,
                ),
              ),
              Gap.lg,
              SectionCard(
                title: 'Extras',
                child: Column(
                  children: [
                    AppField(
                      label: 'Promo code (optional)',
                      controller: _promo,
                      hint: 'Enter a code',
                      enabled: !_busy,
                    ),
                    Gap.lg,
                    AppField(
                      label: 'Delivery note (optional)',
                      controller: _note,
                      hint: 'e.g. leave at reception',
                      maxLines: 2,
                      maxLength: 200,
                      enabled: !_busy,
                    ),
                  ],
                ),
              ),
              if (_error != null) ...[Gap.lg, FormError(message: _error!)],
              Gap.xl,
              BusyButton(label: 'Place order', busy: _busy, onPressed: _placeOrder),
            ],
          );
        },
      ),
    );
  }
}
