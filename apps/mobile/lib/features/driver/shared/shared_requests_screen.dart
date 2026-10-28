import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/format/format.dart' as fmt;
import '../../../core/providers.dart';
import '../../../core/realtime/live_updates.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/forms.dart';
import '../../../core/widgets/states.dart';
import '../../../models/driver.dart';
import '../current_ride/driver_ride_screen.dart';
import '../driver_providers.dart';

/// Shared passengers waiting for a decision.
///
/// Polled as a fallback and refreshed immediately when the realtime socket
/// says a new request arrived, so a driver is not left staring at an empty
/// screen while someone waits for an answer.
final sharedRequestsProvider =
    StreamProvider.autoDispose<List<SharedPassengerRequest>>((ref) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<List<SharedPassengerRequest>>(
    () => api.driver.pendingSharedPassengers(),
    interval: const Duration(seconds: 12),
  );
});

class SharedRequestsScreen extends ConsumerWidget {
  const SharedRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(sharedRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shared requests'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/driver'),
        ),
      ),
      body: requests.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(sharedRequestsProvider),
        ),
        data: (items) => items.isEmpty
            ? const EmptyState(
                title: 'No requests waiting',
                message:
                    'When someone going your way asks to join a journey you are making, their '
                    'request appears here for you to accept or decline.',
                icon: Icons.groups_outlined,
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(sharedRequestsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => Gap.md,
                  itemBuilder: (context, index) => SharedRequestCard(request: items[index]),
                ),
              ),
      ),
    );
  }
}

/// One request, with what taking it would cost and pay.
class SharedRequestCard extends ConsumerStatefulWidget {
  const SharedRequestCard({super.key, required this.request});

  final SharedPassengerRequest request;

  @override
  ConsumerState<SharedRequestCard> createState() => _SharedRequestCardState();
}

class _SharedRequestCardState extends ConsumerState<SharedRequestCard> {
  bool _busy = false;

  Future<void> _decide({required bool accept}) async {
    final request = widget.request;

    if (!accept) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Decline this request?'),
          content: Text(
            '${request.passengerFirstName} will be told the ride is not available and can look '
            'for another one.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Go back'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Decline'),
            ),
          ],
        ),
      );

      if (confirmed != true) return;
    }

    setState(() => _busy = true);

    try {
      final driver = ref.read(apiProvider).driver;

      if (accept) {
        await driver.acceptSharedPassenger(
          rideId: request.rideId,
          ridePassengerId: request.ridePassengerId,
        );
      } else {
        await driver.rejectSharedPassenger(
          rideId: request.rideId,
          ridePassengerId: request.ridePassengerId,
        );
      }

      ref.invalidate(sharedRequestsProvider);
      ref.invalidate(driverActiveRideProvider);
      ref.invalidate(driverRideDetailProvider(request.rideId));
      ref.invalidate(earningsSummaryProvider);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            accept
                ? '${request.passengerFirstName} added. Your route has been updated.'
                : 'Request declined.',
          ),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));

      // The seat went, the passenger withdrew, or the ride moved on. Either
      // way the list on screen is stale.
      if (error.kind == ApiErrorKind.conflict || error.kind == ApiErrorKind.notFound) {
        ref.invalidate(sharedRequestsProvider);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final request = widget.request;
    final theme = Theme.of(context);

    return Card(
      color: AppColors.shared.withValues(alpha: 0.05),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppColors.shared.withValues(alpha: 0.15),
                  child: Text(
                    request.passengerFirstName.isEmpty
                        ? '?'
                        : request.passengerFirstName[0].toUpperCase(),
                    style: const TextStyle(
                      color: AppColors.shared,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Gap.md,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(request.passengerFirstName, style: theme.textTheme.titleMedium),
                      Text(
                        '${request.seats} ${request.seats == 1 ? 'seat' : 'seats'} · '
                        '${request.rideReference}',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                    ],
                  ),
                ),
                if (request.requestedAt != null)
                  Text(
                    fmt.relativeTime(request.requestedAt),
                    style:
                        theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
              ],
            ),
            Gap.lg,
            _Leg(
              icon: Icons.trip_origin,
              colour: AppColors.brand,
              label: 'Pick up',
              address: request.pickup.address,
            ),
            Gap.sm,
            _Leg(
              icon: Icons.place,
              colour: AppColors.danger,
              label: 'Drop off',
              address: request.dropoff.address,
            ),
            Gap.lg,

            // What it costs and what it pays, side by side, because that is the
            // trade the driver is being asked to make.
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _Figure(
                      label: 'Extra travel',
                      value: [
                        if (request.additionalDistanceM != null)
                          '+${fmt.distance(request.additionalDistanceM)}',
                        if (request.additionalDurationS != null)
                          '+${fmt.duration(request.additionalDurationS)}',
                      ].join('  ·  '),
                      emphasis: theme.colorScheme.onSurface,
                    ),
                  ),
                  Container(
                    width: 1,
                    height: 34,
                    color: theme.colorScheme.outlineVariant,
                  ),
                  Expanded(
                    child: _Figure(
                      label: 'You earn',
                      value: request.additionalEarning == null
                          ? '—'
                          : fmt.money(request.additionalEarning, currency: request.currency),
                      emphasis: AppColors.success,
                    ),
                  ),
                ],
              ),
            ),
            if (request.estimatedPickupAt != null) ...[
              Gap.sm,
              Text(
                'Estimated pick-up at ${fmt.clockTime(request.estimatedPickupAt)}',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ],
            if (request.note != null && request.note!.isNotEmpty) ...[
              Gap.sm,
              Text(
                request.note!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.outline,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
            Gap.lg,
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy ? null : () => _decide(accept: false),
                    style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                    child: const Text('Reject'),
                  ),
                ),
                Gap.md,
                Expanded(
                  flex: 2,
                  child: BusyButton(
                    label: 'Accept',
                    busy: _busy,
                    onPressed: () => _decide(accept: true),
                  ),
                ),
              ],
            ),
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

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, required this.emphasis});

  final String label;
  final String value;
  final Color emphasis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        Gap.xs,
        Text(
          value.isEmpty ? '—' : value,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: emphasis,
          ),
        ),
      ],
    );
  }
}
