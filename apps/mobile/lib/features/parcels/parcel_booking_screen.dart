import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/api_exception.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/networking/endpoints/parcels_api.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/payment_picker.dart';
import '../../core/widgets/states.dart';
import '../../models/common.dart';
import '../../models/parcel.dart';
import '../payments/wallet_providers.dart';
import '../rides/location_search_screen.dart';
import 'parcel_providers.dart';

/// Book a parcel delivery.
///
/// The flow is estimate → review → confirm. Which vehicle classes can carry a
/// given parcel, and what each costs, are the backend's answers: this screen
/// asks for a quote and shows what came back.
class ParcelBookingScreen extends ConsumerStatefulWidget {
  const ParcelBookingScreen({super.key});

  @override
  ConsumerState<ParcelBookingScreen> createState() => _ParcelBookingScreenState();
}

class _ParcelBookingScreenState extends ConsumerState<ParcelBookingScreen> {
  final _senderName = TextEditingController();
  final _senderPhone = TextEditingController();
  final _receiverName = TextEditingController();
  final _receiverPhone = TextEditingController();
  final _weight = TextEditingController();
  final _value = TextEditingController();
  final _notes = TextEditingController();
  final _promo = TextEditingController();

  Place? _pickup;
  Place? _dropoff;
  String? _parcelTypeId;
  String? _vehicleTypeId;
  String _paymentMethod = 'CASH';

