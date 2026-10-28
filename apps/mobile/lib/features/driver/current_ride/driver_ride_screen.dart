import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/app_config.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/format/format.dart' as fmt;
import '../../../core/format/labels.dart';
import '../../../core/maps/map_view.dart';
import '../../../core/providers.dart';
import '../../../core/realtime/live_updates.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/forms.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../models/common.dart';
import '../../../models/driver.dart';
import '../driver_providers.dart';

/// The ride the driver is working, polled while it runs.
///
/// This is also how a shared passenger being added is discovered: the passenger
/// list grows and the stop sequence comes back reordered on the next poll.
final driverRideDetailProvider =
    StreamProvider.autoDispose.family<DriverRideDetail, String>((ref, rideId) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<DriverRideDetail>(
    () => api.driver.rideDetail(rideId),
    interval: const Duration(seconds: 10),
    stopWhen: (ride) => const {'COMPLETED', 'CANCELLED', 'EXPIRED'}.contains(ride.status),
  );
});

class DriverRideScreen extends ConsumerWidget {
  const DriverRideScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(driverActiveRideProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Current ride'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/driver'),
        ),
      ),
      body: active.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(driverActiveRideProvider)),
        data: (ride) => ride == null
            ? EmptyState(
                title: 'No ride in progress',
                message: 'Accept a request to start driving.',
                icon: Icons.directions_car_outlined,
                action: FilledButton(
                  onPressed: () => context.go('/driver/requests'),
                  child: const Text('See requests'),
                ),
              )
            : _RideDetail(rideId: ride.id),
      ),
    );
  }
}

class _RideDetail extends ConsumerWidget {
  const _RideDetail({required this.rideId});

  final String rideId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(driverRideDetailProvider(rideId));
    final config = ref.watch(appConfigProvider);
    final theme = Theme.of(context);

    return detail.when(
      loading: () => const LoadingState(),
      error: (error, _) => detail.value == null
          ? ErrorState(
              error: error,
              onRetry: () => ref.invalidate(driverRideDetailProvider(rideId)),
            )
          : _Body(ride: detail.value!, config: config, theme: theme, stale: true),
      data: (ride) => _Body(ride: ride, config: config, theme: theme),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({
    required this.ride,
    required this.config,
    required this.theme,
    this.stale = false,
  });

  final DriverRideDetail ride;
  final AppConfig config;
  final ThemeData theme;
  final bool stale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stops = ride.pendingStops;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        if (stale) ...[
          const InfoNote(
            icon: Icons.cloud_off_rounded,
            message: 'Showing the last update we received. Still trying to reconnect.',
          ),
          Gap.md,
        ],
        Row(
          children: [
            StatusBadge(status: ride.status, labels: rideStatusLabel),
            Gap.sm,
            if (ride.isShared) const SharedBadge(),
            const Spacer(),
            Text(
              ride.reference,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
        Gap.lg,
        if (ride.polyline != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: MapView(
              tileUrlTemplate: config.tileUrlTemplate,
              attribution: config.tileAttribution,
              routePolyline: ride.polyline,
              markers: [
                for (final stop in stops)
                  MapMarker(
                    point: GeoPoint(lat: stop.lat, lng: stop.lng),
                    kind: stop.isPickup ? MapMarkerKind.pickup : MapMarkerKind.dropoff,
                  ),
              ],
              height: 200,
            ),
          ),
          Gap.lg,
        ],
        _StopSequence(stops: stops, isShared: ride.isShared),
        Gap.lg,
        _Passengers(ride: ride),
        Gap.lg,
        if (ride.isShared) ...[_SharedPanel(ride: ride), Gap.lg],
        _LifecycleActions(ride: ride),
      ],
    );
  }
}

/// The order of stops the backend has sequenced.
///
/// On a shared ride this is the whole product working: when a passenger joins,
/// the server reorders the stops and the driver follows the new order. The app
/// does not sort or optimise anything.
class _StopSequence extends StatelessWidget {
  const _StopSequence({required this.stops, required this.isShared});

