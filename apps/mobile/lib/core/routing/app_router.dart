import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/register_screen.dart';
import '../../features/auth/sign_in_screen.dart';
import '../../features/driver/current_ride/driver_ride_screen.dart';
import '../../features/driver/deliveries/driver_deliveries_screen.dart';
import '../../features/driver/earnings/driver_earnings_screen.dart';
import '../../features/driver/history/driver_history_screen.dart';
import '../../features/driver/home/driver_home_screen.dart';
import '../../features/driver/requests/ride_requests_screen.dart';
import '../../features/driver/shared/shared_requests_screen.dart';
import '../../features/food/cart_screen.dart';
import '../../features/food/checkout_screen.dart';
import '../../features/food/food_order_screen.dart';
import '../../features/food/restaurant_screen.dart';
import '../../features/food/restaurants_screen.dart';
import '../../features/history/activity_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/parcels/parcel_booking_screen.dart';
import '../../features/parcels/parcel_tracking_screen.dart';
import '../../features/payments/wallet_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/profile/edit_profile_screen.dart';
import '../../features/profile/safety_screen.dart';
import '../../features/profile/saved_places_screen.dart';
import '../../features/promotions/promotions_screen.dart';
import '../../features/rides/booking_screen.dart';
import '../../features/rides/booking_controller.dart';
import '../../features/support/support_screen.dart';
import '../../features/support/tickets_screen.dart';
import '../../features/tracking/ride_tracking_screen.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_state.dart';
import '../widgets/states.dart';
import 'shells.dart';

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _customerShellKey = GlobalKey<NavigatorState>(debugLabel: 'customer');
final _driverShellKey = GlobalKey<NavigatorState>(debugLabel: 'driver');

/// The application's routes and the guard in front of them.
///
/// The guard is navigation, not authorisation: it keeps a signed-out person out
/// of the app and a non-driver out of the driver shell so they never see a
/// screen that cannot load. Every endpoint behind those screens re-checks the
/// role itself, and that check is the one that matters.
final routerProvider = Provider<GoRouter>((ref) {
  final auth = ValueNotifier<AuthState>(ref.read(authControllerProvider));

  ref.listen<AuthState>(authControllerProvider, (_, next) => auth.value = next);
  ref.onDispose(auth.dispose);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/',
    refreshListenable: auth,
    redirect: (context, state) {
      final session = auth.value;
      final path = state.matchedLocation;

      // Until the stored session has been checked, decide nothing: sending a
      // returning user to sign-in for a frame and back is worse than waiting.
      if (!session.isResolved) return path == '/starting' ? null : '/starting';

      final onAuthScreen = path == '/sign-in' || path == '/register';

      if (!session.isAuthenticated) return onAuthScreen ? null : '/sign-in';

      if (onAuthScreen || path == '/starting') {
        return session.isDriver ? '/driver' : '/';
      }

      if (path.startsWith('/driver') && !session.isDriver) return '/';

      return null;
    },
    routes: [
      GoRoute(
        path: '/starting',
        builder: (context, state) => const Scaffold(
          body: LoadingState(message: 'Loading your account…'),
        ),
      ),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),

      // ---------------------------------------------------------- customer
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => CustomerShell(shell: shell),
        branches: [
          StatefulShellBranch(
            navigatorKey: _customerShellKey,
            routes: [
              GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/book',
                builder: (context, state) {
                  // `/book?mode=shared` opens straight into shared riding, so
                  // the home tile lands on the right thing.
                  final mode = state.uri.queryParameters['mode'];
                  if (mode == 'shared') {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      final container = ProviderScope.containerOf(context, listen: false);
                      container.read(bookingControllerProvider.notifier).setMode(RideMode.shared);
                    });
                  }
                  return const BookingScreen();
                },
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/food', builder: (context, state) => const RestaurantsScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/activity', builder: (context, state) => const ActivityScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
            ],
          ),
        ],
      ),

      // Full-screen routes, pushed above the customer shell.
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/ride/:rideId',
        builder: (context, state) =>
            RideTrackingScreen(rideId: state.pathParameters['rideId']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/food/restaurant/:restaurantId',
        builder: (context, state) =>
            RestaurantScreen(restaurantId: state.pathParameters['restaurantId']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/food/cart/:restaurantId',
        builder: (context, state) =>
            CartScreen(restaurantId: state.pathParameters['restaurantId']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/food/checkout/:restaurantId',
        builder: (context, state) =>
            CheckoutScreen(restaurantId: state.pathParameters['restaurantId']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/food/order/:orderId',
        builder: (context, state) => FoodOrderScreen(orderId: state.pathParameters['orderId']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/parcel',
        builder: (context, state) => const ParcelBookingScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/parcel/:parcelId',
        builder: (context, state) =>
            ParcelTrackingScreen(parcelId: state.pathParameters['parcelId']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/wallet',
        builder: (context, state) => const WalletScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/promotions',
        builder: (context, state) => const PromotionsScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/profile/places',
        builder: (context, state) => const SavedPlacesScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/profile/safety',
        builder: (context, state) => const SafetyScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/profile/edit',
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/support',
        builder: (context, state) => const SupportScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/support/tickets',
        builder: (context, state) => const TicketsScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/support/new',
        builder: (context, state) => const NewTicketScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/support/tickets/:ticketId',
        builder: (context, state) =>
            TicketDetailScreen(ticketId: state.pathParameters['ticketId']!),
      ),

      // ------------------------------------------------------------ driver
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => DriverShell(shell: shell),
        branches: [
          StatefulShellBranch(
            navigatorKey: _driverShellKey,
            routes: [
              GoRoute(path: '/driver', builder: (context, state) => const DriverHomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/driver/requests',
                builder: (context, state) => const RideRequestsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/driver/ride',
                builder: (context, state) => const DriverRideScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/driver/deliveries',
                builder: (context, state) => const DriverDeliveriesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/driver/earnings',
                builder: (context, state) => const DriverEarningsScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/driver/history',
        builder: (context, state) => const DriverHistoryScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/driver/shared',
        builder: (context, state) => const SharedRequestsScreen(),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(),
      body: EmptyState(
        title: 'Page not found',
        message: state.uri.toString(),
        icon: Icons.explore_off_rounded,
      ),
    ),
  );
});
