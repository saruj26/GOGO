import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/format/format.dart' as fmt;
import '../../../core/format/labels.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/forms.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../models/delivery.dart';
import '../driver_providers.dart';

/// Food and parcel work for the same driver.
///
/// One identity, one queue: there is no separate courier account, so both
/// services are shown on one board and the backend allows only one active job
/// at a time regardless of which service it came from.
class DriverDeliveriesScreen extends ConsumerWidget {
  const DriverDeliveriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(currentDeliveryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Deliveries'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/driver'),
        ),
      ),
      body: current.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(currentDeliveryProvider)),
        data: (job) => job == null ? const _AvailableJobs() : _CurrentJob(job: job),
      ),
    );
  }
}

class _AvailableJobs extends ConsumerWidget {
  const _AvailableJobs();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobs = ref.watch(availableDeliveriesProvider);
    final profile = ref.watch(driverProfileProvider);
    final availability = profile.value?.availability;

    return jobs.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(availableDeliveriesProvider)),
      data: (offers) {
        if (availability != null && !availability.isOnline) {
          return const EmptyState(
            title: 'You are offline',
            message: 'Go online from the driving screen to see delivery jobs.',
            icon: Icons.wifi_off_rounded,
          );
        }

        if (availability != null && !availability.acceptsFood && !availability.acceptsParcel) {
          return const EmptyState(
            title: 'Deliveries are switched off',
            message: 'Turn on food or parcels on the driving screen to be offered jobs.',
            icon: Icons.delivery_dining_outlined,
          );
        }

        if (offers.isEmpty) {
          return const EmptyState(
            title: 'No jobs right now',
            message: 'New delivery jobs will appear here. Pull down to refresh.',
            icon: Icons.inbox_outlined,
          );
        }

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(availableDeliveriesProvider),
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            itemCount: offers.length,
            separatorBuilder: (_, _) => Gap.md,
            itemBuilder: (context, index) => _JobCard(job: offers[index]),
          ),
        );
      },
    );
  }
}

class _JobCard extends ConsumerStatefulWidget {
  const _JobCard({required this.job});

  final DeliveryJobOffer job;

  @override
  ConsumerState<_JobCard> createState() => _JobCardState();
}

class _JobCardState extends ConsumerState<_JobCard> {
  bool _busy = false;

  Future<void> _accept() async {
    setState(() => _busy = true);
    final api = ref.read(apiProvider).driver;

    try {
      if (widget.job.isFood) {
        await api.acceptFoodDelivery(widget.job.id);
      } else {
        await api.acceptParcelJob(widget.job.id);
      }

      ref.invalidate(currentDeliveryProvider);
      ref.invalidate(availableDeliveriesProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));

      // Another courier got there first, so the board is stale.
      if (error.kind == ApiErrorKind.conflict || error.kind == ApiErrorKind.notFound) {
        ref.invalidate(availableDeliveriesProvider);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  job.isFood ? Icons.restaurant_rounded : Icons.inventory_2_rounded,
                  size: 18,
                  color: job.isFood ? AppColors.warning : AppColors.progress,
                ),
                Gap.sm,
                Text(
                  job.isFood ? 'Food' : (job.parcelType ?? 'Parcel'),
                  style: theme.textTheme.labelLarge,
                ),
                const Spacer(),
                if (job.earning != null)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        fmt.money(job.earning, currency: job.currency),
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppColors.success,
                        ),
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
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.storefront_outlined, size: 16),
                Gap.sm,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Collect from',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                      Text(
                        job.collectFromName ?? job.collectFrom.address,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (job.deliverToArea != null) ...[
              Gap.sm,
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.place_outlined, size: 16),
                  Gap.sm,
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Towards',
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: theme.colorScheme.outline),
                        ),
                        Text(job.deliverToArea!, style: theme.textTheme.bodyMedium),
                      ],
                    ),
                  ),
                ],
              ),
            ],
            Gap.md,
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                if (job.distanceM != null)
                  Text(
                    fmt.distance(job.distanceM),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                if (job.durationS != null)
                  Text(
                    fmt.duration(job.durationS),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                if (job.readyInMinutes != null)
                  Text(
                    'ready in ~${job.readyInMinutes} min',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                if (job.weightKg != null)
                  Text(
                    '${job.weightKg} kg',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                if (job.requiresSignature)
                  Text(
                    'signature required',
                    style: theme.textTheme.bodySmall?.copyWith(color: AppColors.warning),
                  ),
              ],
            ),
            Gap.lg,
            BusyButton(label: 'Take this job', busy: _busy, onPressed: _accept),
          ],
        ),
      ),
    );
  }
}

