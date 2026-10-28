import 'package:flutter_test/flutter_test.dart';
import 'package:tugo_mobile/core/errors/api_exception.dart';
import 'package:tugo_mobile/core/providers.dart';
import 'package:tugo_mobile/features/rides/booking_controller.dart';
import 'package:tugo_mobile/models/common.dart';

import '../support/fake_http.dart';
import '../support/fixtures.dart';
import '../support/harness.dart';

const pickup = Place(address: 'Kopay', lat: 9.72, lng: 80.05);
const dropoff = Place(address: 'Nelliyady', lat: 9.79, lng: 80.19);

Map<String, dynamic> sharedRequestJson({String id = 'pax-9'}) => {
      'ridePassengerId': id,
      'rideId': 'ride-1',
      'rideReference': 'RF-3001',
      'requestedAt': '2026-09-10T08:00:00.000Z',
      'passenger': {'firstName': 'Sunil'},
      'seats': 1,
      'pickup': {'address': 'Kopay junction', 'lat': 9.72, 'lng': 80.05},
      'dropoff': {'address': 'Nelliyady town', 'lat': 9.79, 'lng': 80.19},
      'estimatedPickupAt': '2026-09-10T08:20:00.000Z',
      'note': null,
      'additionalDistanceM': 2400,
      'additionalDurationS': 300,
      'additionalEarning': '285.00',
      'currency': 'LKR',
      'matchScore': '87.00',
    };

void main() {
  group('asking to join a shared ride', () {
    test('comes back waiting for the driver, not confirmed', () async {
      final http = FakeHttp()
        ..on('POST /rides/estimate', Reply.ok(estimatesJson()))
        ..on('POST /rides/shared/search', Reply.ok(sharedSearchJson()))
        ..on(
          'POST /rides/shared/join',
          Reply.ok({
            'ridePassengerId': 'pax-9',
            'rideId': 'ride-0',
            'seats': 1,
            'status': 'OFFERED',
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

      // The ride id still comes back so the passenger can watch their request.
      expect(rideId, 'ride-0');

      final joined = await container.read(apiProvider).rides.joinShared(
            requestId: 'req-1',
            rideId: 'ride-0',
          );

      expect(joined.status, 'OFFERED');
      expect(joined.awaitingDriver, isTrue);
    });

    test('defaults to waiting when the backend omits a status', () async {
      // Safer to show "waiting" and be pleasantly wrong than to promise a seat.
      final http = FakeHttp()
        ..on(
          'POST /rides/shared/join',
          Reply.ok({
            'ridePassengerId': 'pax-9',
            'rideId': 'ride-0',
            'seats': 1,
            'currency': 'LKR',
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final joined = await container.read(apiProvider).rides.joinShared(
            requestId: 'req-1',
            rideId: 'ride-0',
          );

      expect(joined.awaitingDriver, isTrue);
    });
  });

  group('the driver’s decision', () {
    test('lists requests with what they cost and pay', () async {
      final http = FakeHttp()
        ..on('GET /rides/driver/shared-requests', Reply.ok([sharedRequestJson()]));

      final container = buildContainer(http, session: sessionTokens);
      final requests = await container.read(apiProvider).driver.pendingSharedPassengers();

      expect(requests, hasLength(1));

      final request = requests.first;
      expect(request.passengerFirstName, 'Sunil');
      // The engine's figures, not the app's.
      expect(request.additionalDistanceM, 2400);
      expect(request.additionalDurationS, 300);
      expect(request.additionalEarning, '285.00');
      expect(request.pickup.address, 'Kopay junction');
    });

    test('accepting posts to the ride and passenger it is for', () async {
      final http = FakeHttp()
        ..on('POST /rides/ride-1/shared-passengers/pax-9/accept', Reply.ok({'status': 'CONFIRMED'}));

      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).driver.acceptSharedPassenger(
            rideId: 'ride-1',
            ridePassengerId: 'pax-9',
          );

      expect(http.hits('POST /rides/ride-1/shared-passengers/pax-9/accept'), 1);
    });

    test('rejecting carries the reason', () async {
      final http = FakeHttp()
        ..on('POST /rides/ride-1/shared-passengers/pax-9/reject', Reply.ok({'status': 'REJECTED'}));

      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).driver.rejectSharedPassenger(
            rideId: 'ride-1',
            ridePassengerId: 'pax-9',
            reason: 'Boot is full',
          );

      final sent =
          http.forRoute('POST /rides/ride-1/shared-passengers/pax-9/reject').single.body as Map;
      expect(sent['reason'], 'Boot is full');
    });

    test('a seat lost between showing and deciding is reported, not hidden', () async {
      final http = FakeHttp()
        ..on(
          'POST /rides/ride-1/shared-passengers/pax-9/accept',
          Reply.error(409, 'CONFLICT', 'That request has just been handled.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      try {
        await container.read(apiProvider).driver.acceptSharedPassenger(
              rideId: 'ride-1',
              ridePassengerId: 'pax-9',
            );
        fail('expected a conflict');
      } on ApiException catch (error) {
        expect(error.kind, ApiErrorKind.conflict);
        expect(error.message, 'That request has just been handled.');
      }
    });

    test('a driver cannot decide on another driver’s ride', () async {
      // The backend owns this; the app must surface the refusal rather than
      // assuming its own list was right.
      final http = FakeHttp()
        ..on(
          'POST /rides/other-ride/shared-passengers/pax-9/accept',
          Reply.error(403, 'FORBIDDEN', 'That ride is not yours.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(apiProvider).driver.acceptSharedPassenger(
              rideId: 'other-ride',
              ridePassengerId: 'pax-9',
            ),
        throwsA(
          isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.forbidden),
        ),
      );
    });
  });
}
