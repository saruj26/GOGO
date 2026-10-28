import 'dart:async';

/// How the application learns that something changed.
///
/// The backend has no realtime transport yet: there is no socket, and no
/// endpoint pushes a driver's position to a passenger. Rather than pretend
/// otherwise, this interface names the capability and the only implementation
/// polls. When a socket does exist it becomes a second implementation and no
/// screen changes.
abstract class LiveUpdates {
  /// Emits each time [fetch] produces a value, until the subscription is
  /// cancelled.
  Stream<T> watch<T>(
    Future<T> Function() fetch, {
    Duration interval,
    bool Function(T value)? stopWhen,
  });
}

/// Repeated fetches on a timer.
///
/// Two properties matter. A slow response never overlaps the next tick, because
/// the next delay starts after the previous fetch finished. And a transient
/// failure does not end the stream: a tunnel should not permanently stop a
/// tracking screen from updating.
class PollingLiveUpdates implements LiveUpdates {
  const PollingLiveUpdates();

  @override
  Stream<T> watch<T>(
    Future<T> Function() fetch, {
    Duration interval = const Duration(seconds: 10),
    bool Function(T value)? stopWhen,
  }) {
    late StreamController<T> controller;
    Timer? timer;
    var running = false;
    var closed = false;

    Future<void> tick() async {
      if (running || closed) return;
      running = true;

      try {
        final value = await fetch();
        if (closed) return;

        controller.add(value);

        // A completed ride or a delivered parcel has nothing further to say;
        // continuing to poll it would be pure waste.
        if (stopWhen != null && stopWhen(value)) {
          await controller.close();
          return;
        }
      } catch (error, stack) {
        if (!closed) controller.addError(error, stack);
      } finally {
        running = false;
        if (!closed) timer = Timer(interval, tick);
      }
    }

    controller = StreamController<T>(
      onListen: tick,
      onCancel: () {
        closed = true;
        timer?.cancel();
      },
    );

    return controller.stream;
  }
}
