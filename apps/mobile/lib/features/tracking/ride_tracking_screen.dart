import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/maps/map_view.dart';
import '../../core/providers.dart';
import '../../core/realtime/live_updates.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../models/common.dart';
import '../../models/ride.dart';
import '../ratings/rating_sheet.dart';
import 'live_location.dart';

/// Live-ish view of one ride.
///
/// "Live-ish" is the honest word. The backend has no realtime transport and
/// does not expose the driver's position to passengers, so this polls the ride
/// and shows what actually changed. There is deliberately no moving car on the
/// map: a marker that drifts along a route without data behind it would be a
/// fabrication, and the person relies on this screen to meet their driver.
final rideStreamProvider = StreamProvider.autoDispose.family<RideDetail, String>((ref, rideId) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<RideDetail>(
    () => api.rides.get(rideId),
    interval: const Duration(seconds: 10),
    // A finished ride has nothing more to report.
    stopWhen: (ride) => !ride.isActive,
  );
});

class RideTrackingScreen extends ConsumerWidget {
  const RideTrackingScreen({super.key, required this.rideId});

  final String rideId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ride = ref.watch(rideStreamProvider(rideId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your ride'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: ride.when(
        loading: () => const LoadingState(message: 'Loading your ride…'),
        // A poll that fails still has the previous ride to show; only a first
        // failure with nothing cached becomes a full-screen error.
        error: (error, _) => ride.value == null
            ? ErrorState(error: error, onRetry: () => ref.invalidate(rideStreamProvider(rideId)))
            : _RideBody(ride: ride.value!, staleError: error),
        data: (value) => _RideBody(ride: value),
      ),
    );
  }
}

class _RideBody extends ConsumerWidget {
  const _RideBody({required this.ride, this.staleError});

  final RideDetail ride;
  final Object? staleError;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final theme = Theme.of(context);
    final leg = ride.myLeg;

    // Only while the ride is live: a completed journey stops being followed.
    final vehicle = ride.isActive ? ref.watch(liveVehicleProvider(ride.id)).value : null;
    final showVehicle = vehicle != null && !vehicle.isStale;

