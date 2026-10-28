import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'location_service.dart';

final locationServiceProvider =
    Provider<LocationService>((ref) => const GeolocatorLocationService());

/// The device's position for screens that want it but can live without it.
///
/// Deliberately uses [LocationService.lastKnown], which never prompts: the
/// permission dialog belongs to an action the person took, not to opening a
/// screen.
final lastKnownLocationProvider = FutureProvider<LocationFix?>((ref) async {
  try {
    return await ref.watch(locationServiceProvider).lastKnown();
  } on LocationFailure {
    return null;
  }
});
