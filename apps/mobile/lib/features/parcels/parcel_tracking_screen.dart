import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/maps/map_view.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../models/parcel.dart';
import '../ratings/rating_sheet.dart';
import 'parcel_providers.dart';

class ParcelTrackingScreen extends ConsumerWidget {
  const ParcelTrackingScreen({super.key, required this.parcelId});

  final String parcelId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final parcel = ref.watch(parcelStreamProvider(parcelId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your parcel'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/parcel'),
        ),
      ),
      body: parcel.when(
        loading: () => const LoadingState(message: 'Loading your parcel…'),
        error: (error, _) => parcel.value == null
            ? ErrorState(
                error: error,
                onRetry: () => ref.invalidate(parcelStreamProvider(parcelId)),
              )
            : _ParcelBody(parcel: parcel.value!, stale: true),
        data: (value) => _ParcelBody(parcel: value),
      ),
    );
  }
}

class _ParcelBody extends ConsumerWidget {
  const _ParcelBody({required this.parcel, this.stale = false});

  final ParcelDetail parcel;
  final bool stale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final tracking = ref.watch(parcelTrackingProvider(parcel.id));
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        if (stale) ...[
          const InfoNote(
            icon: Icons.cloud_off_rounded,
            message: 'Showing the last update we received. We are still trying to reconnect.',
          ),
          Gap.md,
        ],
        Row(
          children: [
            StatusBadge(status: parcel.status, labels: parcelStatusLabel),
            const Spacer(),
            Text(
              parcel.reference,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
        Gap.lg,
        if (parcel.route?.polyline != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: MapView(
              tileUrlTemplate: config.tileUrlTemplate,
              attribution: config.tileAttribution,
              routePolyline: parcel.route!.polyline,
              height: 200,
            ),
          ),
          Gap.md,
          const InfoNote(
            icon: Icons.info_outline_rounded,
            message: "The planned route is shown. The courier's live position is not available "
                'yet, so no moving marker is drawn.',
          ),
          Gap.lg,
        ],
        if (parcel.courier != null) ...[
          SectionCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: theme.colorScheme.primaryContainer,
                  child: Text(
                    parcel.courier!.firstName.isEmpty
                        ? '?'
                        : parcel.courier!.firstName[0].toUpperCase(),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Gap.md,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(parcel.courier!.firstName, style: theme.textTheme.titleSmall),
                      Text(
                        parcel.courier!.rating == null
                            ? 'Your courier'
                            : '★ ${parcel.courier!.rating}',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                    ],
                  ),
                ),
                if (parcel.courier!.phone != null)
                  IconButton.filledTonal(
                    tooltip: 'Call courier',
                    onPressed: () => launchUrl(Uri.parse('tel:${parcel.courier!.phone}')),
                    icon: const Icon(Icons.phone),
                  ),
              ],
            ),
          ),
          Gap.lg,
        ],
        SectionCard(
          title: 'Journey',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Endpoint(
                icon: Icons.trip_origin,
                colour: AppColors.brand,
                label: 'Collect from',
                address: parcel.pickupAddress,
                contact: parcel.pickupContactName,
                phone: parcel.pickupContactPhone,
              ),
              Gap.md,
              _Endpoint(
                icon: Icons.place,
                colour: AppColors.danger,
                label: 'Deliver to',
                address: parcel.dropoffAddress,
                contact: parcel.receiverName,
                phone: parcel.receiverPhone,
              ),
              const Divider(height: 24),
              DetailRow(label: 'Parcel', value: parcel.parcelTypeName),
              DetailRow(label: 'Vehicle', value: parcel.vehicleTypeName),
              if (parcel.weightKg != null)
                DetailRow(label: 'Weight', value: '${parcel.weightKg} kg'),
              if (parcel.requiresSignature)
                const DetailRow(label: 'Signature', value: 'Required on delivery'),
              if (parcel.route?.distanceM != null)
                DetailRow(label: 'Distance', value: fmt.distance(parcel.route!.distanceM)),
              if (parcel.total != null)
                DetailRow(
                  label: 'Charge',
                  value: fmt.money(parcel.total, currency: parcel.currency ?? 'LKR'),
                  emphasise: true,
                ),
              if (parcel.paymentMethod != null)
                DetailRow(
                  label: 'Payment',
                  value:
                      '${labelFor(paymentMethodLabel, parcel.paymentMethod!)} · ${labelFor(paymentStatusLabel, parcel.paymentStatus ?? 'PENDING')}',
                ),
            ],
          ),
        ),
        Gap.lg,
        SectionCard(
          title: 'History',
          child: tracking.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: LoadingState(),
            ),
            error: (error, _) => ErrorState(error: error, compact: true),
            data: (page) => page.items.isEmpty
                ? const Text('Nothing recorded yet.')
                : Column(
                    children: [
                      for (final entry in page.items) _TrackingRow(entry: entry),
                    ],
                  ),
          ),
        ),
        Gap.lg,
        if (parcel.cancellationReason != null) ...[
          InfoNote(icon: Icons.cancel_outlined, message: parcel.cancellationReason!),
          Gap.lg,
        ],
        if (parcel.canCancel) _CancelParcelButton(parcel: parcel),
        if (parcel.status == 'DELIVERED')
          FilledButton.icon(
            onPressed: () => showRatingSheet(
              context,
              kind: 'parcel',
              id: parcel.id,
              title: 'Rate this delivery',
            ),
            icon: const Icon(Icons.star_rounded),
            label: const Text('Rate this delivery'),
          ),
      ],
    );
  }
}

class _Endpoint extends StatelessWidget {
  const _Endpoint({
    required this.icon,
    required this.colour,
    required this.label,
    required this.address,
    required this.contact,
    required this.phone,
  });

  final IconData icon;
  final Color colour;
  final String label;
  final String address;
  final String contact;
  final String phone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
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
              Text(
                '$contact · ${fmt.phone(phone)}',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TrackingRow extends StatelessWidget {
  const _TrackingRow({required this.entry});

  final ParcelTrackingEntry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.circle, size: 8, color: theme.colorScheme.primary),
          Gap.md,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  labelFor(parcelStatusLabel, entry.status),
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
                if (entry.note != null)
                  Text(
                    entry.note!,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
              ],
            ),
          ),
          Gap.sm,
          Text(
            fmt.relativeTime(entry.createdAt),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        ],
      ),
    );
  }
}

class _CancelParcelButton extends ConsumerStatefulWidget {
  const _CancelParcelButton({required this.parcel});

  final ParcelDetail parcel;

  @override
  ConsumerState<_CancelParcelButton> createState() => _CancelParcelButtonState();
}

class _CancelParcelButtonState extends ConsumerState<_CancelParcelButton> {
  bool _busy = false;

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this parcel?'),
        content: const Text('If a courier has already collected it, cancellation is not possible.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel parcel'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);

    try {
      await ref.read(apiProvider).parcels.cancel(widget.parcel.id);
      ref.invalidate(parcelStreamProvider(widget.parcel.id));
      ref.invalidate(parcelsProvider);
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
      label: const Text('Cancel parcel'),
    );
  }
}
