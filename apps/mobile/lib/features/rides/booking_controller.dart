import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/errors/api_exception.dart';
import '../../core/providers.dart';
import '../../models/auth.dart';
import '../../models/common.dart';
import '../../models/ride.dart';
import '../../models/shared_ride.dart';

enum RideMode { solo, shared }

/// Everything the booking screen is holding.
///
/// Note what is absent: there is no computed fare, no eligibility flag and no
/// saving. Those exist only as values the backend returned, because the
/// application is not allowed to decide any of them.
class BookingState {
  const BookingState({
    this.pickup,
    this.dropoff,
    this.mode = RideMode.solo,
    this.seats = 1,
    this.selectedVehicleTypeId,
    this.genderPreference = GenderPreference.any,
    this.promotionCode,
    this.note,
    this.scheduledFor,
    this.estimates = const AsyncValue.data([]),
    this.sharedResult,
    this.quoting = false,
    this.booking = false,
    this.error,
  });

  final Place? pickup;
  final Place? dropoff;
  final RideMode mode;
  final int seats;
  final String? selectedVehicleTypeId;
  final GenderPreference genderPreference;
  final String? promotionCode;
  final String? note;
  final DateTime? scheduledFor;

  /// Solo prices per vehicle class, straight from `/rides/estimate`.
  final AsyncValue<List<VehicleEstimate>> estimates;

  /// Shared offers, straight from `/rides/shared/search`. Null until a search
  /// has run for the current journey.
  final AsyncValue<SharedRideSearchResult>? sharedResult;

  final bool quoting;
  final bool booking;
  final String? error;

  bool get hasJourney => pickup != null && dropoff != null;

  bool get isShared => mode == RideMode.shared;

  VehicleEstimate? get selectedVehicle {
    final list = estimates.value;
    if (list == null || list.isEmpty) return null;

    for (final estimate in list) {
      if (estimate.vehicleTypeId == selectedVehicleTypeId) return estimate;
    }
    return list.first;
  }

  BookingState copyWith({
    Place? pickup,
    Place? dropoff,
    RideMode? mode,
    int? seats,
    String? selectedVehicleTypeId,
    GenderPreference? genderPreference,
    String? promotionCode,
    String? note,
    DateTime? scheduledFor,
    AsyncValue<List<VehicleEstimate>>? estimates,
    AsyncValue<SharedRideSearchResult>? sharedResult,
    bool? quoting,
    bool? booking,
    String? error,
    bool clearError = false,
    bool clearShared = false,
    bool clearSchedule = false,
    bool clearPromotion = false,
  }) =>
      BookingState(
        pickup: pickup ?? this.pickup,
        dropoff: dropoff ?? this.dropoff,
        mode: mode ?? this.mode,
        seats: seats ?? this.seats,
        selectedVehicleTypeId: selectedVehicleTypeId ?? this.selectedVehicleTypeId,
        genderPreference: genderPreference ?? this.genderPreference,
        promotionCode: clearPromotion ? null : (promotionCode ?? this.promotionCode),
        note: note ?? this.note,
        scheduledFor: clearSchedule ? null : (scheduledFor ?? this.scheduledFor),
        estimates: estimates ?? this.estimates,
        sharedResult: clearShared ? null : (sharedResult ?? this.sharedResult),
        quoting: quoting ?? this.quoting,
        booking: booking ?? this.booking,
        error: clearError ? null : (error ?? this.error),
      );
}

class BookingController extends Notifier<BookingState> {
  CancelToken? _quoteToken;
  CancelToken? _sharedToken;

  @override
  BookingState build() {
    ref.onDispose(() {
      _quoteToken?.cancel();
      _sharedToken?.cancel();
    });

    // The safety preference the person already chose in their profile is the
    // sensible starting point for a shared ride.
    final preferences = ref.read(currentSafetyPreferencesProvider);

    return BookingState(genderPreference: preferences ?? GenderPreference.any);
  }

