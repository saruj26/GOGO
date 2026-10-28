import '../networking/api.dart';

/// Delivery of notifications to the device.
///
/// The backend records notifications but does not yet deliver them anywhere:
/// there is no push transport and no socket. The application therefore reads
/// them, and this interface exists so that adding a real transport later is a
/// new implementation rather than a change to every screen.
abstract class PushTransport {
  /// Whether the device can actually receive pushed notifications. False today,
  /// which is why nothing in the interface promises a person will be alerted.
  bool get isSupported;

  /// Registers this device with the backend. A no-op while unsupported.
  Future<void> register();

  Future<void> unregister();
}

/// The current state of the world, stated plainly.
class UnavailablePushTransport implements PushTransport {
  const UnavailablePushTransport();

  @override
  bool get isSupported => false;

  @override
  Future<void> register() async {}

  @override
  Future<void> unregister() async {}
}

/// Reads recorded notifications from the API.
///
/// This is what actually shows a person their notifications today. It is a
/// deliberate substitute for delivery, not an implementation of it.
class NotificationReader {
  const NotificationReader(this.api);

  final Api api;

  Future<int> unreadCount() => api.notifications.unreadCount();
}