    final markers = <MapMarker>[
      if (showVehicle) MapMarker(point: vehicle.point, kind: MapMarkerKind.vehicle),
      if (leg != null) ...[
        MapMarker(point: leg.pickup.point, kind: MapMarkerKind.pickup),
        MapMarker(point: leg.dropoff.point, kind: MapMarkerKind.dropoff),
      ],
      for (final stop in ride.stops)
        MapMarker(
          point: GeoPoint(lat: stop.lat, lng: stop.lng),
          kind: stop.isPickup ? MapMarkerKind.pickup : MapMarkerKind.stop,
        ),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        if (staleError != null) ...[
          const InfoNote(
            icon: Icons.cloud_off_rounded,
            message: 'Showing the last update we received. We are still trying to reconnect.',
          ),
          Gap.md,
        ],
        if (leg != null && leg.status == 'OFFERED') ...[
          const InfoNote(
            icon: Icons.hourglass_top_rounded,
            message: 'Your seat is held while the driver decides. You will be told as soon as '
                'they accept — or you can search again if they cannot take you.',
          ),
          Gap.md,
        ],
        if (leg != null && leg.status == 'REJECTED') ...[
          const InfoNote(
            icon: Icons.cancel_outlined,
            message: 'The driver could not take you on this ride. Search again to find another '
                'one going your way.',
          ),
          Gap.md,
        ],
        Row(
          children: [
            StatusBadge(
              status: leg != null && (leg.status == 'OFFERED' || leg.status == 'REJECTED')
                  ? leg.status
                  : ride.status,
              labels: leg != null && (leg.status == 'OFFERED' || leg.status == 'REJECTED')
                  ? passengerLegLabel
                  : rideStatusLabel,
            ),
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
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: MapView(
            tileUrlTemplate: config.tileUrlTemplate,
            attribution: config.tileAttribution,
            markers: markers,
            routePolyline: ride.route?.polyline,
            height: 240,
            interactive: true,
          ),
        ),
        Gap.md,
        // Said plainly either way: a person watching a map needs to know
        // whether what they are looking at is live.
        InfoNote(
          icon: showVehicle ? Icons.my_location_rounded : Icons.info_outline_rounded,
          message: showVehicle
              ? 'Your driver’s position updates live as they move.'
              : ride.isActive
                  ? 'Waiting for your driver’s position. The route and stops are shown in the '
                      'meantime.'
                  : 'The route and stops for this trip are shown.',
        ),
        Gap.lg,
        if (ride.driver != null) _DriverCard(ride: ride),
        if (ride.driver != null) Gap.lg,
        if (leg != null) _JourneyCard(ride: ride, leg: leg),
        Gap.lg,
        if (ride.isShared) ...[_SharedCard(ride: ride), Gap.lg],
        if (ride.canCancel) _CancelButton(ride: ride),
        if (ride.status == 'COMPLETED') _RateButton(ride: ride),
      ],
    );
  }
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.ride});

  final RideDetail ride;

  @override
  Widget build(BuildContext context) {
    final driver = ride.driver!;
    final vehicle = ride.vehicle;
    final theme = Theme.of(context);

    return SectionCard(
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: theme.colorScheme.primaryContainer,
                child: Text(
                  driver.firstName.isEmpty ? '?' : driver.firstName[0].toUpperCase(),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
                ),
              ),
              Gap.md,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(driver.firstName, style: theme.textTheme.titleMedium),
                    if (driver.rating != null)
                      Text(
                        '★ ${driver.rating}${driver.trips != null ? ' · ${driver.trips} trips' : ''}',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                    if (vehicle != null)
                      Text(
                        '${vehicle.description}${vehicle.plateNumber != null ? ' · ${vehicle.plateNumber}' : ''}',
                        style: theme.textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
              if (driver.phone != null)
                IconButton.filledTonal(
                  tooltip: 'Call driver',
                  onPressed: () => launchUrl(Uri.parse('tel:${driver.phone}')),
                  icon: const Icon(Icons.phone),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _JourneyCard extends StatelessWidget {
  const _JourneyCard({required this.ride, required this.leg});

  final RideDetail ride;
  final RideLeg leg;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Your journey',
      child: Column(
        children: [
          _Waypoint(
            icon: Icons.trip_origin,
            colour: AppColors.brand,
            label: 'Pick-up',
            address: leg.pickup.address,
            time: leg.estimatedPickupAt,
          ),
          _Waypoint(
            icon: Icons.place,
            colour: AppColors.danger,
            label: 'Drop-off',
            address: leg.dropoff.address,
            time: leg.estimatedDropoffAt,
          ),
          const Divider(height: 24),
          DetailRow(label: 'Seats', value: '${leg.seats}'),
          if (ride.vehicleTypeName != null)
            DetailRow(label: 'Vehicle', value: ride.vehicleTypeName!),
          if (leg.fareTotal != null)
            DetailRow(
              label: 'Fare',
              value: fmt.money(leg.fareTotal, currency: leg.currency ?? ride.currency),
              emphasise: true,
            ),
          if (leg.paymentMethod != null)
            DetailRow(
              label: 'Payment',
              value: labelFor(paymentMethodLabel, leg.paymentMethod!),
            ),
        ],
      ),
    );
  }
}

class _Waypoint extends StatelessWidget {
  const _Waypoint({
    required this.icon,
    required this.colour,
    required this.label,
    required this.address,
    this.time,
  });

  final IconData icon;
  final Color colour;
  final String label;
  final String address;
  final DateTime? time;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: colour),
          Gap.md,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
                Text(address, style: theme.textTheme.bodyMedium),
              ],
            ),
          ),
          if (time != null) ...[
            Gap.sm,
            Text(fmt.clockTime(time), style: theme.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}

class _SharedCard extends StatelessWidget {
  const _SharedCard({required this.ride});

  final RideDetail ride;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SectionCard(
      title: 'Shared ride',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            ride.coPassengerCount == 0
                ? 'No one else is on board yet. Others may join along the route.'
                : 'Sharing with ${ride.coPassengerCount} other ${ride.coPassengerCount == 1 ? 'passenger' : 'passengers'}.',
            style: theme.textTheme.bodyMedium,
          ),
          Gap.sm,
          Text(
            // Co-passengers' identities are not exposed to each other by the
            // API, and the app does not invent them.
            'For everyone’s privacy, other passengers’ details are not shared.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
          if (ride.stops.isNotEmpty) ...[
            const Divider(height: 24),
            Text('Stops on your leg', style: theme.textTheme.titleSmall),
            Gap.sm,
            for (final stop in ride.stops)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Icon(
                      stop.isPickup ? Icons.person_add_alt : Icons.person_remove_alt_1,
                      size: 16,
                      color: theme.colorScheme.outline,
                    ),
                    Gap.sm,
                    Expanded(
                      child: Text(
                        stop.address,
                        style: theme.textTheme.bodySmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (stop.estimatedArrivalAt != null)
                      Text(
                        fmt.clockTime(stop.estimatedArrivalAt),
                        style: theme.textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _CancelButton extends ConsumerStatefulWidget {
  const _CancelButton({required this.ride});

  final RideDetail ride;

  @override
  ConsumerState<_CancelButton> createState() => _CancelButtonState();
}

class _CancelButtonState extends ConsumerState<_CancelButton> {
  bool _busy = false;

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(widget.ride.isShared ? 'Leave this shared ride?' : 'Cancel this ride?'),
        content: Text(
          widget.ride.isShared
              ? 'Your seat is released and the ride continues for the other passengers. '
                  'A cancellation fee may apply.'
              : 'A cancellation fee may apply depending on how far along the ride is.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel ride'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);

    try {
      await ref.read(apiProvider).rides.cancel(widget.ride.id);
      ref.invalidate(rideStreamProvider(widget.ride.id));
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
      label: Text(widget.ride.isShared ? 'Leave this ride' : 'Cancel ride'),
    );
  }
}

class _RateButton extends StatelessWidget {
  const _RateButton({required this.ride});

  final RideDetail ride;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: () => showRatingSheet(context, kind: 'ride', id: ride.id, title: 'Rate your ride'),
      icon: const Icon(Icons.star_rounded),
      label: const Text('Rate this ride'),
    );
  }
}