  List<ParcelQuote> _quotes = const [];
  bool _quoting = false;
  bool _booking = false;
  String? _error;
  final Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    for (final controller in [
      _senderName,
      _senderPhone,
      _receiverName,
      _receiverPhone,
      _weight,
      _value,
      _notes,
      _promo,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _pickPlace({required bool isPickup}) async {
    final place = await Navigator.of(context).push<Place>(
      MaterialPageRoute(
        builder: (_) => LocationSearchScreen(
          title: isPickup ? 'Collect from' : 'Deliver to',
        ),
      ),
    );

    if (place == null || !mounted) return;

    setState(() {
      if (isPickup) {
        _pickup = place;
      } else {
        _dropoff = place;
      }
      _quotes = const [];
      _vehicleTypeId = null;
    });
  }

  bool _validateForQuote() {
    setState(() {
      _fieldErrors.clear();
      if (_pickup == null) _fieldErrors['pickup'] = 'Choose a collection point';
      if (_dropoff == null) _fieldErrors['dropoff'] = 'Choose a destination';
      if (_parcelTypeId == null) _fieldErrors['type'] = 'Choose what you are sending';
      if (_senderName.text.trim().isEmpty) _fieldErrors['senderName'] = 'Required';
      if (_senderPhone.text.trim().isEmpty) _fieldErrors['senderPhone'] = 'Required';
      if (_receiverName.text.trim().isEmpty) _fieldErrors['receiverName'] = 'Required';
      if (_receiverPhone.text.trim().isEmpty) _fieldErrors['receiverPhone'] = 'Required';
    });

    return _fieldErrors.isEmpty;
  }

  Future<void> _getQuotes() async {
    if (!_validateForQuote()) return;

    setState(() {
      _quoting = true;
      _error = null;
    });

    try {
      final quotes = await ref.read(apiProvider).parcels.estimate(
            pickup: ParcelContact(
              place: _pickup!,
              contactName: _senderName.text.trim(),
              contactPhone: _senderPhone.text.trim(),
            ),
            dropoff: ParcelContact(
              place: _dropoff!,
              contactName: _receiverName.text.trim(),
              contactPhone: _receiverPhone.text.trim(),
            ),
            parcelTypeId: _parcelTypeId!,
            weightKg: double.tryParse(_weight.text.trim()),
          );

      if (!mounted) return;
      setState(() {
        _quotes = quotes;
        _quoting = false;
        _vehicleTypeId = quotes.isNotEmpty ? quotes.first.vehicleTypeId : null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _quoting = false;
        _error = error.message;
        _fieldErrors.addAll(error.fieldErrors);
      });
    }
  }

  Future<void> _confirm() async {
    if (_vehicleTypeId == null) return;

    setState(() {
      _booking = true;
      _error = null;
    });

    try {
      final parcel = await ref.read(apiProvider).parcels.create(
            pickup: ParcelContact(
              place: _pickup!,
              contactName: _senderName.text.trim(),
              contactPhone: _senderPhone.text.trim(),
            ),
            dropoff: ParcelContact(
              place: _dropoff!,
              contactName: _receiverName.text.trim(),
              contactPhone: _receiverPhone.text.trim(),
            ),
            parcelTypeId: _parcelTypeId!,
            vehicleTypeId: _vehicleTypeId!,
            paymentMethod: _paymentMethod,
            weightKg: double.tryParse(_weight.text.trim()),
            declaredValue: double.tryParse(_value.text.trim()),
            notes: _notes.text.trim(),
            promotionCode: _promo.text.trim(),
          );

      ref.invalidate(parcelsProvider);
      if (!mounted) return;
      context.go('/parcel/${parcel.parcelId}');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _booking = false;
        _error = error.message;
        _fieldErrors.addAll(error.fieldErrors);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final types = ref.watch(parcelTypesProvider);
    final wallet = ref.watch(walletProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Send a parcel')),
      body: types.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(parcelTypesProvider),
        ),
        data: (parcelTypes) => ListView(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 8,
            bottom: MediaQuery.viewInsetsOf(context).bottom + 32,
          ),
          children: [
            SectionCard(
              title: 'Route',
              child: Column(
                children: [
                  _PlaceRow(
                    icon: Icons.trip_origin,
                    colour: AppColors.brand,
                    label: 'Collect from',
                    value: _pickup?.address,
                    error: _fieldErrors['pickup'],
                    onTap: () => _pickPlace(isPickup: true),
                  ),
                  Gap.sm,
                  _PlaceRow(
                    icon: Icons.place,
                    colour: AppColors.danger,
                    label: 'Deliver to',
                    value: _dropoff?.address,
                    error: _fieldErrors['dropoff'],
                    onTap: () => _pickPlace(isPickup: false),
                  ),
                ],
              ),
            ),
            Gap.lg,
            SectionCard(
              title: 'What are you sending?',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final type in parcelTypes)
                        ChoiceChip(
                          label: Text(type.name),
                          selected: _parcelTypeId == type.id,
                          onSelected: (_) => setState(() {
                            _parcelTypeId = type.id;
                            _quotes = const [];
                            _vehicleTypeId = null;
                          }),
                        ),
                    ],
                  ),
                  if (_fieldErrors['type'] != null) ...[
                    Gap.sm,
                    Text(
                      _fieldErrors['type']!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
                    ),
                  ],
                  if (_parcelTypeId != null) ...[
                    Gap.md,
                    _TypeNote(
                      type: parcelTypes.firstWhere((type) => type.id == _parcelTypeId),
                    ),
                  ],
                  Gap.lg,
                  AppField(
                    label: 'Weight in kg (optional)',
                    controller: _weight,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    errorText: _fieldErrors['weightKg'],
                    onChanged: (_) => setState(() => _quotes = const []),
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Declared value (optional)',
                    controller: _value,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    helper: 'Used if something goes wrong',
                    errorText: _fieldErrors['declaredValue'],
                  ),
                ],
              ),
            ),
            Gap.lg,
            SectionCard(
              title: 'Contacts',
              child: Column(
                children: [
                  AppField(
                    label: 'Your name',
                    controller: _senderName,
                    errorText: _fieldErrors['senderName'],
                    textInputAction: TextInputAction.next,
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Your phone',
                    controller: _senderPhone,
                    keyboardType: TextInputType.phone,
                    errorText: _fieldErrors['senderPhone'],
                    textInputAction: TextInputAction.next,
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Receiver name',
                    controller: _receiverName,
                    errorText: _fieldErrors['receiverName'],
                    textInputAction: TextInputAction.next,
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Receiver phone',
                    controller: _receiverPhone,
                    keyboardType: TextInputType.phone,
                    errorText: _fieldErrors['receiverPhone'],
                  ),
                ],
              ),
            ),
            Gap.lg,
            SectionCard(
              title: 'Notes (optional)',
              child: AppField(
                label: 'Anything the courier should know',
                controller: _notes,
                maxLines: 3,
                maxLength: 300,
              ),
            ),
            Gap.lg,
            if (_error != null) ...[FormError(message: _error!), Gap.lg],
            if (_quotes.isEmpty)
              BusyButton(label: 'Get a price', busy: _quoting, onPressed: _getQuotes)
            else
              _QuoteReview(
                quotes: _quotes,
                selectedVehicleTypeId: _vehicleTypeId,
                onSelect: (id) => setState(() => _vehicleTypeId = id),
                paymentMethod: _paymentMethod,
                onPaymentChanged: (method) => setState(() => _paymentMethod = method),
                walletBalance: wallet.value?.balance,
                walletCurrency: wallet.value?.currency ?? 'LKR',
                walletFrozen: wallet.value?.frozen ?? false,
                promoController: _promo,
                booking: _booking,
                onConfirm: _confirm,
                onChangeDetails: () => setState(() => _quotes = const []),
              ),
          ],
        ),
      ),
    );
  }
}

