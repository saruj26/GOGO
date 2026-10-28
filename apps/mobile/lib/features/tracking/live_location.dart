import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../models/common.dart';

/// Where the vehicle is, if the backend is telling us.
class LiveVehicle {
  const LiveVehicle({
    required this.point,
    required this.at,
    this.headingDeg,
    this.speedKph,
  });

  final GeoPoint point;
  final DateTime at;
  final double? headingDeg;
  final double? speedKph;

  /// A position that has stopped arriving is stale, and a stale marker is worse
  /// than none: it shows a car sitting still that is actually moving. Screens
  /// drop the marker once this is true rather than leaving it frozen.
  bool get isStale => DateTime.now().difference(at) > const Duration(seconds: 45);
}

/// The driver's position on one ride, as pushed over the socket.
///
/// Emits nothing until the backend sends something. There is no interpolation
/// between fixes and no dead reckoning: every position shown is one the vehicle
/// actually reported.
final liveVehicleProvider =
    StreamProvider.autoDispose.family<LiveVehicle?, String>((ref, rideId) {
  final client = ref.watch(realtimeClientProvider);
  final controller = StreamController<LiveVehicle?>();

  // The server re-authorises this: asking for a ride that is not yours is
  // refused there, not filtered here.
  unawaited(client.connect().then((_) => client.subscribe('ride:$rideId')));

  final subscription = client.messages.listen((message) {
    if (message.event != 'driver.location') return;
    if (message.data['rideId'] != rideId) return;

    final lat = message.data['lat'];
    final lng = message.data['lng'];
    if (lat is! num || lng is! num) return;

    controller.add(
      LiveVehicle(
        point: GeoPoint(lat: lat.toDouble(), lng: lng.toDouble()),
        at: DateTime.tryParse('${message.data['recordedAt']}') ?? DateTime.now(),
        headingDeg: (message.data['headingDeg'] as num?)?.toDouble(),
        speedKph: (message.data['speedKph'] as num?)?.toDouble(),
      ),
    );
  });

  ref.onDispose(() {
    unawaited(subscription.cancel());
    unawaited(client.unsubscribe('ride:$rideId'));
    unawaited(controller.close());
  });

  return controller.stream;
});
