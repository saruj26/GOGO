import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/format/format.dart' as fmt;
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/forms.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../models/driver.dart';
import '../driver_providers.dart';

/// Open ride requests a driver can take.
///
/// Acceptance is first-come-first-served and settled by the backend under a row
/// lock, so a request shown here can legitimately be gone by the time it is
/// tapped. That refusal is reported plainly and the board refreshed.
class RideRequestsScreen extends ConsumerWidget {
  const RideRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(rideRequestsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Ride requests')),
      body: requests.when(
        loading: () => const LoadingState(message: 'Looking for requests…'),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(rideRequestsProvider),
        ),
        data: (offers) => offers.isEmpty
            ? const EmptyState(
                title: 'No requests right now',
                message: 'New ride requests appear here automatically while you are online.',
                icon: Icons.notifications_none_rounded,
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(rideRequestsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: offers.length,
                  separatorBuilder: (_, _) => Gap.md,
                  itemBuilder: (context, index) => _RequestCard(offer: offers[index]),
                ),
              ),
      ),
    );
  }
}

class _RequestCard extends ConsumerStatefulWidget {
  const _RequestCard({required this.offer});

  final RideRequestOffer offer;

  @override
  ConsumerState<_RequestCard> createState() => _RequestCardState();
}

class _RequestCardState extends ConsumerState<_RequestCard> {
  bool _busy = false;

  Future<void> _accept() async {
    setState(() => _busy = true);

    try {
      await ref.read(apiProvider).driver.acceptRide(widget.offer.rideId);

      ref.invalidate(rideRequestsProvider);
      ref.invalidate(driverActiveRideProvider);
      ref.invalidate(driverProfileProvider);

      if (!mounted) return;
      context.go('/driver/ride');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));

      // Somebody else took it, or the ride moved on. Refresh rather than leave
      // a request on screen that can no longer be accepted.
      if (error.kind == ApiErrorKind.conflict || error.kind == ApiErrorKind.notFound) {
        ref.invalidate(rideRequestsProvider);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final offer = widget.offer;
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (offer.isShared)
                  const SharedBadge()
                else
                  Text(offer.vehicleTypeName ?? 'Ride', style: theme.textTheme.labelLarge),
                const Spacer(),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      fmt.money(offer.driverNet, currency: offer.currency),
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700, color: AppColors.success),
                    ),
                    Text(
                      'you earn',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ],
                ),
              ],
            ),
            Gap.md,
            _Leg(
              icon: Icons.trip_origin,
              colour: AppColors.brand,
              label: 'Pick up',
              address: offer.pickup?.address ?? 'Unknown',
            ),
            Gap.sm,
            _Leg(
              icon: Icons.place,
              colour: AppColors.danger,
              label: 'Drop off',
              address: offer.dropoff?.address ?? 'Unknown',
            ),
            Gap.md,
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                _Fact(icon: Icons.straighten_rounded, text: fmt.distance(offer.distanceM)),
                _Fact(icon: Icons.schedule_rounded, text: fmt.duration(offer.durationS)),
                _Fact(
                  icon: Icons.event_seat_rounded,
                  text: '${offer.seatsTotal - offer.seatsOccupied} seats free',
                ),
                if (offer.scheduledPickupAt != null)
                  _Fact(
                    icon: Icons.event_rounded,
                    text: 'for ${fmt.dateTime(offer.scheduledPickupAt)}',
                  ),
              ],
            ),
            if (offer.isShared) ...[
              Gap.md,
              Text(
                offer.passengerCount <= 1
                    ? 'Shared ride. Others going the same way can join along the route, and you '
                        'earn extra for each.'
                    : 'Shared ride with ${offer.passengerCount} passengers already quoted.',
                style: theme.textTheme.bodySmall?.copyWith(color: AppColors.shared),
              ),
            ],
            Gap.lg,
            BusyButton(label: 'Accept', busy: _busy, onPressed: _accept),
          ],
        ),
      ),
    );
  }
}

class _Leg extends StatelessWidget {
  const _Leg({
    required this.icon,
    required this.colour,
    required this.label,
    required this.address,
  });

  final IconData icon;
  final Color colour;
  final String label;
  final String address;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: colour),
        Gap.sm,
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
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: theme.colorScheme.outline),
        const SizedBox(width: 4),
        Text(
          text,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
      ],
    );
  }
}
