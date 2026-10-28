import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/location/location_providers.dart';
import '../../core/location/location_service.dart';
import '../../core/providers.dart';
import '../../core/realtime/live_updates.dart';
import '../../models/delivery.dart';
import '../../models/driver.dart';

/// Approval, presence, vehicles and documents. Everything else on the driver
/// side reads from this, because none of it can be decided without it.
final driverProfileProvider = FutureProvider<DriverProfile>(
  (ref) => ref.watch(apiProvider).driver.profile(),
);

/// Open ride requests.
///
/// Polled, since there is no dispatch push. The backend refuses this list when
/// the driver is offline or has no vehicle selected, which is surfaced as-is
/// rather than shown as an empty board.
final rideRequestsProvider = StreamProvider.autoDispose<List<RideRequestOffer>>((ref) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<List<RideRequestOffer>>(
    () => api.driver.availableRides(),
    interval: const Duration(seconds: 12),
  );
});

/// The ride the driver is working, refreshed while it is under way.
///
/// This is also how a driver learns that a shared passenger has been added: the
/// stop sequence and seat count come back changed on the next poll.
final driverActiveRideProvider = StreamProvider.autoDispose<DriverActiveRide?>((ref) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<DriverActiveRide?>(
    () => api.driver.activeRide(),
    interval: const Duration(seconds: 10),
  );
});

/// Open delivery jobs across food and parcel, filtered to what this driver has
/// actually opted into.
final availableDeliveriesProvider =
    FutureProvider.autoDispose<List<DeliveryJobOffer>>((ref) async {
  final profile = await ref.watch(driverProfileProvider.future);
  final availability = profile.availability;

  if (!availability.isOnline) return const [];

  return ref.watch(apiProvider).driver.availableDeliveries(
        food: availability.acceptsFood,
        parcel: availability.acceptsParcel,
      );
});

final currentDeliveryProvider = StreamProvider.autoDispose<ActiveDeliveryJob?>((ref) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<ActiveDeliveryJob?>(
    () => api.driver.currentDelivery(),
    interval: const Duration(seconds: 15),
  );
});

final earningsSummaryProvider = FutureProvider.autoDispose<EarningsSummary>(
  (ref) => ref.watch(apiProvider).driver.earningsSummary(),
);

final earningsProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(apiProvider).driver.earnings(limit: 30),
);

/// Changes to presence and the kinds of work accepted.
///
/// Every change goes to the backend and the profile is re-read from the
/// response, so what the app shows is the server's state and not a local guess
/// that could disagree with what dispatch believes.
class AvailabilityActions {
  const AvailabilityActions(this._ref);

  final Ref _ref;

  Future<void> goOnline({String? vehicleId}) => _update(
        presence: 'ONLINE',
        activeVehicleId: vehicleId,
      );

  Future<void> goOffline() => _update(presence: 'OFFLINE');

  Future<void> setWorkTypes({bool? shared, bool? food, bool? parcel}) => _update(
        acceptsShared: shared,
        acceptsFood: food,
        acceptsParcel: parcel,
      );

  Future<void> selectVehicle(String vehicleId) => _update(activeVehicleId: vehicleId);

  Future<void> _update({
    String? presence,
    String? activeVehicleId,
    bool? acceptsShared,
    bool? acceptsFood,
    bool? acceptsParcel,
  }) async {
    await _ref.read(apiProvider).driver.updateAvailability(
          presence: presence,
          activeVehicleId: activeVehicleId,
          acceptsShared: acceptsShared,
          acceptsFood: acceptsFood,
          acceptsParcel: acceptsParcel,
        );

    _ref.invalidate(driverProfileProvider);
    _ref.invalidate(availableDeliveriesProvider);
  }
}

final availabilityActionsProvider = Provider<AvailabilityActions>(AvailabilityActions.new);

/// Reports the vehicle's position while the driver is online.
///
/// Two things keep this from hammering the database. The position stream is
/// distance-filtered, so a parked vehicle produces nothing; and a minimum
/// interval is enforced here, so crawling traffic cannot turn into a ping per
/// second. The backend thins the history further on its own.
class LocationReporter {
  LocationReporter(this._ref);

  final Ref _ref;

  StreamSubscription<LocationFix>? _subscription;
  DateTime? _lastSent;
  bool _sending = false;

  // While carrying a passenger the position is worth more: the map they are
  // watching is how they find the car. Between jobs it is worth much less, so
  // the interval opens up and the radio stays asleep.
  static const _minIntervalOnTrip = Duration(seconds: 8);
  static const _minIntervalIdle = Duration(seconds: 45);
  static const _minDistanceOnTripM = 20;
  static const _minDistanceIdleM = 100;

  bool _onTrip = false;

  bool get isRunning => _subscription != null;

  Future<void> start({bool onTrip = false}) async {
    if (_subscription != null && _onTrip == onTrip) return;

    // Changing cadence means a new stream; the old one is dropped first.
    await stop();
    _onTrip = onTrip;

    final location = _ref.read(locationServiceProvider);

    // Without permission there is nothing to report. The failure is left to
    // the caller to explain; this simply does not start.
    await location.ensurePermission();

    _subscription = location
        .watch(distanceFilterM: onTrip ? _minDistanceOnTripM : _minDistanceIdleM)
        .listen(
      _report,
      onError: (Object _) {
        // A dropped fix is not worth surfacing: the next one replaces it.
      },
    );
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
    _lastSent = null;
  }

  Future<void> _report(LocationFix fix) async {
    if (_sending) return;

    final minimum = _onTrip ? _minIntervalOnTrip : _minIntervalIdle;
    final last = _lastSent;
    if (last != null && DateTime.now().difference(last) < minimum) return;

    _sending = true;

    try {
      await _ref.read(apiProvider).driver.reportLocation(
            lat: fix.point.lat,
            lng: fix.point.lng,
            headingDeg: fix.headingDeg,
            speedKph: fix.speedKph,
            accuracyM: fix.accuracyM,
            recordedAt: fix.at,
          );
      _lastSent = DateTime.now();
    } on ApiException {
      // A failed ping is replaced by the next one. Surfacing it would put an
      // error over a driver's navigation for something that self-heals.
    } finally {
      _sending = false;
    }
  }
}

final locationReporterProvider = Provider<LocationReporter>((ref) {
  final reporter = LocationReporter(ref);
  ref.onDispose(reporter.stop);
  return reporter;
});

/// Keeps position reporting matched to what the driver is actually doing.
///
/// Watched by the driver shell so it is active for as long as the driver is in
/// the driving side of the app: online with a passenger reports often, online
/// without one reports rarely, offline reports nothing at all.
final locationReportingProvider = Provider.autoDispose<void>((ref) {
  final online = ref.watch(driverProfileProvider).value?.availability.isOnline ?? false;
  final onTrip = ref.watch(driverActiveRideProvider).value != null;
  final reporter = ref.watch(locationReporterProvider);

  if (!online) {
    unawaited(reporter.stop());
    return;
  }

  unawaited(
    reporter.start(onTrip: onTrip).catchError((Object _) {
      // Permission was refused. The driver can still work; they are simply not
      // reporting a position, and the presence card is where that is explained.
    }),
  );
});