  void setPickup(Place? place) {
    state = state.copyWith(pickup: place, clearShared: true, clearError: true);
    unawaited(refreshQuotes());
  }

  void setDropoff(Place? place) {
    state = state.copyWith(dropoff: place, clearShared: true, clearError: true);
    unawaited(refreshQuotes());
  }

  /// Swaps the two ends of the journey.
  void swap() {
    final pickup = state.pickup;
    final dropoff = state.dropoff;
    if (pickup == null || dropoff == null) return;

    state = state.copyWith(pickup: dropoff, dropoff: pickup, clearShared: true);
    unawaited(refreshQuotes());
  }

  void setMode(RideMode mode) {
    if (state.mode == mode) return;
    state = state.copyWith(mode: mode, clearError: true);

    if (mode == RideMode.shared) {
      unawaited(searchShared());
    }
  }

  void setSeats(int seats) {
    state = state.copyWith(seats: seats.clamp(1, 6), clearShared: true);
    if (state.isShared) unawaited(searchShared());
  }

  void selectVehicle(String vehicleTypeId) {
    state = state.copyWith(selectedVehicleTypeId: vehicleTypeId);
    if (state.isShared) unawaited(searchShared());
  }

  void setGenderPreference(GenderPreference preference) {
    state = state.copyWith(genderPreference: preference, clearShared: true);
    if (state.isShared) unawaited(searchShared());
  }

  void setPromotionCode(String? code) {
    state = code == null || code.isEmpty
        ? state.copyWith(clearPromotion: true)
        : state.copyWith(promotionCode: code);
  }

  void setNote(String? note) => state = state.copyWith(note: note);

  void setSchedule(DateTime? when) {
    state = when == null
        ? state.copyWith(clearSchedule: true, clearShared: true)
        : state.copyWith(scheduledFor: when, clearShared: true);
    unawaited(refreshQuotes());
  }

  void reset() => state = BookingState(genderPreference: state.genderPreference);

  /// Re-prices the journey.
  ///
  /// The previous request is cancelled first: picking a new destination while
  /// an older estimate is still in flight must not let the stale answer land
  /// afterwards and show the wrong price.
  Future<void> refreshQuotes() async {
    final pickup = state.pickup;
    final dropoff = state.dropoff;

    if (pickup == null || dropoff == null) {
      state = state.copyWith(estimates: const AsyncValue.data([]), quoting: false);
      return;
    }

    _quoteToken?.cancel();
    final token = CancelToken();
    _quoteToken = token;

    state = state.copyWith(quoting: true, clearError: true);

    try {
      final estimates = await ref.read(apiProvider).rides.estimate(
            pickup: pickup,
            dropoff: dropoff,
            scheduledPickupAt: state.scheduledFor,
            cancelToken: token,
          );

      if (token.isCancelled) return;

      state = state.copyWith(
        estimates: AsyncValue.data(estimates),
        quoting: false,
        selectedVehicleTypeId: state.selectedVehicleTypeId ??
            (estimates.isNotEmpty ? estimates.first.vehicleTypeId : null),
      );

      if (state.isShared) unawaited(searchShared());
    } on ApiException catch (error, stack) {
      if (error.kind == ApiErrorKind.cancelled || token.isCancelled) return;
      state = state.copyWith(estimates: AsyncValue.error(error, stack), quoting: false);
    }
  }