  final List<DriverStop> stops;
  final bool isShared;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SectionCard(
      title: 'Your route',
      trailing: Text(
        '${stops.length} ${stops.length == 1 ? 'stop' : 'stops'} left',
        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
      ),
      child: stops.isEmpty
          ? Text('No stops remaining.', style: theme.textTheme.bodyMedium)
          : Column(
              children: [
                for (var i = 0; i < stops.length; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 26,
                          height: 26,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: stops[i].isPickup
                                ? AppColors.brand.withValues(alpha: 0.15)
                                : AppColors.danger.withValues(alpha: 0.15),
                          ),
                          child: Text(
                            '${i + 1}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: stops[i].isPickup ? AppColors.brand : AppColors.danger,
                            ),
                          ),
                        ),
                        Gap.md,
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                stops[i].isPickup ? 'Collect' : 'Drop off',
                                style: theme.textTheme.bodySmall
                                    ?.copyWith(color: theme.colorScheme.outline),
                              ),
                              Text(stops[i].address, style: theme.textTheme.bodyMedium),
                            ],
                          ),
                        ),
                        Gap.sm,
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (stops[i].estimatedArrivalAt != null)
                              Text(
                                fmt.clockTime(stops[i].estimatedArrivalAt),
                                style: theme.textTheme.bodySmall,
                              ),
                            IconButton(
                              visualDensity: VisualDensity.compact,
                              tooltip: 'Open in maps',
                              onPressed: () => launchUrl(
                                Uri.parse(
                                  'geo:${stops[i].lat},${stops[i].lng}?q=${stops[i].lat},${stops[i].lng}',
                                ),
                                mode: LaunchMode.externalApplication,
                              ),
                              icon: const Icon(Icons.navigation_outlined, size: 20),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

class _Passengers extends StatelessWidget {
  const _Passengers({required this.ride});

  final DriverRideDetail ride;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = ride.passengers.where((leg) => leg.status != 'CANCELLED').toList(
          growable: false,
        );

    return SectionCard(
      title: 'Passengers',
      trailing: Text(
        '${ride.seatsOccupied}/${ride.seatsTotal} seats',
        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
      ),
      child: active.isEmpty
          ? Text('No passengers on this ride.', style: theme.textTheme.bodyMedium)
          : Column(
              children: [
                for (final leg in active) ...[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: leg.isSharedJoin
                            ? AppColors.shared.withValues(alpha: 0.15)
                            : theme.colorScheme.primaryContainer,
                        child: Text(
                          leg.firstName.isEmpty ? '?' : leg.firstName[0].toUpperCase(),
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: leg.isSharedJoin ? AppColors.shared : null,
                          ),
                        ),
                      ),
                      Gap.md,
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    leg.firstName,
                                    style: theme.textTheme.titleSmall,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (leg.isSharedJoin) ...[
                                  const SizedBox(width: 6),
                                  const Icon(
                                    Icons.groups_rounded,
                                    size: 14,
                                    color: AppColors.shared,
                                  ),
                                ],
                              ],
                            ),
                            Text(
                              '${leg.seats} ${leg.seats == 1 ? 'seat' : 'seats'} · '
                              '${labelFor(paymentMethodLabel, leg.paymentMethod ?? 'CASH')}',
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                            ),
                            Gap.xs,
                            Text(
                              '↑ ${leg.pickup.address}',
                              style: theme.textTheme.bodySmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              '↓ ${leg.dropoff.address}',
                              style: theme.textTheme.bodySmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (leg.note != null && leg.note!.isNotEmpty) ...[
                              Gap.xs,
                              Text(
                                leg.note!,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.outline,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (leg.phone != null)
                        IconButton.filledTonal(
                          tooltip: 'Call ${leg.firstName}',
                          onPressed: () => launchUrl(Uri.parse('tel:${leg.phone}')),
                          icon: const Icon(Icons.phone, size: 18),
                        ),
                    ],
                  ),
                  if (leg != active.last) const Divider(height: 24),
                ],
              ],
            ),
    );
  }
}

/// What sharing is doing on this journey.
///
/// A passenger asking to join does not join: they wait for the driver to accept
/// or reject them, which happens on the shared-requests screen. This panel is
/// the state of the journey once those decisions have been made — who is on
/// board, and how many seats are still open to be asked for.
class _SharedPanel extends ConsumerWidget {
  const _SharedPanel({required this.ride});

