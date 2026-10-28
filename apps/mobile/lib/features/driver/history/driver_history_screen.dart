import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/format.dart' as fmt;
import '../../../core/format/labels.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../models/common.dart';
import '../../../models/delivery.dart';

final assignedRidesProvider = FutureProvider.autoDispose<CursorPage<Map<String, dynamic>>>(
  (ref) => ref.watch(apiProvider).driver.assignedRides(limit: 30),
);

final deliveryHistoryProvider =
    FutureProvider.autoDispose.family<CursorPage<DeliveryHistoryItem>, String>((ref, kind) {
  return ref.watch(apiProvider).driver.deliveryHistory(kind: kind, limit: 30);
});

/// A driver's completed work, across rides and both delivery services.
class DriverHistoryScreen extends StatelessWidget {
  const DriverHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('History'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/driver'),
          ),
          bottom: const TabBar(
            tabs: [Tab(text: 'Rides'), Tab(text: 'Food'), Tab(text: 'Parcels')],
          ),
        ),
        body: const TabBarView(
          children: [
            _RidesTab(),
            _DeliveryTab(kind: 'food'),
            _DeliveryTab(kind: 'parcel'),
          ],
        ),
      ),
    );
  }
}

class _RidesTab extends ConsumerWidget {
  const _RidesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rides = ref.watch(assignedRidesProvider);
    final theme = Theme.of(context);

    return rides.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(assignedRidesProvider)),
      data: (page) => page.items.isEmpty
          ? const EmptyState(
              title: 'No rides yet',
              message: 'Rides you have driven will appear here.',
              icon: Icons.directions_car_outlined,
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(assignedRidesProvider),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                itemCount: page.items.length,
                separatorBuilder: (_, _) => Gap.sm,
                itemBuilder: (context, index) {
                  final ride = page.items[index];
                  final vehicleType = ride['vehicleType'];
                  final isShared = ride['rideType'] == 'SHARED';

                  return Card(
                    child: ListTile(
                      title: Text((ride['reference'] ?? '') as String),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            StatusBadge(
                              status: asEnum(ride['status'], 'COMPLETED'),
                              labels: rideStatusLabel,
                              dense: true,
                            ),
                            if (isShared) const SharedBadge(),
                            Text(
                              [
                                if (vehicleType is Map) (vehicleType['name'] ?? '') as String,
                                fmt.distance(toIntOrNull(ride['plannedDistanceM'])),
                                fmt.dateTime(toDate(ride['completedAt'] ?? ride['createdAt'])),
                              ].where((s) => s.isNotEmpty && s != '—').join(' · '),
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                            ),
                          ],
                        ),
                      ),
                      isThreeLine: true,
                    ),
                  );
                },
              ),
            ),
    );
  }
}

class _DeliveryTab extends ConsumerWidget {
  const _DeliveryTab({required this.kind});

  final String kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(deliveryHistoryProvider(kind));
    final theme = Theme.of(context);

    return history.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(deliveryHistoryProvider(kind))),
      data: (page) => page.items.isEmpty
          ? EmptyState(
              title: kind == 'food' ? 'No food deliveries yet' : 'No parcels yet',
              message: 'Completed jobs will appear here.',
              icon: kind == 'food'
                  ? Icons.restaurant_outlined
                  : Icons.inventory_2_outlined,
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(deliveryHistoryProvider(kind)),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                itemCount: page.items.length,
                separatorBuilder: (_, _) => Gap.sm,
                itemBuilder: (context, index) {
                  final job = page.items[index];

                  return Card(
                    child: ListTile(
                      title: Text(job.title ?? job.reference),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            StatusBadge(
                              status: job.status,
                              labels: deliveryStatusLabel,
                              dense: true,
                            ),
                            Text(
                              fmt.dateTime(job.deliveredAt ?? job.assignedAt),
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                            ),
                          ],
                        ),
                      ),
                      trailing: job.earning == null
                          ? null
                          : Text(
                              fmt.money(job.earning, currency: job.currency ?? 'LKR'),
                              style: theme.textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
