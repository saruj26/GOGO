import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Which app is running from this shared codebase.
///
/// Set once per process by the entrypoint (`main.dart` leaves it at the
/// default `customer`; `main_driver.dart` overrides it to `driver`), then
/// read by the router to decide which routes and shell exist at all.
enum AppFlavor { customer, driver }

final appFlavorProvider = Provider<AppFlavor>((ref) => AppFlavor.customer);
