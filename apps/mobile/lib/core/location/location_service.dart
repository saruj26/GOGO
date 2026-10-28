import 'dart:async';

import 'package:geolocator/geolocator.dart';

import '../../models/common.dart';

/// Why the device has no position, so a screen can say something specific.
enum LocationDenial {
  serviceDisabled,
  permissionDenied,
  permissionDeniedForever,
  unavailable,
}

class LocationFix {
  const LocationFix({
    required this.point,
    this.accuracyM,
    this.headingDeg,
    this.speedKph,
    required this.at,
  });

  final GeoPoint point;
  final double? accuracyM;
  final double? headingDeg;
  final double? speedKph;
  final DateTime at;
}

class LocationFailure implements Exception {
  const LocationFailure(this.reason, this.message);

  final LocationDenial reason;
  final String message;

  @override
  String toString() => message;
}

/// Device positioning, behind an interface.
///
/// Tests get a fake without a platform channel, and the permission conversation
/// happens in one place rather than in every screen that wants a coordinate.
abstract class LocationService {
  /// A single position. Throws [LocationFailure] rather than returning null so
  /// the reason survives to the interface.
  Future<LocationFix> current();

  /// A position only if permission has already been granted; never prompts.
  /// Used at launch to centre the map without a permission dialog appearing
  /// before the person has asked for anything.
  Future<LocationFix?> lastKnown();

  /// Continuous updates for the driver's shift.
  Stream<LocationFix> watch({int distanceFilterM = 25});

  Future<bool> ensurePermission();

  Future<void> openSettings();
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  @override
  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationFailure(
        LocationDenial.serviceDisabled,
        'Location is switched off on this device. Turn it on to use your current position.',
      );
    }

    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.deniedForever) {
      throw const LocationFailure(
        LocationDenial.permissionDeniedForever,
        'Location access is blocked for this app. You can allow it in Settings.',
      );
    }

    if (permission == LocationPermission.denied) {
      throw const LocationFailure(
        LocationDenial.permissionDenied,
        'We need location access to find where you are. You can still search for an address instead.',
      );
    }

    return true;
  }

  @override
  Future<LocationFix> current() async {
    await ensurePermission();

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          // A hard ceiling matters more than precision here: a booking screen
          // that waits indefinitely for a fix is worse than one that gives up
          // and lets the person type an address.
          timeLimit: Duration(seconds: 12),
        ),
      );
      return _toFix(position);
    } on TimeoutException {
      throw const LocationFailure(
        LocationDenial.unavailable,
        'We could not get a GPS fix. Try again outdoors, or search for an address.',
      );
    }
  }

  @override
  Future<LocationFix?> lastKnown() async {
    if (!await Geolocator.isLocationServiceEnabled()) return null;

    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    final position = await Geolocator.getLastKnownPosition();
    return position == null ? null : _toFix(position);
  }

  @override
  Stream<LocationFix> watch({int distanceFilterM = 25}) {
    return Geolocator.getPositionStream(
      locationSettings: LocationSettings(
        accuracy: LocationAccuracy.high,
        // Distance-based rather than time-based: a stationary vehicle should
        // not generate a stream of identical positions.
        distanceFilter: distanceFilterM,
      ),
    ).map(_toFix);
  }

  @override
  Future<void> openSettings() async {
    await Geolocator.openAppSettings();
  }

  LocationFix _toFix(Position position) => LocationFix(
        point: GeoPoint(lat: position.latitude, lng: position.longitude),
        accuracyM: position.accuracy,
        headingDeg: position.heading >= 0 ? position.heading : null,
        speedKph: position.speed >= 0 ? position.speed * 3.6 : null,
        at: position.timestamp,
      );
}
