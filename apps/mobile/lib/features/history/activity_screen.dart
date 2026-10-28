import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../models/common.dart';
import '../../models/ride.dart';
import '../food/food_providers.dart';
import '../parcels/parcel_providers.dart';

final rideHistoryProvider = FutureProvider.autoDispose<CursorPage<RideHistoryItem>>(
  (ref) => ref.watch(apiProvider).rides.history(limit: 20),
);

/// Everything the person has booked, across the three services.
class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Activity'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Rides'),
              Tab(text: 'Food'),
              Tab(text: 'Parcels'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _RidesTab(),
            _FoodTab(),
            _ParcelsTab(),
          ],
        ),
      ),
    );
  }
}

class _RidesTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rides = ref.watch(rideHistoryProvider);
    final theme = Theme.of(context);

    return rides.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(rideHistoryProvider)),
      data: (page) => page.items.isEmpty
          ? EmptyState(
              title: 'No rides yet',
              message: 'Your trips will appear here.',
              icon: Icons.directions_car_outlined,
              action: FilledButton(
                onPressed: () => context.go('/book'),
                child: const Text('Book a ride'),
              ),
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(rideHistoryProvider),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                itemCount: page.items.length,
                separatorBuilder: (_, _) => Gap.md,
                itemBuilder: (context, index) {
                  final ride = page.items[index];

                  return Card(
                    child: InkWell(
                      onTap: () => context.push('/ride/${ride.rideId}'),
                      borderRadius: BorderRadius.circular(16),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    ride.dropoffAddress,
                                    style: theme.textTheme.titleSmall,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (ride.total != null)
                                  Text(
                                    fmt.money(ride.total, currency: ride.currency ?? 'LKR'),
                                    style: theme.textTheme.titleSmall
                                        ?.copyWith(fontWeight: FontWeight.w700),
                                  ),
                              ],
                            ),
                            Gap.xs,
                            Text(
                              'from ${ride.pickupAddress}',
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Gap.sm,
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                StatusBadge(
                                  status: ride.status,
                                  labels: rideStatusLabel,
                                  dense: true,
                                ),
                                if (ride.isSharedJoin) const SharedBadge(),
                                Text(
                                  fmt.dateTime(ride.createdAt),
                                  style: theme.textTheme.bodySmall
                                      ?.copyWith(color: theme.colorScheme.outline),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}

class _FoodTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(foodOrdersProvider);
    final theme = Theme.of(context);

    return orders.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(foodOrdersProvider)),
      data: (page) => page.items.isEmpty
          ? EmptyState(
              title: 'No orders yet',
              message: 'Your food orders will appear here.',
              icon: Icons.restaurant_outlined,
              action: FilledButton(
                onPressed: () => context.go('/food'),
                child: const Text('Order food'),
              ),
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(foodOrdersProvider),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                itemCount: page.items.length,
                separatorBuilder: (_, _) => Gap.md,
                itemBuilder: (context, index) {
                  final order = page.items[index];

                  return Card(
                    child: ListTile(
                      onTap: () => context.push('/food/order/${order.id}'),
                      title: Text(order.restaurantName),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            StatusBadge(
                              status: order.status,
                              labels: foodStatusLabel,
                              dense: true,
                            ),
                            Text(
                              fmt.dateTime(order.placedAt),
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                            ),
                          ],
                        ),
                      ),
                      trailing: Text(
                        fmt.money(order.total, currency: order.currency),
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

class _ParcelsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final parcels = ref.watch(parcelsProvider);
    final theme = Theme.of(context);

    return parcels.when(
      loading: () => const LoadingState(),
      error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(parcelsProvider)),
      data: (page) => page.items.isEmpty
          ? EmptyState(
              title: 'No parcels yet',
              message: 'Parcels you send will appear here.',
              icon: Icons.inventory_2_outlined,
              action: FilledButton(
                onPressed: () => context.go('/parcel'),
                child: const Text('Send a parcel'),
              ),
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(parcelsProvider),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                itemCount: page.items.length,
                separatorBuilder: (_, _) => Gap.md,
                itemBuilder: (context, index) {
                  final parcel = page.items[index];

                  return Card(
                    child: ListTile(
                      onTap: () => context.push('/parcel/${parcel.id}'),
                      title: Text(
                        parcel.to,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            StatusBadge(
                              status: parcel.status,
                              labels: parcelStatusLabel,
                              dense: true,
                            ),
                            Text(
                              parcel.parcelType,
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                            ),
                          ],
                        ),
                      ),
                      trailing: parcel.total == null
                          ? null
                          : Text(
                              fmt.money(parcel.total, currency: parcel.currency ?? 'LKR'),
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
