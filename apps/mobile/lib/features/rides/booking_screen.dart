import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/maps/map_view.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../models/auth.dart';
import '../../models/common.dart';
import '../../models/shared_ride.dart';
import '../shared_rides/widgets/shared_offer_card.dart';
import 'booking_controller.dart';
import 'location_search_screen.dart';
import 'widgets/vehicle_option_tile.dart';

/// Book a ride, solo or shared.
///
/// The screen's whole job is to collect a journey and show what the backend
/// says about it. It never decides a price, whether a shared ride is
/// compatible, or what a passenger saves.
class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key});

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  Future<void> _pick({required bool isPickup}) async {
    final place = await Navigator.of(context).push<Place>(
      MaterialPageRoute(
        builder: (_) => LocationSearchScreen(
          title: isPickup ? 'Pick-up point' : 'Where to?',
        ),
      ),
    );

    if (place == null || !mounted) return;

    final controller = ref.read(bookingControllerProvider.notifier);
    isPickup ? controller.setPickup(place) : controller.setDropoff(place);
  }

  Future<void> _book() async {
    final controller = ref.read(bookingControllerProvider.notifier);
    final state = ref.read(bookingControllerProvider);

    final rideId = state.isShared ? await controller.bookSharedNew() : await controller.bookSolo();

    if (rideId == null || !mounted) return;

    controller.reset();
    if (mounted) context.go('/ride/$rideId');
  }

  Future<void> _join(SharedRideOffer offer) async {
    final rideId = await ref.read(bookingControllerProvider.notifier).joinShared(offer);
    if (rideId == null || !mounted) return;

    ref.read(bookingControllerProvider.notifier).reset();
    if (mounted) context.go('/ride/$rideId');
  }

  Future<void> _schedule() async {
    final now = DateTime.now();

    final date = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 30)),
      initialDate: now,
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(now.add(const Duration(minutes: 30))),
    );
    if (time == null || !mounted) return;

    ref.read(bookingControllerProvider.notifier).setSchedule(
          DateTime(date.year, date.month, date.day, time.hour, time.minute),
        );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(bookingControllerProvider);
    final config = ref.watch(appConfigProvider);

    final markers = <MapMarker>[
      if (state.pickup != null)
        MapMarker(point: state.pickup!.point, kind: MapMarkerKind.pickup),
      if (state.dropoff != null)
        MapMarker(point: state.dropoff!.point, kind: MapMarkerKind.dropoff),
    ];

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: MapView(
              tileUrlTemplate: config.tileUrlTemplate,
              attribution: config.tileAttribution,
              markers: markers,
            ),
          ),
          // The sheet is draggable so the map stays reachable on a small phone
          // even when the vehicle list is long.
          DraggableScrollableSheet(
            initialChildSize: state.hasJourney ? 0.62 : 0.38,
            minChildSize: 0.28,
            maxChildSize: 0.92,
            builder: (context, scrollController) => _Sheet(
              scrollController: scrollController,
              onPickPickup: () => _pick(isPickup: true),
              onPickDropoff: () => _pick(isPickup: false),
              onBook: _book,
              onJoin: _join,
              onSchedule: _schedule,
            ),
          ),
        ],
      ),
    );
  }
}

class _Sheet extends ConsumerWidget {
  const _Sheet({
    required this.scrollController,
    required this.onPickPickup,
    required this.onPickDropoff,
    required this.onBook,
    required this.onJoin,
    required this.onSchedule,
  });

  final ScrollController scrollController;
  final VoidCallback onPickPickup;
  final VoidCallback onPickDropoff;
  final VoidCallback onBook;
  final Future<void> Function(SharedRideOffer offer) onJoin;
  final VoidCallback onSchedule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingControllerProvider);
    final controller = ref.read(bookingControllerProvider.notifier);
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 16)],
      ),
      child: ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: theme.colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          _JourneyFields(onPickPickup: onPickPickup, onPickDropoff: onPickDropoff),
          Gap.lg,
          _ModeToggle(
            mode: state.mode,
            onChanged: controller.setMode,
          ),
          Gap.lg,
          if (state.error != null) ...[FormError(message: state.error!), Gap.lg],
          if (!state.hasJourney)
            const InfoNote(
              message: 'Choose where you are starting from and where you are going to see prices.',
            )
          else if (state.isShared)
            _SharedSection(onJoin: onJoin, onBook: onBook)
          else
            _SoloSection(onBook: onBook, onSchedule: onSchedule),
        ],
      ),
    );
  }
}

class _JourneyFields extends ConsumerWidget {
  const _JourneyFields({required this.onPickPickup, required this.onPickDropoff});