/// The job the courier is holding, and its next step.
class _CurrentJob extends ConsumerStatefulWidget {
  const _CurrentJob({required this.job});

  final ActiveDeliveryJob job;

  @override
  ConsumerState<_CurrentJob> createState() => _CurrentJobState();
}

class _CurrentJobState extends ConsumerState<_CurrentJob> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);

    try {
      await action();
      ref.invalidate(currentDeliveryProvider);
      ref.invalidate(availableDeliveriesProvider);
      ref.invalidate(earningsSummaryProvider);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Hands the job back before collection.
  ///
  /// Only offered while the parcel or order is still at its origin: once it is
  /// in the courier's hands the backend refuses, because releasing it then
  /// would leave goods with nobody responsible for them.
  Future<void> _release() async {
    final controller = TextEditingController();

    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Give up this job?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('It goes back to the pool for another courier.'),
            Gap.md,
            TextField(
              controller: controller,
              autofocus: true,
              maxLength: 200,
              decoration: const InputDecoration(hintText: 'Reason (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep it')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Release'),
          ),
        ],
      ),
    );

    if (reason == null) return;

    final api = ref.read(apiProvider).driver;
    await _run(
      () => widget.job.isFood
          ? api.releaseFoodDelivery(widget.job.id, reason: reason)
          : api.releaseParcelJob(widget.job.id, reason: reason),
    );
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Row(
          children: [
            StatusBadge(status: job.status, labels: deliveryStatusLabel),
            const Spacer(),
            Text(
              job.reference,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
        Gap.lg,
        _Waypoint(
          icon: Icons.storefront_outlined,
          colour: AppColors.warning,
          label: 'Collect from',
          contact: job.collectFrom,
        ),
        Gap.md,
        _Waypoint(
          icon: Icons.place,
          colour: AppColors.danger,
          label: 'Deliver to',
          contact: job.deliverTo,
        ),
        Gap.lg,
        if (job.isFood && job.items.isNotEmpty) ...[
          SectionCard(
            title: 'Order (${job.itemCount} items)',
            child: Column(
              children: [
                for (final item in job.items)
                  DetailRow(label: item.name, value: '× ${item.quantity}'),
              ],
            ),
          ),
          Gap.lg,
        ],
        if (!job.isFood) ...[
          SectionCard(
            title: 'Parcel',
            child: Column(
              children: [
                if (job.parcelType != null) DetailRow(label: 'Type', value: job.parcelType!),
                if (job.weightKg != null) DetailRow(label: 'Weight', value: '${job.weightKg} kg'),
                if (job.requiresSignature)
                  const DetailRow(label: 'Signature', value: 'Required on delivery'),
                if (job.notes != null && job.notes!.isNotEmpty)
                  DetailRow(label: 'Notes', value: job.notes!),
              ],
            ),
          ),
          Gap.lg,
        ],
        SectionCard(
          child: Column(
            children: [
              if (job.earning != null)
                DetailRow(
                  label: 'You earn',
                  value: fmt.money(job.earning, currency: job.currency),
                  emphasise: true,
                  valueColor: AppColors.success,
                ),
              // Only present when the customer genuinely still owes cash. A
              // null means nothing to collect, and is never rendered as zero.
              if (job.cashToCollect != null)
                DetailRow(
                  label: 'Collect from customer',
                  value: fmt.money(job.cashToCollect, currency: job.currency),
                  emphasise: true,
                  valueColor: AppColors.warning,
                ),
              if (job.distanceM != null)
                DetailRow(label: 'Distance', value: fmt.distance(job.distanceM)),
            ],
          ),
        ),
        Gap.xl,
        _NextStep(job: job, busy: _busy, run: _run),
        Gap.md,
        if (const {'ASSIGNED', 'HEADING_TO_PICKUP'}.contains(job.status))
          OutlinedButton.icon(
            onPressed: _busy ? null : _release,
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
            icon: const Icon(Icons.undo_rounded),
            label: const Text('Give up this job'),
          ),
      ],
    );
  }
}

