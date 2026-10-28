import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/driver/driver_providers.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../l10n/app_localizations.dart';

/// The customer's bottom navigation.
class CustomerShell extends StatelessWidget {
  const CustomerShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        // `initialLocation: true` on a re-tap pops that branch back to its root,
        // which is what a person expects from tapping the tab they are on.
        onDestinationSelected: (index) => shell.goBranch(
          index,
          initialLocation: index == shell.currentIndex,
        ),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home_rounded),
            label: l10n.navHome,
          ),
          NavigationDestination(
            icon: const Icon(Icons.directions_car_outlined),
            selectedIcon: const Icon(Icons.directions_car_rounded),
            label: l10n.serviceRide,
          ),
          NavigationDestination(
            icon: const Icon(Icons.restaurant_outlined),
            selectedIcon: const Icon(Icons.restaurant_rounded),
            label: l10n.serviceFood,
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: const Icon(Icons.receipt_long_rounded),
            label: l10n.navActivity,
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline_rounded),
            selectedIcon: const Icon(Icons.person_rounded),
            label: l10n.navAccount,
          ),
        ],
      ),
    );
  }
}

/// The driver's bottom navigation.
///
/// A separate shell rather than extra tabs on the customer one: driving is a
/// different job with a different set of decisions, and mixing the two would
/// put "cancel this ride" next to "order food".
class DriverShell extends ConsumerWidget {
  const DriverShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final unread = ref.watch(unreadCountProvider).value ?? 0;

    // Position reporting lives for as long as the driver shell does, and
    // adjusts itself to whether they are online and carrying anyone.
    ref.watch(locationReportingProvider);

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (index) => shell.goBranch(
          index,
          initialLocation: index == shell.currentIndex,
        ),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.dashboard_outlined),
            selectedIcon: const Icon(Icons.dashboard_rounded),
            label: l10n.navDriving,
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread'),
              child: const Icon(Icons.notifications_none_rounded),
            ),
            selectedIcon: const Icon(Icons.notifications_active_rounded),
            label: l10n.navRequests,
          ),
          NavigationDestination(
            icon: const Icon(Icons.navigation_outlined),
            selectedIcon: const Icon(Icons.navigation_rounded),
            label: l10n.serviceRide,
          ),
          NavigationDestination(
            icon: const Icon(Icons.delivery_dining_outlined),
            selectedIcon: const Icon(Icons.delivery_dining_rounded),
            label: l10n.navDeliver,
          ),
          NavigationDestination(
            icon: const Icon(Icons.payments_outlined),
            selectedIcon: const Icon(Icons.payments_rounded),
            label: l10n.navEarnings,
          ),
        ],
      ),
    );
  }
}