  final VoidCallback onPickPickup;
  final VoidCallback onPickDropoff;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingControllerProvider);
    final controller = ref.read(bookingControllerProvider.notifier);

    return Row(
      children: [
        Expanded(
          child: Column(
            children: [
              _PlaceField(
                icon: Icons.trip_origin,
                iconColour: AppColors.brand,
                hint: 'Pick-up point',
                value: state.pickup?.address,
                onTap: onPickPickup,
              ),
              Gap.sm,
              _PlaceField(
                icon: Icons.place,
                iconColour: AppColors.danger,
                hint: 'Where to?',
                value: state.dropoff?.address,
                onTap: onPickDropoff,
              ),
            ],
          ),
        ),
        if (state.hasJourney)
          IconButton(
            tooltip: 'Swap',
            onPressed: controller.swap,
            icon: const Icon(Icons.swap_vert_rounded),
          ),
      ],
    );
  }
}

class _PlaceField extends StatelessWidget {
  const _PlaceField({
    required this.icon,
    required this.iconColour,
    required this.hint,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColour;
  final String hint;
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final chosen = value != null && value!.isNotEmpty;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        // 52dp keeps the whole row comfortably tappable.
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: iconColour),
            Gap.md,
            Expanded(
              child: Text(
                chosen ? value! : hint,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: chosen ? theme.colorScheme.onSurface : theme.colorScheme.outline,
                  fontWeight: chosen ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModeToggle extends StatelessWidget {
  const _ModeToggle({required this.mode, required this.onChanged});

  final RideMode mode;
  final ValueChanged<RideMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<RideMode>(
      segments: const [
        ButtonSegment(
          value: RideMode.solo,
          icon: Icon(Icons.person_rounded),
          label: Text('Ride'),
        ),
        ButtonSegment(
          value: RideMode.shared,
          icon: Icon(Icons.groups_rounded),
          label: Text('Share & save'),
        ),
      ],
      selected: {mode},
      showSelectedIcon: false,
      onSelectionChanged: (selection) => onChanged(selection.first),
    );
  }
}

class _SoloSection extends ConsumerWidget {
  const _SoloSection({required this.onBook, required this.onSchedule});

  final VoidCallback onBook;
  final VoidCallback onSchedule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingControllerProvider);
    final controller = ref.read(bookingControllerProvider.notifier);
    final theme = Theme.of(context);

    return state.estimates.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: LoadingState(message: 'Pricing your trip…'),
      ),
      error: (error, _) => ErrorState(error: error, onRetry: controller.refreshQuotes),
      data: (estimates) {
        if (estimates.isEmpty) {
          return state.quoting
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 32),
                  child: LoadingState(message: 'Pricing your trip…'),
                )
              : const EmptyState(
                  title: 'No vehicles available',
                  message: 'We could not price this journey. Try a different pick-up point.',
                  icon: Icons.no_transfer_rounded,
                );
        }

        final selected = state.selectedVehicle;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Choose a vehicle', style: theme.textTheme.titleMedium),
            Gap.md,
            for (final estimate in estimates) ...[
              VehicleOptionTile(
                estimate: estimate,
                selected: estimate.vehicleTypeId == selected?.vehicleTypeId,
                onTap: () => controller.selectVehicle(estimate.vehicleTypeId),
              ),
              Gap.sm,
            ],
            Gap.md,
            _ExtrasRow(onSchedule: onSchedule),
            Gap.md,
            const _PaymentNote(),
            Gap.lg,
            BusyButton(
              label: selected == null
                  ? 'Book'
                  : 'Book for ${fmt.money(selected.soloFare, currency: selected.currency)}',
              busy: state.booking,
              onPressed: onBook,
            ),
          ],
        );
      },
    );
  }
}

class _SharedSection extends ConsumerWidget {
  const _SharedSection({required this.onJoin, required this.onBook});

  final Future<void> Function(SharedRideOffer offer) onJoin;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingControllerProvider);
    final controller = ref.read(bookingControllerProvider.notifier);
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SafetyPreferencePicker(
          value: state.genderPreference,
          onChanged: controller.setGenderPreference,
        ),
        Gap.lg,
        Text('Rides going your way', style: theme.textTheme.titleMedium),
        Gap.xs,
        Text(
          'These are journeys already under way that can pick you up along their route.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        Gap.md,
        switch (state.sharedResult) {
          null => const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: LoadingState(message: 'Looking for rides going your way…'),
            ),
          AsyncLoading() => const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: LoadingState(message: 'Looking for rides going your way…'),
            ),
          AsyncError(:final error) =>
            ErrorState(error: error, onRetry: controller.searchShared),
          AsyncValue(:final value?) => _SharedOffers(result: value, onJoin: onJoin),
        },
        Gap.lg,
        const Divider(),
        Gap.md,
        Text('Or start a new shared ride', style: theme.textTheme.titleSmall),
        Gap.xs,
        Text(
          'You travel now and your spare seats are offered to others going the same way. '
          'Your fare drops if someone joins.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        Gap.md,
        const _PaymentNote(),
        Gap.md,
        OutlinedButton(
          onPressed: state.booking ? null : onBook,
          child: const Text('Start a shared ride'),
        ),
      ],
    );
  }
}

