import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/format/format.dart' as fmt;
import '../../../core/location/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/forms.dart';
import '../../../core/widgets/states.dart';
import '../../../models/driver.dart';
import '../driver_providers.dart';
import '../shared/shared_requests_screen.dart';

class DriverHomeScreen extends ConsumerWidget {
  const DriverHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(driverProfileProvider);
    final activeRide = ref.watch(driverActiveRideProvider);
    final currentDelivery = ref.watch(currentDeliveryProvider);
    final earnings = ref.watch(earningsSummaryProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Driving'),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          IconButton(
            tooltip: 'Passenger app',
            onPressed: () => context.go('/'),
            icon: const Icon(Icons.person_outline_rounded),
          ),
        ],
      ),
      body: profile.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(driverProfileProvider)),
        data: (driver) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(driverProfileProvider);
            ref.invalidate(earningsSummaryProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              if (!driver.isApproved) ...[
                InfoNote(
                  icon: Icons.pending_outlined,
                  message: driver.approvalStatus == 'REJECTED'
                      ? 'Your driver account was not approved. Contact support for details.'
                      : 'Your driver account is awaiting approval. You can go online once it '
                          'has been approved.',
                ),
                Gap.lg,
              ],
              _PresenceCard(driver: driver),
              Gap.lg,
              const _SharedRequestsBanner(),
              activeRide.when(
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
                data: (ride) => ride == null
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Card(
                          child: ListTile(
                            onTap: () => context.go('/driver/ride'),
                            leading: const CircleAvatar(child: Icon(Icons.navigation_rounded)),
                            title: Text('Ride in progress · ${ride.reference}'),
                            subtitle: Text(
                              '${ride.stops.length} ${ride.stops.length == 1 ? 'stop' : 'stops'} remaining',
                            ),
                            trailing: const Icon(Icons.chevron_right_rounded),
                          ),
                        ),
                      ),
              ),
              currentDelivery.when(
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
                data: (job) => job == null
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Card(
                          child: ListTile(
                            onTap: () => context.go('/driver/deliveries'),
                            leading: CircleAvatar(
                              child: Icon(
                                job.isFood ? Icons.restaurant_rounded : Icons.inventory_2_rounded,
                              ),
                            ),
                            title: Text('Delivery in progress · ${job.reference}'),
                            subtitle: Text(job.deliverTo.address, maxLines: 1),
                            trailing: const Icon(Icons.chevron_right_rounded),
                          ),
                        ),
                      ),
              ),
              earnings.when(
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
                data: (summary) => Card(
                  child: InkWell(
                    onTap: () => context.go('/driver/earnings'),
                    borderRadius: BorderRadius.circular(16),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Your earnings',
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: theme.colorScheme.outline),
                          ),
                          Gap.xs,
                          Text(
                            fmt.money(summary.net, currency: summary.currency),
                            style: theme.textTheme.headlineSmall
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          Gap.sm,
                          Text(
                            '${summary.trips} ${summary.trips == 1 ? 'job' : 'jobs'} · '
                            '${fmt.money(summary.sharedNet, currency: summary.currency)} from shared passengers',
                            style: theme.textTheme.bodySmall
                                ?.copyWith(color: theme.colorScheme.outline),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Gap.lg,
              Row(
                children: [
                  Expanded(
                    child: _QuickAction(
                      icon: Icons.notifications_active_outlined,
                      label: 'Ride requests',
                      onTap: () => context.go('/driver/requests'),
                    ),
                  ),
                  Gap.md,
                  Expanded(
                    child: _QuickAction(
                      icon: Icons.delivery_dining_rounded,
                      label: 'Deliveries',
                      onTap: () => context.go('/driver/deliveries'),
                    ),
                  ),
                ],
              ),
              Gap.md,
              Row(
                children: [
                  Expanded(
                    child: _QuickAction(
                      icon: Icons.history_rounded,
                      label: 'Work history',
                      onTap: () => context.push('/driver/history'),
                    ),
                  ),
                  Gap.md,
                  Expanded(
                    child: _QuickAction(
                      icon: Icons.account_circle_outlined,
                      label: 'Account',
                      onTap: () => context.go('/profile'),
                    ),
                  ),
                ],
              ),
              Gap.lg,
              _VehicleCard(driver: driver),
              Gap.lg,
              _DocumentsCard(driver: driver),
            ],
          ),
        ),
      ),
    );
  }
}

