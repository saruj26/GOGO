import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../models/food.dart';
import '../ratings/rating_sheet.dart';
import 'food_providers.dart';

class FoodOrderScreen extends ConsumerWidget {
  const FoodOrderScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(foodOrderStreamProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your order'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/food'),
        ),
      ),
      body: order.when(
        loading: () => const LoadingState(message: 'Loading your order…'),
        error: (error, _) => order.value == null
            ? ErrorState(
                error: error,
                onRetry: () => ref.invalidate(foodOrderStreamProvider(orderId)),
              )
            : _OrderBody(order: order.value!, stale: true),
        data: (value) => _OrderBody(order: value),
      ),
    );
  }
}

class _OrderBody extends ConsumerWidget {
  const _OrderBody({required this.order, this.stale = false});

  final FoodOrderDetail order;
  final bool stale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        if (stale) ...[
          const InfoNote(
            icon: Icons.cloud_off_rounded,
            message: 'Showing the last update we received. We are still trying to reconnect.',
          ),
          Gap.md,
        ],
        Row(
          children: [
            StatusBadge(status: order.status, labels: foodStatusLabel),
            const Spacer(),
            Text(
              order.reference,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
        Gap.lg,
        SectionCard(
          title: order.restaurantName,
          child: _Progress(order: order),
        ),
        Gap.lg,
        if (order.rejectionReason != null) ...[
          InfoNote(icon: Icons.cancel_outlined, message: order.rejectionReason!),
          Gap.lg,
        ],
        if (order.cancellationReason != null) ...[
          InfoNote(icon: Icons.cancel_outlined, message: order.cancellationReason!),
          Gap.lg,
        ],
        if (order.courier != null) ...[_CourierCard(courier: order.courier!), Gap.lg],
        SectionCard(
          title: 'Items',
          child: Column(
            children: [
              for (final item in order.items)
                DetailRow(
                  label: '${item.quantity} × ${item.name}',
                  value: fmt.money(item.lineTotal, currency: order.charge.currency),
                ),
            ],
          ),
        ),
        Gap.lg,
        SectionCard(
          title: 'Charge',
          child: Column(
            children: [
              DetailRow(
                label: 'Items',
                value: fmt.money(order.charge.itemsSubtotal, currency: order.charge.currency),
              ),
              DetailRow(
                label: 'Delivery',
                value: fmt.money(order.charge.deliveryFee, currency: order.charge.currency),
              ),
              DetailRow(
                label: 'Service fee',
                value: fmt.money(order.charge.serviceFee, currency: order.charge.currency),
              ),
              if (order.charge.tax != '0.00')
                DetailRow(
                  label: 'Tax',
                  value: fmt.money(order.charge.tax, currency: order.charge.currency),
                ),
              if (order.charge.discount != '0.00')
                DetailRow(
                  label: 'Discount',
                  value: '−${fmt.money(order.charge.discount, currency: order.charge.currency)}',
                  valueColor: AppColors.success,
                ),
              const Divider(height: 24),
              DetailRow(
                label: 'Total',
                value: fmt.money(order.charge.total, currency: order.charge.currency),
                emphasise: true,
              ),
              if (order.paymentMethod != null)
                DetailRow(
                  label: 'Payment',
                  value:
                      '${labelFor(paymentMethodLabel, order.paymentMethod!)} · ${labelFor(paymentStatusLabel, order.paymentStatus ?? 'PENDING')}',
                ),
            ],
          ),
        ),
        Gap.lg,
        SectionCard(
          title: 'Delivering to',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(order.deliveryAddress),
              if (order.deliveryNote != null && order.deliveryNote!.isNotEmpty) ...[
                Gap.sm,
                Text(
                  order.deliveryNote!,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ],
          ),
        ),
        Gap.lg,
        if (order.canCancel) _CancelOrderButton(order: order),
        if (order.status == 'DELIVERED')
          FilledButton.icon(
            onPressed: () => showRatingSheet(
              context,
              kind: 'food',
              id: order.id,
              title: 'Rate your order',
            ),
            icon: const Icon(Icons.star_rounded),
            label: const Text('Rate this order'),
          ),
      ],
    );
  }
}

/// The order's journey, in the backend's own lifecycle order.
///
/// Steps the order has actually reached are filled in; the rest are shown as
/// still to come. A rejected or cancelled order leaves the sequence, so it is
/// reported separately rather than drawn as a step.
class _Progress extends StatelessWidget {
  const _Progress({required this.order});

  final FoodOrderDetail order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (const {'CANCELLED', 'REJECTED'}.contains(order.status)) {
      return Row(
        children: [
          Icon(Icons.cancel_outlined, color: theme.colorScheme.error),
          Gap.md,
          Expanded(child: Text(labelFor(foodStatusLabel, order.status))),
        ],
      );
    }

    final reached = {for (final entry in order.progress) entry.status: entry.at};
    final currentIndex = foodProgressSteps.indexOf(order.status);

    return Column(
      children: [
        for (var i = 0; i < foodProgressSteps.length; i++)
          _Step(
            label: labelFor(foodStatusLabel, foodProgressSteps[i]),
            at: reached[foodProgressSteps[i]],
            done: currentIndex >= 0 && i <= currentIndex,
            current: i == currentIndex,
            last: i == foodProgressSteps.length - 1,
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.label,
    required this.done,
    required this.current,
    required this.last,
    this.at,
  });

  final String label;
  final bool done;
  final bool current;
  final bool last;
  final DateTime? at;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colour = done ? theme.colorScheme.primary : theme.colorScheme.outlineVariant;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Icon(
                done ? Icons.check_circle : Icons.radio_button_unchecked,
                size: 20,
                color: colour,
              ),
              if (!last) Expanded(child: Container(width: 2, color: colour)),
            ],
          ),
          Gap.md,
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: current ? FontWeight.w700 : FontWeight.w400,
                        color: done
                            ? theme.colorScheme.onSurface
                            : theme.colorScheme.outline,
                      ),
                    ),
                  ),
                  if (at != null)
                    Text(
                      fmt.clockTime(at),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CourierCard extends StatelessWidget {
  const _CourierCard({required this.courier});

  final CourierSummary courier;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SectionCard(
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: theme.colorScheme.primaryContainer,
            child: Text(
              courier.firstName.isEmpty ? '?' : courier.firstName[0].toUpperCase(),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          Gap.md,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(courier.firstName, style: theme.textTheme.titleSmall),
                Text(
                  courier.rating == null ? 'Your courier' : '★ ${courier.rating}',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ),
          ),
          if (courier.phone != null)
            IconButton.filledTonal(
              tooltip: 'Call courier',
              onPressed: () => launchUrl(Uri.parse('tel:${courier.phone}')),
              icon: const Icon(Icons.phone),
            ),
        ],
      ),
    );
  }
}

class _CancelOrderButton extends ConsumerStatefulWidget {
  const _CancelOrderButton({required this.order});

  final FoodOrderDetail order;

  @override
  ConsumerState<_CancelOrderButton> createState() => _CancelOrderButtonState();
}

class _CancelOrderButtonState extends ConsumerState<_CancelOrderButton> {
  bool _busy = false;

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: const Text(
          'If the restaurant has already started preparing it, cancellation may not be possible.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel order'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);

    try {
      await ref.read(apiProvider).food.cancelOrder(widget.order.id);
      ref.invalidate(foodOrderStreamProvider(widget.order.id));
      ref.invalidate(foodOrdersProvider);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: _busy ? null : _cancel,
      style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
      icon: _busy
          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.close_rounded),
      label: const Text('Cancel order'),
    );
  }
}