  final DriverRideDetail ride;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final joined = ride.passengers.where((leg) => leg.isSharedJoin).toList(growable: false);
    final seatsFree = (ride.seatsTotal - ride.seatsOccupied).clamp(0, ride.seatsTotal);

    return Card(
      color: AppColors.shared.withValues(alpha: 0.06),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.groups_rounded, color: AppColors.shared),
                Gap.md,
                Expanded(
                  child: Text('Shared journey', style: theme.textTheme.titleMedium),
                ),
              ],
            ),
            Gap.md,
            Text(
              joined.isEmpty
                  ? seatsFree > 0
                      ? '$seatsFree ${seatsFree == 1 ? 'seat is' : 'seats are'} still open. '
                          'Passengers going your way can be added while you drive, and your '
                          'route will update here.'
                      : 'This ride is full.'
                  : '${joined.length} ${joined.length == 1 ? 'passenger has' : 'passengers have'} '
                      'joined along the way. Your stops above are already in the order to drive '
                      'them.',
              style: theme.textTheme.bodyMedium,
            ),
            Gap.md,
            Text(
              'Each passenger you accept is priced and paid separately, and your earning for '
              'them is recorded on its own. You will see it in Earnings once the ride is '
              'complete.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
            Gap.md,
            OutlinedButton.icon(
              onPressed: () => context.push('/driver/shared'),
              icon: const Icon(Icons.how_to_reg_outlined),
              label: const Text('Requests waiting for you'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Moving the ride through its lifecycle.
///
/// Only the transition the backend would accept next is offered, and the
/// backend re-validates it anyway — the guard here just stops a driver tapping
/// something that is certain to be refused.
class _LifecycleActions extends ConsumerStatefulWidget {
  const _LifecycleActions({required this.ride});

  final DriverRideDetail ride;

  @override
  ConsumerState<_LifecycleActions> createState() => _LifecycleActionsState();
}

class _LifecycleActionsState extends ConsumerState<_LifecycleActions> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);

    try {
      await action();
      ref.invalidate(driverRideDetailProvider(widget.ride.id));
      ref.invalidate(driverActiveRideProvider);
      ref.invalidate(driverProfileProvider);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _complete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Complete this ride?'),
        content: const Text(
          'Every passenger is charged and your earning is recorded. This cannot be undone.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Not yet')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Complete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    await _run(() => ref.read(apiProvider).driver.completeRide(widget.ride.id));
    if (mounted) context.go('/driver');
  }

  Future<void> _cancel() async {
    final controller = TextEditingController();

    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this ride?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Tell the passenger why. Cancelling may affect your rating.'),
            Gap.md,
            TextField(
              controller: controller,
              autofocus: true,
              maxLength: 200,
              decoration: const InputDecoration(hintText: 'Reason'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep driving')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Cancel ride'),
          ),
        ],
      ),
    );

    if (reason == null) return;

    await _run(
      () => ref.read(apiProvider).driver.cancelRide(widget.ride.id, reason: reason),
    );
    if (mounted) context.go('/driver');
  }

  @override
  Widget build(BuildContext context) {
    final ride = widget.ride;
    final api = ref.read(apiProvider);

    final (label, icon, action) = switch (ride.status) {
      'ACCEPTED' => (
          'On my way to pick up',
          Icons.directions_car_rounded,
          () => _run(() => api.driver.markArriving(ride.id)),
        ),
      'DRIVER_ARRIVING' => (
          'I have arrived',
          Icons.location_on_rounded,
          () => _run(() => api.driver.markArrived(ride.id)),
        ),
      'DRIVER_ARRIVED' => (
          'Start the trip',
          Icons.play_arrow_rounded,
          () => _run(() => api.driver.startRide(ride.id)),
        ),
      'IN_PROGRESS' => ('Complete the ride', Icons.check_rounded, _complete),
      _ => (null, null, null),
    };

    return Column(
      children: [
        if (label != null)
          BusyButton(
            label: label,
            icon: icon,
            busy: _busy,
            onPressed: action,
          ),
        if (const {'ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED'}.contains(ride.status)) ...[
          Gap.md,
          OutlinedButton.icon(
            onPressed: _busy ? null : _cancel,
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
            icon: const Icon(Icons.close_rounded),
            label: const Text('Cancel ride'),
          ),
        ],
      ],
    );
  }
}
