import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/format.dart' as fmt;
import '../../../core/format/labels.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/forms.dart';
import '../../../core/widgets/states.dart';
import '../driver_providers.dart';

/// What the driver has earned.
///
/// Every figure is the backend's. Commission, the net, and the uplift from
/// shared passengers are all computed server-side and recorded per job — the
/// app does not subtract one number from another to produce a third.
class DriverEarningsScreen extends ConsumerWidget {
  const DriverEarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(earningsSummaryProvider);
    final records = ref.watch(earningsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Earnings'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/driver'),
        ),
      ),
      body: summary.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(earningsSummaryProvider)),
        data: (totals) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(earningsSummaryProvider);
            ref.invalidate(earningsProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Net earnings',
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                      Gap.xs,
                      Text(
                        fmt.money(totals.net, currency: totals.currency),
                        style: theme.textTheme.headlineMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Gap.lg,
                      DetailRow(
                        label: 'Gross',
                        value: fmt.money(totals.gross, currency: totals.currency),
                      ),
                      DetailRow(
                        label: 'Platform commission',
                        value: '−${fmt.amount(totals.commission)}',
                      ),
                      if (totals.bonus != '0.00')
                        DetailRow(
                          label: 'Bonus',
                          value: fmt.money(totals.bonus, currency: totals.currency),
                          valueColor: AppColors.success,
                        ),
                      DetailRow(label: 'Completed jobs', value: '${totals.trips}'),
                    ],
                  ),
                ),
              ),
              Gap.lg,

              // Kept separate deliberately: what shared passengers added is the
              // platform's central claim to drivers, and the backend records it
              // as its own figure rather than leaving it to be inferred.
              Card(
                color: AppColors.shared.withValues(alpha: 0.07),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.groups_rounded, color: AppColors.shared),
                          Gap.md,
                          Expanded(
                            child: Text(
                              'From shared passengers',
                              style: theme.textTheme.titleMedium,
                            ),
                          ),
                        ],
                      ),
                      Gap.md,
                      Text(
                        fmt.money(totals.sharedNet, currency: totals.currency),
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppColors.shared,
                        ),
                      ),
                      Gap.xs,
                      Text(
                        totals.sharedCount == 0
                            ? 'Turn on shared passengers to earn extra on journeys you are '
                                'already making.'
                            : 'Across ${totals.sharedCount} extra ${totals.sharedCount == 1 ? 'passenger' : 'passengers'} '
                                'picked up along routes you were already driving.',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                    ],
                  ),
                ),
              ),
              Gap.lg,
              if (totals.byStatus.isNotEmpty) ...[
                SectionCard(
                  title: 'By payout status',
                  child: Column(
                    children: [
                      for (final bucket in totals.byStatus)
                        DetailRow(
                          label: '${labelFor(_payoutLabel, bucket.status)} (${bucket.count})',
                          value: fmt.money(bucket.net, currency: totals.currency),
                        ),
                    ],
                  ),
                ),
                Gap.lg,
              ],
              Text('Recent jobs', style: theme.textTheme.titleMedium),
              Gap.md,
              records.when(
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: LoadingState(),
                ),
                error: (error, _) => ErrorState(error: error, compact: true),
                data: (page) => page.items.isEmpty
                    ? const EmptyState(
                        title: 'No earnings yet',
                        message: 'Completed rides and deliveries will appear here.',
                        icon: Icons.payments_outlined,
                      )
                    : Column(
                        children: [
                          for (final record in page.items)
                            Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: record.isSharedIncrement
                                      ? AppColors.shared.withValues(alpha: 0.15)
                                      : theme.colorScheme.surfaceContainerHighest,
                                  child: Icon(
                                    record.isSharedIncrement
                                        ? Icons.groups_rounded
                                        : _iconFor(record.serviceType),
                                    size: 18,
                                    color: record.isSharedIncrement ? AppColors.shared : null,
                                  ),
                                ),
                                title: Text(
                                  record.isSharedIncrement
                                      ? 'Shared passenger'
                                      : labelFor(serviceLabel, record.serviceType ?? 'RIDE'),
                                ),
                                subtitle: Text(
                                  '${fmt.dateTime(record.createdAt)} · ${labelFor(_payoutLabel, record.status)}',
                                ),
                                trailing: Text(
                                  fmt.money(record.net, currency: record.currency),
                                  style: theme.textTheme.titleSmall
                                      ?.copyWith(fontWeight: FontWeight.w700),
                                ),
                              ),
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _iconFor(String? serviceType) => switch (serviceType) {
        'FOOD_DELIVERY' => Icons.restaurant_rounded,
        'PARCEL' => Icons.inventory_2_rounded,
        _ => Icons.directions_car_rounded,
      };
}

const Map<String, String> _payoutLabel = {
  'PENDING': 'Pending',
  'AVAILABLE': 'Available',
  'PAID': 'Paid out',
  'REVERSED': 'Reversed',
  'ON_HOLD': 'On hold',
};
