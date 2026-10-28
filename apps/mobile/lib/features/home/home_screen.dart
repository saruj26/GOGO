import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/format/labels.dart';
import '../../core/location/location_providers.dart';
import '../../core/maps/map_view.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/status_badge.dart';
import '../../l10n/app_localizations.dart';
import '../../models/common.dart';
import '../../models/ride.dart';
import '../rides/booking_controller.dart';
import '../rides/location_search_screen.dart';

/// Anything the person currently has running, so it is one tap away.
///
/// Built from the existing history feeds rather than from a new "active"
/// endpoint: the first page of each already contains whatever is in flight.
final activeRidesProvider = FutureProvider.autoDispose<List<RideHistoryItem>>((ref) async {
  final page = await ref.watch(apiProvider).rides.history(limit: 5);

  const live = {
    'SEARCHING',
    'SCHEDULED',
    'ACCEPTED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'IN_PROGRESS',
  };

  return page.items.where((item) => live.contains(item.status)).toList(growable: false);
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _chooseDestination(BuildContext context, WidgetRef ref) async {
    final title = AppLocalizations.of(context).whereTo;
    final place = await Navigator.of(context).push<Place>(
      MaterialPageRoute(builder: (_) => LocationSearchScreen(title: title)),
    );

    if (place == null || !context.mounted) return;

    ref.read(bookingControllerProvider.notifier).setDropoff(place);
    if (context.mounted) context.go('/book');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final user = ref.watch(currentUserProvider);
    final here = ref.watch(lastKnownLocationProvider).value;
    final active = ref.watch(activeRidesProvider);
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(activeRidesProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      user == null ? l10n.helloGeneric : l10n.helloWithName(user.firstName),
                      style: theme.textTheme.headlineSmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    tooltip: l10n.notifications,
                    onPressed: () => context.push('/notifications'),
                    icon: const Icon(Icons.notifications_none_rounded),
                  ),
                ],
              ),
              Gap.md,

              // The map is the anchor of the screen, as it is in the product.
              // It shows where the person is — nothing else, because no live
              // vehicle positions are exposed by the API.
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Stack(
                  children: [
                    MapView(
                      tileUrlTemplate: config.tileUrlTemplate,
                      attribution: config.tileAttribution,
                      centre: here?.point,
                      markers: [
                        if (here != null) MapMarker(point: here.point, kind: MapMarkerKind.me),
                      ],
                      height: 180,
                      zoom: 14,
                      interactive: false,
                    ),
                    Positioned.fill(
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(onTap: () => context.go('/book')),
                      ),
                    ),
                  ],
                ),
              ),
              Gap.md,

              _WhereToButton(onTap: () => _chooseDestination(context, ref)),
              Gap.lg,

              _ServiceGrid(),
              Gap.xl,

              active.when(
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
                data: (rides) => rides.isEmpty
                    ? const SizedBox.shrink()
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l10n.happeningNow, style: theme.textTheme.titleMedium),
                          Gap.md,
                          for (final ride in rides) ...[
                            _ActiveRideTile(ride: ride),
                            Gap.sm,
                          ],
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WhereToButton extends StatelessWidget {
  const _WhereToButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        constraints: const BoxConstraints(minHeight: 56),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          children: [
            Icon(Icons.search, color: theme.colorScheme.primary),
            Gap.md,
            Expanded(
              child: Text(
                'Where to?',
                style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.outline),
              ),
            ),
            Icon(Icons.arrow_forward_ios_rounded, size: 16, color: theme.colorScheme.outline),
          ],
        ),
      ),
    );
  }
}

class _ServiceGrid extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final services = [
      (Icons.directions_car_rounded, l10n.serviceRide, '/book', AppColors.brand),
      (Icons.groups_rounded, l10n.serviceShareSave, '/book?mode=shared', AppColors.shared),
      (Icons.restaurant_rounded, l10n.serviceFood, '/food', AppColors.warning),
      (Icons.inventory_2_rounded, l10n.serviceParcel, '/parcel', AppColors.progress),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        // Two columns on a phone, four once there is room, so nothing is
        // squeezed on a 320dp screen.
        final columns = constraints.maxWidth >= 560 ? 4 : 2;

        return GridView.count(
          crossAxisCount: columns,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.6,
          children: [
            for (final (icon, label, route, colour) in services)
              _ServiceTile(icon: icon, label: label, route: route, colour: colour),
          ],
        );
      },
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({
    required this.icon,
    required this.label,
    required this.route,
    required this.colour,
  });

  final IconData icon;
  final String label;
  final String route;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: () => context.go(route),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: colour, size: 26),
            const Spacer(),
            Text(
              label,
              style: theme.textTheme.titleSmall,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveRideTile extends StatelessWidget {
  const _ActiveRideTile({required this.ride});

  final RideHistoryItem ride;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    return Card(
      child: ListTile(
        onTap: () => context.push('/ride/${ride.rideId}'),
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primaryContainer,
          child: Icon(
            ride.isSharedJoin ? Icons.groups_rounded : Icons.directions_car_rounded,
            size: 20,
          ),
        ),
        title: Text(ride.dropoffAddress, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              StatusBadge(status: ride.status, labels: rideStatusLabel, dense: true),
              if (ride.isSharedJoin) SharedBadge(label: l10n.sharedBadge),
            ],
          ),
        ),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