/// Going online and choosing what work to take.
///
/// Presence is stored server-side: dispatch decides what a driver is offered
/// from that record, so this control always writes to the backend and re-reads
/// the answer rather than flipping a local switch.
class _PresenceCard extends ConsumerStatefulWidget {
  const _PresenceCard({required this.driver});

  final DriverProfile driver;

  @override
  ConsumerState<_PresenceCard> createState() => _PresenceCardState();
}

class _PresenceCardState extends ConsumerState<_PresenceCard> {
  bool _busy = false;

  Future<void> _toggle(bool online) async {
    final driver = widget.driver;

    if (online && driver.availability.activeVehicleId == null) {
      final usable = driver.vehicles.where((v) => v.isUsable).toList(growable: false);

      if (usable.isEmpty) {
        _say('You need an approved vehicle before you can go online.');
        return;
      }

      // One usable vehicle is not a choice worth interrupting for.
      if (usable.length == 1) {
        await _apply(() => ref.read(availabilityActionsProvider).goOnline(vehicleId: usable.first.id));
        return;
      }

      final chosen = await _chooseVehicle(usable);
      if (chosen == null) return;

      await _apply(() => ref.read(availabilityActionsProvider).goOnline(vehicleId: chosen.id));
      return;
    }

    await _apply(
      online
          ? ref.read(availabilityActionsProvider).goOnline
          : ref.read(availabilityActionsProvider).goOffline,
    );
  }

  Future<DriverVehicle?> _chooseVehicle(List<DriverVehicle> vehicles) {
    return showModalBottomSheet<DriverVehicle>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Text('Which vehicle are you driving?'),
            ),
            for (final vehicle in vehicles)
              ListTile(
                leading: const Icon(Icons.directions_car_rounded),
                title: Text(vehicle.description),
                subtitle: Text(vehicle.plateNumber),
                onTap: () => Navigator.pop(context, vehicle),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _apply(Future<void> Function() action) async {
    setState(() => _busy = true);

    try {
      await action();

      // Position reporting follows presence: online means the backend is
      // receiving pings, offline means it stops.
      final reporter = ref.read(locationReporterProvider);
      final nowOnline = ref.read(driverProfileProvider).value?.availability.isOnline ?? false;

      if (nowOnline) {
        await reporter.start();
      } else {
        await reporter.stop();
      }
    } on ApiException catch (error) {
      _say(error.message);
    } on LocationFailure catch (failure) {
      // Being online without location still works for accepting jobs; the
      // driver just is not reporting a position. Saying so is better than
      // silently failing.
      _say(failure.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final driver = widget.driver;
    final availability = driver.availability;
    final theme = Theme.of(context);

    return SectionCard(
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: availability.isOnline ? AppColors.success : theme.colorScheme.outline,
                ),
              ),
              Gap.md,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      availability.isOnTrip
                          ? 'On a trip'
                          : availability.isOnline
                              ? 'Online'
                              : 'Offline',
                      style: theme.textTheme.titleMedium,
                    ),
                    Text(
                      availability.isOnline
                          ? 'You can be offered work'
                          : 'You will not be offered work',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ],
                ),
              ),
              if (_busy)
                const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2.5))
              else
                Switch(
                  value: availability.isOnline,
                  onChanged: driver.isApproved ? _toggle : null,
                ),
            ],
          ),
          const Divider(height: 28),
          Text(
            'What you will take',
            style: theme.textTheme.labelLarge,
            textAlign: TextAlign.left,
          ),
          Gap.sm,
          Align(
            alignment: Alignment.centerLeft,
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  avatar: const Icon(Icons.groups_rounded, size: 18, color: AppColors.shared),
                  label: const Text('Shared passengers'),
                  selected: availability.acceptsShared,
                  onSelected: _busy
                      ? null
                      : (value) => _apply(
                            () => ref
                                .read(availabilityActionsProvider)
                                .setWorkTypes(shared: value),
                          ),
                ),
                FilterChip(
                  avatar: const Icon(Icons.restaurant_rounded, size: 18),
                  label: const Text('Food'),
                  selected: availability.acceptsFood,
                  onSelected: _busy
                      ? null
                      : (value) => _apply(
                            () =>
                                ref.read(availabilityActionsProvider).setWorkTypes(food: value),
                          ),
                ),
                FilterChip(
                  avatar: const Icon(Icons.inventory_2_rounded, size: 18),
                  label: const Text('Parcels'),
                  selected: availability.acceptsParcel,
                  onSelected: _busy
                      ? null
                      : (value) => _apply(
                            () => ref
                                .read(availabilityActionsProvider)
                                .setWorkTypes(parcel: value),
                          ),
                ),
              ],
            ),
          ),
          Gap.md,
          // This is the driver's consent to shared riding. The matching engine
          // checks it before adding anyone to a journey, which is why it is a
          // standing setting and not a prompt per passenger.
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              availability.acceptsShared
                  ? 'Passengers going your way can be added to journeys you are already making. '
                      'You earn extra for each one.'
                  : 'Turn on shared passengers to be offered extra fares along routes you are '
                      'already driving.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ),
        ],
      ),
    );
  }
}