class _TypeNote extends StatelessWidget {
  const _TypeNote({required this.type});

  final ParcelType type;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (type.description != null)
          Text(
            type.description!,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        Text(
          'Up to ${type.maxWeightKg} kg'
          '${type.requiresSignature ? ' · signature required on delivery' : ''}',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
      ],
    );
  }
}

class _PlaceRow extends StatelessWidget {
  const _PlaceRow({
    required this.icon,
    required this.colour,
    required this.label,
    required this.value,
    required this.onTap,
    this.error,
  });

  final IconData icon;
  final Color colour;
  final String label;
  final String? value;
  final VoidCallback onTap;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(minHeight: 52),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(icon, size: 18, color: colour),
                Gap.md,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                      Text(
                        value ?? 'Choose a place',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: value == null
                              ? theme.colorScheme.outline
                              : theme.colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              error!,
              style: TextStyle(color: theme.colorScheme.error, fontSize: 12),
            ),
          ),
      ],
    );
  }
}

class _QuoteReview extends StatelessWidget {
  const _QuoteReview({
    required this.quotes,
    required this.selectedVehicleTypeId,
    required this.onSelect,
    required this.paymentMethod,
    required this.onPaymentChanged,
    required this.promoController,
    required this.booking,
    required this.onConfirm,
    required this.onChangeDetails,
    this.walletBalance,
    this.walletCurrency = 'LKR',
    this.walletFrozen = false,
  });

  final List<ParcelQuote> quotes;
  final String? selectedVehicleTypeId;
  final ValueChanged<String> onSelect;
  final String paymentMethod;
  final ValueChanged<String> onPaymentChanged;
  final TextEditingController promoController;
  final bool booking;
  final VoidCallback onConfirm;
  final VoidCallback onChangeDetails;
  final String? walletBalance;
  final String walletCurrency;
  final bool walletFrozen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selected = quotes.firstWhere(
      (quote) => quote.vehicleTypeId == selectedVehicleTypeId,
      orElse: () => quotes.first,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionCard(
          title: 'Choose a vehicle',
          trailing: TextButton(onPressed: onChangeDetails, child: const Text('Edit')),
          child: Column(
            children: [
              for (final quote in quotes) ...[
                InkWell(
                  onTap: () => onSelect(quote.vehicleTypeId),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: quote.vehicleTypeId == selected.vehicleTypeId
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outlineVariant,
                        width: quote.vehicleTypeId == selected.vehicleTypeId ? 2 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(quote.vehicleTypeName, style: theme.textTheme.titleSmall),
                              Text(
                                '${fmt.distance(quote.distanceM)} · ${fmt.duration(quote.durationS)} · picks up in ${quote.etaMinutes} min',
                                style: theme.textTheme.bodySmall
                                    ?.copyWith(color: theme.colorScheme.outline),
                              ),
                            ],
                          ),
                        ),
                        Gap.sm,
                        Text(
                          fmt.money(quote.total, currency: quote.currency),
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ),
                Gap.sm,
              ],
            ],
          ),
        ),
        Gap.lg,
        SectionCard(
          title: 'Price',
          child: Column(
            children: [
              for (final line in selected.breakdown)
                DetailRow(
                  label: line.label,
                  value: fmt.money(line.amount, currency: selected.currency),
                ),
              const Divider(height: 24),
              DetailRow(
                label: 'Total',
                value: fmt.money(selected.total, currency: selected.currency),
                emphasise: true,
              ),
            ],
          ),
        ),
        Gap.lg,
        SectionCard(
          title: 'Payment',
          child: Column(
            children: [
              PaymentPicker(
                value: paymentMethod,
                onChanged: onPaymentChanged,
                walletBalance: walletBalance,
                walletCurrency: walletCurrency,
                walletFrozen: walletFrozen,
              ),
              Gap.lg,
              AppField(
                label: 'Promo code (optional)',
                controller: promoController,
                hint: 'Enter a code',
              ),
            ],
          ),
        ),
        Gap.xl,
        BusyButton(
          label: 'Confirm and book',
          busy: booking,
          onPressed: onConfirm,
        ),
      ],
    );
  }
}