class _NextStep extends ConsumerWidget {
  const _NextStep({required this.job, required this.busy, required this.run});

  final ActiveDeliveryJob job;
  final bool busy;
  final Future<void> Function(Future<void> Function()) run;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiProvider).driver;

    // Each service has its own lifecycle in the backend; the app offers only
    // the one transition that is valid next, and the backend re-checks it.
    final (label, icon, action) = job.isFood
        ? switch (job.status) {
            'ASSIGNED' => (
                'Heading to the restaurant',
                Icons.directions_bike_rounded,
                () => run(() => api.foodHeadingToPickup(job.id)),
              ),
            'HEADING_TO_PICKUP' => (
                'I have arrived',
                Icons.location_on_rounded,
                () => run(() => api.foodArrived(job.id)),
              ),
            'AT_PICKUP' => (
                'Collected the order',
                Icons.shopping_bag_rounded,
                () => run(() => api.foodPickedUp(job.id)),
              ),
            'PICKED_UP' => (
                'On my way to the customer',
                Icons.navigation_rounded,
                () => run(() => api.foodDelivering(job.id)),
              ),
            'DELIVERING' => (
                'Delivered',
                Icons.check_rounded,
                () => run(() => api.foodDelivered(job.id)),
              ),
            _ => (null, null, null),
          }
        : switch (job.status) {
            'ASSIGNED' => (
                'Heading to collection',
                Icons.directions_bike_rounded,
                () => run(() => api.parcelHeadingToPickup(job.id)),
              ),
            'HEADING_TO_PICKUP' => (
                'Collected the parcel',
                Icons.inventory_2_rounded,
                () => run(() => api.parcelPickedUp(job.id)),
              ),
            'PICKED_UP' => (
                'On my way to deliver',
                Icons.navigation_rounded,
                () => run(() => api.parcelInTransit(job.id)),
              ),
            'IN_TRANSIT' => (
                'Delivered',
                Icons.check_rounded,
                () => run(() => api.parcelDelivered(job.id)),
              ),
            _ => (null, null, null),
          };

    if (label == null) return const SizedBox.shrink();

    return BusyButton(label: label, icon: icon, busy: busy, onPressed: action);
  }
}

class _Waypoint extends StatelessWidget {
  const _Waypoint({
    required this.icon,
    required this.colour,
    required this.label,
    required this.contact,
  });

  final IconData icon;
  final Color colour;
  final String label;
  final DeliveryContact contact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SectionCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: colour),
          Gap.md,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
                if (contact.name != null)
                  Text(contact.name!, style: theme.textTheme.titleSmall),
                Text(contact.address, style: theme.textTheme.bodyMedium),
                if (contact.note != null && contact.note!.isNotEmpty)
                  Text(
                    contact.note!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.outline,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
              ],
            ),
          ),
          Column(
            children: [
              IconButton.filledTonal(
                tooltip: 'Navigate',
                onPressed: () => launchUrl(
                  Uri.parse('geo:${contact.lat},${contact.lng}?q=${contact.lat},${contact.lng}'),
                  mode: LaunchMode.externalApplication,
                ),
                icon: const Icon(Icons.navigation_outlined, size: 18),
              ),
              if (contact.phone != null)
                IconButton(
                  tooltip: 'Call',
                  onPressed: () => launchUrl(Uri.parse('tel:${contact.phone}')),
                  icon: const Icon(Icons.phone, size: 18),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