  /// Asks the backend which journeys already under way this one could join.
  ///
  /// Every part of the answer — which rides, in what order, at what price, with
  /// what saving — is the matching engine's. Nothing here inspects a route.
  Future<void> searchShared() async {
    final pickup = state.pickup;
    final dropoff = state.dropoff;
    if (pickup == null || dropoff == null) return;

    _sharedToken?.cancel();
    final token = CancelToken();
    _sharedToken = token;

    state = state.copyWith(sharedResult: const AsyncValue.loading());

    try {
      final result = await ref.read(apiProvider).rides.searchShared(
            pickup: pickup,
            dropoff: dropoff,
            seats: state.seats,
            vehicleTypeId: state.selectedVehicleTypeId,
            genderPreference: state.genderPreference,
            scheduledPickupAt: state.scheduledFor,
            cancelToken: token,
          );

      if (token.isCancelled) return;
      state = state.copyWith(sharedResult: AsyncValue.data(result));
    } on ApiException catch (error, stack) {
      if (error.kind == ApiErrorKind.cancelled || token.isCancelled) return;
      state = state.copyWith(sharedResult: AsyncValue.error(error, stack));
    }
  }

  /// Books a solo ride. Returns the ride id, or null if the backend refused.
  Future<String?> bookSolo() async {
    final pickup = state.pickup;
    final dropoff = state.dropoff;
    final vehicle = state.selectedVehicle;

    if (pickup == null || dropoff == null || vehicle == null) return null;

    state = state.copyWith(booking: true, clearError: true);

    try {
      final ride = await ref.read(apiProvider).rides.create(
            rideType: 'SOLO',
            vehicleTypeId: vehicle.vehicleTypeId,
            pickup: pickup,
            dropoff: dropoff,
            seats: state.seats,
            note: state.note,
            promotionCode: state.promotionCode,
            scheduledPickupAt: state.scheduledFor,
          );

      state = state.copyWith(booking: false);
      return ride.rideId;
    } on ApiException catch (error) {
      state = state.copyWith(booking: false, error: error.message);
      return null;
    }
  }

  /// Joins an existing shared ride.
  ///
  /// The seat is only really taken when this succeeds: the backend re-checks
  /// capacity and safety under a row lock, so an offer shown a moment ago can
  /// legitimately be refused here. That refusal is surfaced as-is.
  Future<String?> joinShared(SharedRideOffer offer) async {
    final result = state.sharedResult?.value;
    if (result == null) return null;

    state = state.copyWith(booking: true, clearError: true);

    try {
      final joined = await ref.read(apiProvider).rides.joinShared(
            requestId: result.requestId,
            rideId: offer.rideId,
            note: state.note,
          );

      state = state.copyWith(booking: false);

      // The ride id is returned either way: the passenger can watch their
      // request on the ride screen while the driver decides.
      return joined.rideId;
    } on ApiException catch (error) {
      state = state.copyWith(booking: false, error: error.message);

      // A seat taken or a ride that closed means the offer list is stale;
      // re-running the search is more useful than leaving a dead offer on
      // screen.
      if (error.kind == ApiErrorKind.conflict) unawaited(searchShared());

      return null;
    }
  }

  /// Books a brand-new shared ride, offering its spare seats to others.
  Future<String?> bookSharedNew() async {
    final pickup = state.pickup;
    final dropoff = state.dropoff;
    final vehicle = state.selectedVehicle;

    if (pickup == null || dropoff == null || vehicle == null) return null;

    state = state.copyWith(booking: true, clearError: true);

    try {
      final ride = await ref.read(apiProvider).rides.create(
            rideType: 'SHARED',
            vehicleTypeId: vehicle.vehicleTypeId,
            pickup: pickup,
            dropoff: dropoff,
            seats: state.seats,
            note: state.note,
            promotionCode: state.promotionCode,
            genderPreference: state.genderPreference,
            scheduledPickupAt: state.scheduledFor,
          );

      state = state.copyWith(booking: false);
      return ride.rideId;
    } on ApiException catch (error) {
      state = state.copyWith(booking: false, error: error.message);
      return null;
    }
  }
}

final bookingControllerProvider =
    NotifierProvider<BookingController, BookingState>(BookingController.new);

/// The safety preference stored on the profile, used as the starting point for
/// a shared ride so the person does not have to restate it every booking.
final currentSafetyPreferencesProvider = Provider<GenderPreference?>(
  (ref) => ref.watch(currentUserProvider)?.sharedRidePrefs?.genderPreference,
);
