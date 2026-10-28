import 'api_client.dart';
import 'endpoints/account_api.dart';
import 'endpoints/auth_api.dart';
import 'endpoints/driver_api.dart';
import 'endpoints/food_api.dart';
import 'endpoints/parcels_api.dart';
import 'endpoints/places_api.dart';
import 'endpoints/rides_api.dart';
import 'endpoints/support_api.dart';

/// The whole backend surface the application is allowed to touch.
///
/// A screen takes this, never an `ApiClient` and never a raw path, so adding a
/// call means adding it here where the response type is declared once.
class Api {
  Api(this.client)
      : auth = AuthApi(client),
        places = PlacesApi(client),
        rides = RidesApi(client),
        food = FoodApi(client),
        parcels = ParcelsApi(client),
        account = AccountApi(client),
        notifications = NotificationsApi(client),
        ratings = RatingsApi(client),
        support = SupportApi(client),
        driver = DriverApi(client);

  final ApiClient client;

  final AuthApi auth;
  final PlacesApi places;
  final RidesApi rides;
  final FoodApi food;
  final ParcelsApi parcels;
  final AccountApi account;
  final NotificationsApi notifications;
  final RatingsApi ratings;
  final SupportApi support;
  final DriverApi driver;
}