class _SharedOffers extends StatelessWidget {
  const _SharedOffers({required this.result, required this.onJoin});

  final SharedRideSearchResult result;
  final Future<void> Function(SharedRideOffer offer) onJoin;

  @override
  Widget build(BuildContext context) {
    final offers = result.offers;

    if (offers.isEmpty) {
      return EmptyState(
        title: 'No shared rides right now',
        // The backend explains why when it can; that explanation is shown
        // verbatim rather than replaced with a guess.
        message: result.noMatchReason ??
            'Nothing is heading your way at the moment. You can start a shared ride instead, '
                'and others can join you.',
        icon: Icons.groups_outlined,
      );
    }

    return Column(
      children: [
        for (final offer in offers) ...[
          SharedOfferCard(offer: offer, onSelect: () => onJoin(offer)),
          Gap.md,
        ],
      ],
    );
  }
}

/// The shared-ride safety preference.
///
/// The options are exactly the values the backend accepts. The matching engine
/// enforces the choice against who is already on board, so this is a request,
/// not a filter applied here.
class _SafetyPreferencePicker extends StatelessWidget {
  const _SafetyPreferencePicker({required this.value, required this.onChanged});

  final GenderPreference value;
  final ValueChanged<GenderPreference> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.shield_outlined, size: 18, color: AppColors.shared),
            Gap.sm,
            Text('Who you share with', style: theme.textTheme.titleSmall),
          ],
        ),
        Gap.sm,
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final option in GenderPreference.values)
              ChoiceChip(
                label: Text(option.label),
                selected: value == option,
                onSelected: (_) => onChanged(option),
              ),
          ],
        ),
        Gap.xs,
        Text(
          value.description,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
      ],
    );
  }
}

class _ExtrasRow extends ConsumerWidget {
  const _ExtrasRow({required this.onSchedule});

  final VoidCallback onSchedule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingControllerProvider);
    final controller = ref.read(bookingControllerProvider.notifier);

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ActionChip(
          avatar: const Icon(Icons.schedule_rounded, size: 18),
          label: Text(
            state.scheduledFor == null ? 'Now' : fmt.dateTime(state.scheduledFor),
          ),
          onPressed: onSchedule,
        ),
        if (state.scheduledFor != null)
          ActionChip(
            avatar: const Icon(Icons.close_rounded, size: 18),
            label: const Text('Cancel schedule'),
            onPressed: () => controller.setSchedule(null),
          ),
        ActionChip(
          avatar: const Icon(Icons.local_offer_outlined, size: 18),
          label: Text(state.promotionCode ?? 'Add promo code'),
          onPressed: () => _promoDialog(context, ref),
        ),
        ActionChip(
          avatar: const Icon(Icons.sticky_note_2_outlined, size: 18),
          label: Text(state.note == null || state.note!.isEmpty ? 'Note for driver' : 'Note added'),
          onPressed: () => _noteDialog(context, ref),
        ),
      ],
    );
  }

  Future<void> _promoDialog(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(
      text: ref.read(bookingControllerProvider).promotionCode ?? '',
    );

    final code = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Promo code'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'Enter code'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, ''), child: const Text('Remove')),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Apply'),
          ),
        ],
      ),
    );

    if (code != null) {
      ref.read(bookingControllerProvider.notifier).setPromotionCode(code);
    }
  }

  Future<void> _noteDialog(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: ref.read(bookingControllerProvider).note ?? '');

    final note = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Note for the driver'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          maxLength: 200,
          decoration: const InputDecoration(hintText: 'e.g. the blue gate, next to the pharmacy'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (note != null) ref.read(bookingControllerProvider.notifier).setNote(note);
  }
}

/// States plainly how a ride is paid for.
///
/// Rides settle in cash; the backend refuses card and online payments outright
/// rather than accepting them and never charging. Showing a chooser that only
/// had one real option would be worse than saying so.
class _PaymentNote extends StatelessWidget {
  const _PaymentNote();

  @override
  Widget build(BuildContext context) {
    return const InfoNote(
      icon: Icons.payments_outlined,
      message: 'Rides are paid in cash to the driver. Card and online payment are not available '
          'yet. Your wallet can be used for food and parcel orders.',
    );
  }
}
