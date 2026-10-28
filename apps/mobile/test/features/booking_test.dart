import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tugo_mobile/features/rides/booking_controller.dart';
import 'package:tugo_mobile/models/auth.dart';
import 'package:tugo_mobile/models/common.dart';

import '../support/fake_http.dart';
import '../support/fixtures.dart';
import 'package:tugo_mobile/core/providers.dart';

import '../support/harness.dart';

const pickup = Place(address: 'Jaffna Bus Stand', lat: 9.6615, lng: 80.0255);
const dropoff = Place(address: 'Point Pedro', lat: 9.8167, lng: 80.2333);

void main() {
  group('fares', () {
    test('prices the journey once both ends are chosen', () async {
      final http = FakeHttp()..on('POST /rides/estimate', Reply.ok(estimatesJson()));
      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      await pumpEventQueue();

      // One end is not a journey; nothing should have been priced yet.
      expect(http.hits('POST /rides/estimate'), 0);

      booking.setDropoff(dropoff);
      await pumpEventQueue();

      final estimates = container.read(bookingControllerProvider).estimates.value!;
      expect(estimates, hasLength(2));
      expect(estimates.first.name, 'Car');
    });

    test('shows the fare exactly as the backend produced it', () async {
      final http = FakeHttp()..on('POST /rides/estimate', Reply.ok(estimatesJson()));
      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      final car = container.read(bookingControllerProvider).estimates.value!.first;

      // Strings, unrounded, untouched: the saving is the server's number and is
      // never derived by subtracting one fare from another here.
      expect(car.soloFare, '1240.00');
      expect(car.sharedFareFrom, '868.00');
      expect(car.sharedSaving, '372.00');
    });

    test('selects the first vehicle by default and honours a change', () async {
      final http = FakeHttp()..on('POST /rides/estimate', Reply.ok(estimatesJson()));
      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      expect(container.read(bookingControllerProvider).selectedVehicle?.code, 'CAR');

      booking.selectVehicle('vt-tuk');
      expect(container.read(bookingControllerProvider).selectedVehicle?.code, 'TUKTUK');
    });

    test('surfaces a pricing failure with the backend message', () async {
      final http = FakeHttp()
        ..on(
          'POST /rides/estimate',
          Reply.error(422, 'ROUTE_NOT_FOUND', 'We could not find a route between those points.'),
        );

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      expect(container.read(bookingControllerProvider).estimates, isA<AsyncError<dynamic>>());
    });

    test('re-prices when the journey is swapped', () async {
      final http = FakeHttp()..on('POST /rides/estimate', Reply.ok(estimatesJson()));
      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      final before = http.hits('POST /rides/estimate');
      booking.swap();
      await pumpEventQueue();

      expect(http.hits('POST /rides/estimate'), greaterThan(before));
      expect(container.read(bookingControllerProvider).pickup, dropoff);
    });
  });

  group('shared rides', () {
    test('asks the backend for offers and shows what came back', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides/shared/search', Reply.ok(sharedSearchJson(offers: 2)));

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      booking.setMode(RideMode.shared);
      await pumpEventQueue();

      final result = container.read(bookingControllerProvider).sharedResult!.value!;
      expect(result.offers, hasLength(2));
      expect(result.requestId, 'req-1');

      final offer = result.offers.first;
      expect(offer.fare.total, '868.00');
      expect(offer.saving, '372.00');
      expect(offer.pickupWalkMeters, 120);
      expect(offer.coPassengerCount, 1);
      expect(offer.driver?.firstName, 'Kamal');
    });

    test('sends the safety preference to the backend rather than filtering here', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides/shared/search', Reply.ok(sharedSearchJson()));

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      booking.setMode(RideMode.shared);
      await pumpEventQueue();

      booking.setGenderPreference(GenderPreference.womenOnly);
      await pumpEventQueue();

      final sent = http.forRoute('POST /rides/shared/search').last.body as Map;
      expect(sent['genderPreference'], 'WOMEN_ONLY');
    });

    test('shows the backend explanation when nothing matched', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on(
          'POST /rides/shared/search',
          Reply.ok(sharedSearchJson(offers: 0, noMatchReason: 'No rides are heading that way.')),
        );

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      booking.setMode(RideMode.shared);
      await pumpEventQueue();

      final result = container.read(bookingControllerProvider).sharedResult!.value!;
      expect(result.isEmpty, isTrue);
      // Shown verbatim: the app must never guess why a journey was incompatible.
      expect(result.noMatchReason, 'No rides are heading that way.');
    });

    test('joins an offer using the request id from that same search', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides/shared/search', Reply.ok(sharedSearchJson()))
        ..on(
          'POST /rides/shared/join',
          Reply.ok({
            'ridePassengerId': 'pax-9',
            'rideId': 'ride-0',
            'seats': 1,
            'fare': '868.00',
            'currency': 'LKR',
            'estimatedPickupAt': '2026-09-10T09:15:00.000Z',
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();
      booking.setMode(RideMode.shared);
      await pumpEventQueue();

      final offer = container.read(bookingControllerProvider).sharedResult!.value!.offers.first;
      final rideId = await booking.joinShared(offer);

      expect(rideId, 'ride-0');

      final sent = http.forRoute('POST /rides/shared/join').single.body as Map;
      expect(sent['requestId'], 'req-1');
      expect(sent['rideId'], 'ride-0');
    });

    test('reports a lost seat and re-searches instead of leaving a dead offer', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides/shared/search', Reply.ok(sharedSearchJson()))
        ..on(
          'POST /rides/shared/join',
          Reply.error(409, 'SEATS_UNAVAILABLE', 'The last seat on that ride has just been taken.'),
        );

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();
      booking.setMode(RideMode.shared);
      await pumpEventQueue();

      final searchesBefore = http.hits('POST /rides/shared/search');
      final offer = container.read(bookingControllerProvider).sharedResult!.value!.offers.first;

      final rideId = await booking.joinShared(offer);
      await pumpEventQueue();

      expect(rideId, isNull);
      expect(
        container.read(bookingControllerProvider).error,
        'The last seat on that ride has just been taken.',
      );
      expect(http.hits('POST /rides/shared/search'), greaterThan(searchesBefore));
    });

    test('starts a new shared ride carrying the safety preference', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides/shared/search', Reply.ok(sharedSearchJson(offers: 0)))
        ..on('POST /rides', Reply.ok(createdRideJson()));

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();
      booking.setMode(RideMode.shared);
      booking.setGenderPreference(GenderPreference.sameGenderOnly);
      await pumpEventQueue();

      final rideId = await booking.bookSharedNew();
      expect(rideId, 'ride-new');

      final sent = http.forRoute('POST /rides').single.body as Map;
      expect(sent['rideType'], 'SHARED');
      expect(sent['genderPreference'], 'SAME_GENDER_ONLY');
    });
  });

  group('booking', () {
    test('books a solo ride with the chosen vehicle', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides', Reply.ok(createdRideJson()));

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      booking.selectVehicle('vt-tuk');
      booking.setNote('Blue gate');
      booking.setPromotionCode('SAVE10');

      final rideId = await booking.bookSolo();
      expect(rideId, 'ride-new');

      final sent = http.forRoute('POST /rides').single.body as Map;
      expect(sent['rideType'], 'SOLO');
      expect(sent['vehicleTypeId'], 'vt-tuk');
      expect(sent['note'], 'Blue gate');
      expect(sent['promotionCode'], 'SAVE10');
      // Rides carry no payment method: the backend does not accept one.
      expect(sent.containsKey('paymentMethod'), isFalse);
    });

    test('refuses to book without a complete journey', () async {
      final http = FakeHttp();
      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      await pumpEventQueue();

      expect(await booking.bookSolo(), isNull);
      expect(http.hits('POST /rides'), 0);
    });

    test('surfaces a booking refusal without inventing a ride', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on(
          'POST /rides',
          Reply.error(409, 'NO_DRIVERS', 'No drivers are available in that area right now.'),
        );

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      expect(await booking.bookSolo(), isNull);
      expect(
        container.read(bookingControllerProvider).error,
        'No drivers are available in that area right now.',
      );
      expect(container.read(bookingControllerProvider).booking, isFalse);
    });

    test('a scheduled booking sends the requested time', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides', Reply.ok(createdRideJson()));

      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      await pumpEventQueue();

      final when = DateTime.now().add(const Duration(hours: 3));
      booking.setSchedule(when);
      await pumpEventQueue();

      await booking.bookSolo();

      final sent = http.forRoute('POST /rides').single.body as Map;
      expect(sent['scheduledPickupAt'], when.toUtc().toIso8601String());
    });

    test('reset clears the journey but keeps the safety preference', () async {
      final http = FakeHttp()..on('POST /rides/estimate', Reply.ok(estimatesJson()));
      final container = buildContainer(http, session: sessionTokens);
      final booking = container.read(bookingControllerProvider.notifier);

      booking.setPickup(pickup);
      booking.setDropoff(dropoff);
      booking.setGenderPreference(GenderPreference.womenOnly);
      await pumpEventQueue();

      booking.reset();

      final state = container.read(bookingControllerProvider);
      expect(state.pickup, isNull);
      expect(state.dropoff, isNull);
      expect(state.genderPreference, GenderPreference.womenOnly);
    });
  });

  group('cancellation', () {
    test('cancels a ride through the API', () async {
      final http = FakeHttp()
        ..on('POST /rides/ride-1/cancel', Reply.ok({'rideId': 'ride-1', 'cancelled': 'now'}));

      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).rides.cancel('ride-1', reason: 'Changed my mind');

      final sent = http.forRoute('POST /rides/ride-1/cancel').single.body as Map;
      expect(sent['reason'], 'Changed my mind');
    });
  });
}
