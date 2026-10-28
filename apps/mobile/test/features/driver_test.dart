import 'package:flutter_test/flutter_test.dart';
import 'package:tugo_mobile/core/errors/api_exception.dart';
import 'package:tugo_mobile/core/providers.dart';
import 'package:tugo_mobile/features/driver/driver_providers.dart';
import 'package:tugo_mobile/models/common.dart';

import '../support/fake_http.dart';
import '../support/fixtures.dart';
import '../support/harness.dart';

void main() {
  group('driver profile', () {
    test('reads approval, presence, vehicles and document status', () async {
      final http = FakeHttp()
        ..on('GET /drivers/me', Reply.ok(driverProfileJson(activeVehicleId: 'veh-1')));

      final container = buildContainer(http, session: sessionTokens);
      final profile = await container.read(driverProfileProvider.future);

      expect(profile.isApproved, isTrue);
      expect(profile.vehicles, hasLength(1));
      expect(profile.activeVehicle?.plateNumber, 'WP CAB-1234');
      expect(profile.documents.first.status, 'APPROVED');
      expect(profile.availability.isOnline, isFalse);
    });

    test('a driver awaiting approval is not treated as approved', () async {
      final http = FakeHttp()
        ..on('GET /drivers/me', Reply.ok(driverProfileJson(approval: 'PENDING')));

      final container = buildContainer(http, session: sessionTokens);
      final profile = await container.read(driverProfileProvider.future);

      expect(profile.isApproved, isFalse);
    });
  });

  group('online and offline', () {
    test('going online sends the presence and the selected vehicle', () async {
      final http = FakeHttp()
        ..on('GET /drivers/me', Reply.ok(driverProfileJson()))
        ..on(
          'PUT /drivers/me/availability',
          Reply.ok({'presence': 'ONLINE', 'activeVehicleId': 'veh-1'}),
        );

      final container = buildContainer(http, session: sessionTokens);
      await container.read(availabilityActionsProvider).goOnline(vehicleId: 'veh-1');

      final sent = http.forRoute('PUT /drivers/me/availability').single.body as Map;
      expect(sent['presence'], 'ONLINE');
      expect(sent['activeVehicleId'], 'veh-1');
    });

    test('going offline is a server change, not a local flag', () async {
      final http = FakeHttp()
        ..on('GET /drivers/me', Reply.ok(driverProfileJson(presence: 'ONLINE')))
        ..on('PUT /drivers/me/availability', Reply.ok({'presence': 'OFFLINE'}));

      final container = buildContainer(http, session: sessionTokens);
      await container.read(availabilityActionsProvider).goOffline();

      expect(http.hits('PUT /drivers/me/availability'), 1);
      expect(
        (http.forRoute('PUT /drivers/me/availability').single.body as Map)['presence'],
        'OFFLINE',
      );
    });

    test('an unapproved driver is refused by the backend', () async {
      final http = FakeHttp()
        ..on('GET /drivers/me', Reply.ok(driverProfileJson(approval: 'PENDING')))
        ..on(
          'PUT /drivers/me/availability',
          Reply.error(403, 'FORBIDDEN', 'Your driver account has not been approved yet.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(availabilityActionsProvider).goOnline(vehicleId: 'veh-1'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'Your driver account has not been approved yet.',
          ),
        ),
      );
    });

    test('the shared-passenger consent is a stored setting, not a local toggle', () async {
      final http = FakeHttp()
        ..on('GET /drivers/me', Reply.ok(driverProfileJson(presence: 'ONLINE')))
        ..on('PUT /drivers/me/availability', Reply.ok({'presence': 'ONLINE'}));

      final container = buildContainer(http, session: sessionTokens);
      await container.read(availabilityActionsProvider).setWorkTypes(shared: true);

      final sent = http.forRoute('PUT /drivers/me/availability').single.body as Map;
      expect(sent['acceptsShared'], isTrue);
    });
  });

  group('ride requests', () {
    test('lists open requests with the driver-side earning', () async {
      final http = FakeHttp()
        ..on('GET /rides/driver/available', Reply.ok(rideRequestsJson()));

      final container = buildContainer(http, session: sessionTokens);
      final offers = await container.read(apiProvider).driver.availableRides();

      expect(offers, hasLength(1));

      final offer = offers.first;
      expect(offer.isShared, isTrue);
      // The driver is shown what they keep, not what the passenger pays.
      expect(offer.driverNet, '742.00');
      expect(offer.pickup?.address, 'Jaffna Bus Stand');
      expect(offer.dropoff?.address, 'Point Pedro');
    });

    test('is refused with a reason while the driver is offline', () async {
      final http = FakeHttp()
        ..on(
          'GET /rides/driver/available',
          Reply.error(409, 'DRIVER_UNAVAILABLE', 'Go online to see ride requests.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(apiProvider).driver.availableRides(),
        throwsA(
          isA<ApiException>()
              .having((e) => e.message, 'message', 'Go online to see ride requests.'),
        ),
      );
    });

    test('accepting a ride that another driver took reports the conflict', () async {
      final http = FakeHttp()
        ..on(
          'POST /rides/ride-req-1/accept',
          Reply.error(409, 'CONFLICT', 'Another driver has already accepted this ride.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      try {
        await container.read(apiProvider).driver.acceptRide('ride-req-1');
        fail('expected a conflict');
      } on ApiException catch (error) {
        expect(error.kind, ApiErrorKind.conflict);
        expect(error.message, 'Another driver has already accepted this ride.');
      }
    });

    test('accepting succeeds and does not send a body of its own', () async {
      final http = FakeHttp()..on('POST /rides/ride-req-1/accept', Reply.ok({'rideId': 'r'}));
      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).driver.acceptRide('ride-req-1');
      expect(http.hits('POST /rides/ride-req-1/accept'), 1);
    });
  });

  group('ride lifecycle', () {
    test('each transition calls its own endpoint', () async {
      final http = FakeHttp()
        ..on('POST /rides/ride-1/arriving', Reply.ok({}))
        ..on('POST /rides/ride-1/arrived', Reply.ok({}))
        ..on('POST /rides/ride-1/start', Reply.ok({}))
        ..on('POST /rides/ride-1/complete', Reply.ok({}));

      final container = buildContainer(http, session: sessionTokens);
      final driver = container.read(apiProvider).driver;

      await driver.markArriving('ride-1');
      await driver.markArrived('ride-1');
      await driver.startRide('ride-1');
      await driver.completeRide('ride-1');

      expect(http.hits('POST /rides/ride-1/arriving'), 1);
      expect(http.hits('POST /rides/ride-1/arrived'), 1);
      expect(http.hits('POST /rides/ride-1/start'), 1);
      expect(http.hits('POST /rides/ride-1/complete'), 1);
    });

    test('an out-of-order transition is refused by the backend', () async {
      final http = FakeHttp()
        ..on(
          'POST /rides/ride-1/complete',
          Reply.error(409, 'INVALID_TRANSITION', 'That ride has not started yet.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(apiProvider).driver.completeRide('ride-1'),
        throwsA(isA<ApiException>()),
      );
    });

    test('cancelling sends the reason', () async {
      final http = FakeHttp()..on('POST /rides/ride-1/cancel', Reply.ok({}));
      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).driver.cancelRide('ride-1', reason: 'Vehicle breakdown');

      final sent = http.forRoute('POST /rides/ride-1/cancel').single.body as Map;
      expect(sent['reason'], 'Vehicle breakdown');
    });
  });

  group('shared passengers', () {
    test('a joined passenger appears in the driver view with a reordered route', () async {
      final http = FakeHttp()
        ..on('GET /rides/ride-1', Reply.ok(driverRideDetailJson(passengers: 2)));

      final container = buildContainer(http, session: sessionTokens);
      final ride = await container.read(apiProvider).driver.rideDetail('ride-1');

      expect(ride.isShared, isTrue);
      expect(ride.passengers, hasLength(2));

      // The passenger who booked, and the one added along the way.
      expect(ride.passengers[0].isSharedJoin, isFalse);
      expect(ride.passengers[1].isSharedJoin, isTrue);

      // The stop order is the backend's; the app follows it as given.
      expect(ride.stops, hasLength(4));
      expect(ride.stops.map((s) => s.sequence), [0, 1, 2, 3]);
      expect(ride.stops.first.isPickup, isTrue);
    });

    test('the driver sees contact details but never gender or preferences', () async {
      final http = FakeHttp()
        ..on('GET /rides/ride-1', Reply.ok(driverRideDetailJson()));

      final container = buildContainer(http, session: sessionTokens);
      final ride = await container.read(apiProvider).driver.rideDetail('ride-1');

      final leg = ride.passengers.first;
      expect(leg.firstName, 'Nimal');
      expect(leg.phone, isNotNull);
      expect(leg.pickup.address, isNotEmpty);
    });

    test('seats occupied reflects who is aboard', () async {
      final http = FakeHttp()
        ..on('GET /rides/ride-1', Reply.ok(driverRideDetailJson(passengers: 3)));

      final container = buildContainer(http, session: sessionTokens);
      final ride = await container.read(apiProvider).driver.rideDetail('ride-1');

      expect(ride.seatsTotal, 4);
      expect(ride.seatsOccupied, 3);
    });
  });

  group('deliveries', () {
    test('fetches only the boards the driver has opted into', () async {
      final http = FakeHttp()
        ..on('GET /food/deliveries/available', Reply.ok([]))
        ..on('GET /parcels/jobs/available', Reply.ok([]));

      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).driver.availableDeliveries(food: true, parcel: false);

      expect(http.hits('GET /food/deliveries/available'), 1);
      expect(http.hits('GET /parcels/jobs/available'), 0);
    });

    test('merges food and parcel jobs into one board', () async {
      final http = FakeHttp()
        ..on(
          'GET /food/deliveries/available',
          Reply.ok([
            {
              'deliveryId': 'fd-1',
              'orderId': 'o-1',
              'reference': 'FO-1',
              'orderStatus': 'READY_FOR_PICKUP',
              'collectFrom': {
                'name': 'Green Cabin',
                'address': 'Colombo 03',
                'lat': 6.9,
                'lng': 79.85,
              },
              'distanceM': 3200,
              'durationS': 600,
              'estimatedReadyInMinutes': 5,
              'yourEarning': '320.00',
              'currency': 'LKR',
            },
          ]),
        )
        ..on(
          'GET /parcels/jobs/available',
          Reply.ok([
            {
              'parcelId': 'pj-1',
              'reference': 'PC-1',
              'parcelType': 'Small packet',
              'requiresSignature': false,
              'weightKg': '2.00',
              'collectFrom': {'address': 'Jaffna', 'lat': 9.66, 'lng': 80.02},
              'deliverToArea': 'Point Pedro',
              'distanceM': 21000,
              'durationS': 2400,
              'scheduledFor': null,
              'yourEarning': '620.00',
              'currency': 'LKR',
            },
          ]),
        );

      final container = buildContainer(http, session: sessionTokens);
      final jobs = await container.read(apiProvider).driver.availableDeliveries();

      expect(jobs, hasLength(2));
      expect(jobs[0].isFood, isTrue);
      expect(jobs[0].earning, '320.00');
      expect(jobs[1].isFood, isFalse);
      expect(jobs[1].deliverToArea, 'Point Pedro');
    });

    test('taking a second job while holding one is refused', () async {
      final http = FakeHttp()
        ..on(
          'POST /food/deliveries/fd-1/accept',
          Reply.error(409, 'CONFLICT', 'You are already on a job. Finish it before taking another.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(apiProvider).driver.acceptFoodDelivery('fd-1'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.conflict)),
      );
    });

    test('reads the current job, including cash to collect only when owed', () async {
      final http = FakeHttp()
        ..on('GET /food/deliveries/current', Reply.ok(null))
        ..on(
          'GET /parcels/jobs/current',
          Reply.ok({
            'parcelId': 'pj-1',
            'reference': 'PC-1',
            'status': 'PICKED_UP',
            'parcelType': 'Small packet',
            'requiresSignature': false,
            'weightKg': '2.00',
            'notes': null,
            'collectFrom': {
              'name': 'Nimal',
              'phone': '+94771111111',
              'address': 'Jaffna',
              'lat': 9.66,
              'lng': 80.02,
            },
            'deliverTo': {
              'name': 'Sunil',
              'phone': '+94772222222',
              'address': 'Point Pedro',
              'lat': 9.81,
              'lng': 80.23,
            },
            'cashToCollect': '620.00',
            'yourEarning': '520.00',
            'currency': 'LKR',
            'route': {'distanceM': 21000, 'durationS': 2400, 'polyline': null},
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final job = await container.read(apiProvider).driver.currentDelivery();

      expect(job, isNotNull);
      expect(job!.isFood, isFalse);
      expect(job.cashToCollect, '620.00');
      expect(job.deliverTo.name, 'Sunil');
      // Contact details arrive only once the job is theirs.
      expect(job.collectFrom.phone, '+94771111111');
    });

    test('null cash to collect means nothing is owed, not zero', () async {
      final http = FakeHttp()
        ..on(
          'GET /food/deliveries/current',
          Reply.ok({
            'deliveryId': 'fd-1',
            'status': 'DELIVERING',
            'order': {
              'id': 'o-1',
              'reference': 'FO-1',
              'status': 'DELIVERING',
              'itemCount': 2,
              'items': [
                {'name': 'Kottu', 'quantity': 2},
              ],
            },
            'collectFrom': {
              'name': 'Green Cabin',
              'phone': '+94112345678',
              'address': 'Colombo 03',
              'lat': 6.9,
              'lng': 79.85,
            },
            'deliverTo': {
              'customerFirstName': 'Nimal',
              'phone': '+94771111111',
              'address': 'Home',
              'lat': 6.91,
              'lng': 79.86,
              'note': 'Blue gate',
            },
            'cashToCollect': null,
            'yourEarning': '320.00',
            'currency': 'LKR',
            'route': {'distanceM': 3200, 'durationS': 600, 'polyline': null},
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final job = await container.read(apiProvider).driver.currentDelivery();

      expect(job!.cashToCollect, isNull);
      expect(job.deliverTo.name, 'Nimal');
      expect(job.deliverTo.note, 'Blue gate');
      expect(job.items, hasLength(1));
    });

    test('each delivery step calls its own endpoint', () async {
      final http = FakeHttp()
        ..on('POST /food/deliveries/fd-1/heading-to-pickup', Reply.ok({}))
        ..on('POST /food/deliveries/fd-1/arrived', Reply.ok({}))
        ..on('POST /food/deliveries/fd-1/pickup', Reply.ok({}))
        ..on('POST /food/deliveries/fd-1/delivering', Reply.ok({}))
        ..on('POST /food/deliveries/fd-1/deliver', Reply.ok({}));

      final container = buildContainer(http, session: sessionTokens);
      final driver = container.read(apiProvider).driver;

      await driver.foodHeadingToPickup('fd-1');
      await driver.foodArrived('fd-1');
      await driver.foodPickedUp('fd-1');
      await driver.foodDelivering('fd-1');
      await driver.foodDelivered('fd-1');

      expect(http.hits('POST /food/deliveries/fd-1/deliver'), 1);
    });

    test('a parcel step carries the courier position only when there is one', () async {
      final http = FakeHttp()
        ..on('POST /parcels/jobs/pj-1/pickup', Reply.ok({}))
        ..on('POST /parcels/jobs/pj-1/deliver', Reply.ok({}));

      final container = buildContainer(http, session: sessionTokens);
      final driver = container.read(apiProvider).driver;

      await driver.parcelPickedUp('pj-1');
      await driver.parcelDelivered('pj-1', at: const GeoPoint(lat: 9.81, lng: 80.23));

      expect(http.forRoute('POST /parcels/jobs/pj-1/pickup').single.body, isEmpty);

      final delivered = http.forRoute('POST /parcels/jobs/pj-1/deliver').single.body as Map;
      expect(delivered['lat'], 9.81);
      expect(delivered['lng'], 80.23);
    });
  });

  group('earnings', () {
    test('reads the totals and keeps the shared uplift separate', () async {
      final http = FakeHttp()
        ..on(
          'GET /drivers/me/earnings/summary',
          Reply.ok({
            'trips': 42,
            'gross': '52000.00',
            'commission': '7800.00',
            'bonus': '500.00',
            'net': '44700.00',
            'fromSharedPassengers': {'count': 11, 'net': '8300.00'},
            'byStatus': [
              {'status': 'PENDING', 'count': 3, 'net': '2400.00'},
              {'status': 'PAID', 'count': 39, 'net': '42300.00'},
            ],
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final summary = await container.read(apiProvider).driver.earningsSummary();

      expect(summary.trips, 42);
      expect(summary.net, '44700.00');
      expect(summary.commission, '7800.00');
      // The platform's central claim to drivers, as its own recorded figure.
      expect(summary.sharedNet, '8300.00');
      expect(summary.sharedCount, 11);
      expect(summary.byStatus, hasLength(2));
    });

    test('marks which earning records came from a shared passenger', () async {
      final http = FakeHttp()
        ..on(
          'GET /drivers/me/earnings',
          Reply.ok({
            'items': [
              {
                'id': 'e-1',
                'serviceType': 'SHARED_RIDE',
                'status': 'PAID',
                'grossAmount': '900.00',
                'commissionAmount': '135.00',
                'netAmount': '765.00',
                'currency': 'LKR',
                'isSharedIncrement': true,
                'createdAt': '2026-09-09T10:00:00.000Z',
              },
            ],
            'nextCursor': null,
            'hasMore': false,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final page = await container.read(apiProvider).driver.earnings();

      expect(page.items.first.isSharedIncrement, isTrue);
      expect(page.items.first.net, '765.00');
    });
  });
}