/// Shared passengers waiting on a decision.
///
/// Only shown when there are some: an empty banner on every screen teaches a
/// driver to stop looking at it.
class _SharedRequestsBanner extends ConsumerWidget {
  const _SharedRequestsBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final waiting = ref.watch(sharedRequestsProvider).value ?? const [];
    if (waiting.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        color: AppColors.shared.withValues(alpha: 0.10),
        child: ListTile(
          onTap: () => context.push('/driver/shared'),
          leading: const CircleAvatar(
            backgroundColor: AppColors.shared,
            child: Icon(Icons.groups_rounded, color: Colors.white, size: 20),
          ),
          title: Text(
            waiting.length == 1
                ? '1 passenger wants to join'
                : '${waiting.length} passengers want to join',
          ),
          subtitle: const Text('Accept or decline to keep them moving'),
          trailing: const Icon(Icons.chevron_right_rounded),
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        constraints: const BoxConstraints(minHeight: 84),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Icon(icon, color: theme.colorScheme.primary),
            Text(label, style: theme.textTheme.titleSmall),
          ],
        ),
      ),
    );
  }
}

class _VehicleCard extends ConsumerWidget {
  const _VehicleCard({required this.driver});

  final DriverProfile driver;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final active = driver.activeVehicle;

    return SectionCard(
      title: 'Your vehicle',
      child: driver.vehicles.isEmpty
          ? Text(
              'No vehicle is assigned to your account. Contact support to add one.',
              style: theme.textTheme.bodyMedium,
            )
          : Column(
              children: [
                for (final vehicle in driver.vehicles)
                  RadioGroup<String>(
                    groupValue: active?.id ?? '',
                    onChanged: (value) {
                      if (value == null) return;
                      ref.read(availabilityActionsProvider).selectVehicle(value);
                    },
                    child: RadioListTile<String>(
                      value: vehicle.id,
                      enabled: vehicle.isUsable,
                      contentPadding: EdgeInsets.zero,
                      title: Text(vehicle.description),
                      subtitle: Text(
                        [
                          vehicle.plateNumber,
                          if (vehicle.vehicleTypeName != null) vehicle.vehicleTypeName!,
                          '${vehicle.seatCapacity} seats',
                          if (!vehicle.isUsable) 'Not approved',
                        ].join(' · '),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _DocumentsCard extends StatelessWidget {
  const _DocumentsCard({required this.driver});

  final DriverProfile driver;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SectionCard(
      title: 'Documents',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (driver.documents.isEmpty)
            Text('No documents on file.', style: theme.textTheme.bodyMedium)
          else
            for (final document in driver.documents)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Icon(
                      document.status == 'APPROVED'
                          ? Icons.verified_outlined
                          : document.status == 'REJECTED'
                              ? Icons.error_outline
                              : Icons.hourglass_empty_rounded,
                      size: 18,
                      color: document.status == 'APPROVED'
                          ? AppColors.success
                          : document.status == 'REJECTED'
                              ? AppColors.danger
                              : AppColors.warning,
                    ),
                    Gap.md,
                    Expanded(
                      child: Text(
                        document.type.replaceAll('_', ' ').toLowerCase(),
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                    if (document.isExpired)
                      Text(
                        'Expired',
                        style: theme.textTheme.bodySmall?.copyWith(color: AppColors.danger),
                      )
                    else if (document.expiresAt != null)
                      Text(
                        fmt.dateOnly(document.expiresAt),
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                  ],
                ),
              ),
          Gap.md,
          // Documents are reviewed by the operations team; there is no upload
          // endpoint, so the app reports status rather than offering a camera
          // that would go nowhere.
          const InfoNote(
            message: 'Uploading documents in the app is not available yet. Send new documents to '
                'support and their status will appear here once reviewed.',
          ),
        ],
      ),
    );
  }
}
