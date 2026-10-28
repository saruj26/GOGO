import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/realtime/live_updates.dart';
import '../../models/common.dart';
import '../../models/parcel.dart';

final parcelTypesProvider = FutureProvider<List<ParcelType>>(
  (ref) => ref.watch(apiProvider).parcels.types(),
);

final parcelsProvider = FutureProvider.autoDispose<CursorPage<ParcelHistoryItem>>(
  (ref) => ref.watch(apiProvider).parcels.list(limit: 20),
);

/// Polls one parcel while it is still moving.
final parcelStreamProvider =
    StreamProvider.autoDispose.family<ParcelDetail, String>((ref, parcelId) {
  final api = ref.watch(apiProvider);

  return const PollingLiveUpdates().watch<ParcelDetail>(
    () => api.parcels.get(parcelId),
    interval: const Duration(seconds: 15),
    stopWhen: (parcel) => !parcel.isActive,
  );
});

/// The parcel's recorded history.
///
/// Each entry is something the backend actually logged, sometimes with the
/// courier's position at that moment and sometimes without. Entries with no
/// coordinates are shown as text only — no position is interpolated between
/// two that have them.
final parcelTrackingProvider =
    FutureProvider.autoDispose.family<CursorPage<ParcelTrackingEntry>, String>((ref, parcelId) {
  return ref.watch(apiProvider).parcels.tracking(parcelId, limit: 50);
});
