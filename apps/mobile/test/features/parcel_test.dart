import 'package:flutter_test/flutter_test.dart';
import 'package:rideflow_mobile/core/errors/api_exception.dart';
import 'package:rideflow_mobile/core/networking/endpoints/parcels_api.dart';
import 'package:rideflow_mobile/core/providers.dart';
import 'package:rideflow_mobile/models/common.dart';

import '../support/fake_http.dart';
import '../support/harness.dart';

final sender = ParcelContact(
  place: const Place(address: 'Jaffna', lat: 9.66, lng: 80.02),
  contactName: 'Nimal',
  contactPhone: '+94771111111',
);

final receiver = ParcelContact(
  place: const Place(address: 'Point Pedro', lat: 9.81, lng: 80.23),
  contactName: 'Sunil',
  contactPhone: '+94772222222',
);

void main() {
  group('parcel booking', () {
    test('lists the parcel types the backend defines', () async {
      final http = FakeHttp()
        ..on(
          'GET /parcels/types',
          Reply.ok([
            {
              'id': 'pt-1',
              'code': 'SMALL',
              'name': 'Small packet',
              'description': 'Fits in a bag',
              'maxWeightKg': '5.00',
              'maxLengthCm': 40,
              'minVehicleTypeCode': 'BIKE',
              'requiresSignature': false,
            },
            {
              'id': 'pt-2',
              'code': 'DOCUMENT',
              'name': 'Documents',
              'description': null,
              'maxWeightKg': '1.00',
              'maxLengthCm': null,
              'minVehicleTypeCode': null,
              'requiresSignature': true,
            },
          ]),
        );

      final container = buildContainer(http, session: sessionTokens);
      final types = await container.read(apiProvider).parcels.types();

      expect(types, hasLength(2));
      expect(types[0].maxWeightKg, '5.00');
      expect(types[1].requiresSignature, isTrue);
    });

    test('quotes each vehicle class the backend says can carry it', () async {
      final http = FakeHttp()
        ..on(
          'POST /parcels/estimate',
          Reply.ok([
            {
              'vehicleTypeId': 'vt-bike',
              'vehicleTypeCode': 'BIKE',
              'vehicleTypeName': 'Motorbike',
              'distanceM': 21000,
              'durationS': 2400,
              'etaMinutes': 8,
              'currency': 'LKR',
              'total': '890.00',
              'breakdown': [
                {'code': 'BASE', 'label': 'Base', 'amount': '400.00'},
                {'code': 'DIST', 'label': 'Distance', 'amount': '490.00'},
              ],
            },
          ]),
        );

      final container = buildContainer(http, session: sessionTokens);

      final quotes = await container.read(apiProvider).parcels.estimate(
            pickup: sender,
            dropoff: receiver,
            parcelTypeId: 'pt-1',
            weightKg: 2.5,
          );

      expect(quotes, hasLength(1));
      expect(quotes.first.total, '890.00');
      expect(quotes.first.breakdown, hasLength(2));

      final sent = http.forRoute('POST /parcels/estimate').single.body as Map;
      expect((sent['pickup'] as Map)['contactPhone'], '+94771111111');
      expect(sent['weightKg'], 2.5);
    });

    test('surfaces backend validation against the offending field', () async {
      final http = FakeHttp()
        ..on(
          'POST /parcels/estimate',
          Reply(400, {
            'error': {
              'code': 'VALIDATION_FAILED',
              'message': 'That parcel is too heavy for the type you chose.',
              'details': {'weightKg': 'Maximum is 5 kg'},
            },
          }),
        );

      final container = buildContainer(http, session: sessionTokens);

      try {
        await container.read(apiProvider).parcels.estimate(
              pickup: sender,
              dropoff: receiver,
              parcelTypeId: 'pt-1',
              weightKg: 40,
            );
        fail('expected a refusal');
      } on ApiException catch (error) {
        expect(error.kind, ApiErrorKind.validation);
        expect(error.message, 'That parcel is too heavy for the type you chose.');
        expect(error.fieldErrors['weightKg'], 'Maximum is 5 kg');
      }
    });

    test('creates a parcel with the chosen vehicle and payment method', () async {
      final http = FakeHttp()
        ..on(
          'POST /parcels',
          Reply.ok({
            'parcelId': 'parcel-1',
            'reference': 'PC-5001',
            'status': 'PLACED',
            'charge': {
              'currency': 'LKR',
              'subtotal': '890.00',
              'discount': '0.00',
              'serviceFee': '0.00',
              'tax': '0.00',
              'total': '890.00',
              'breakdown': const [],
            },
            'route': {'distanceM': 21000, 'durationS': 2400, 'polyline': '_p~iF~ps|U'},
            'scheduledFor': null,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);

      final parcel = await container.read(apiProvider).parcels.create(
            pickup: sender,
            dropoff: receiver,
            parcelTypeId: 'pt-1',
            vehicleTypeId: 'vt-bike',
            paymentMethod: 'WALLET',
            weightKg: 2.5,
            notes: 'Fragile',
          );

      expect(parcel.parcelId, 'parcel-1');
      expect(parcel.charge.total, '890.00');

      final sent = http.forRoute('POST /parcels').single.body as Map;
      expect(sent['paymentMethod'], 'WALLET');
      expect(sent['vehicleTypeId'], 'vt-bike');
      expect(sent['notes'], 'Fragile');
    });
  });

  group('parcel tracking', () {
    test('reads the status, courier and route', () async {
      final http = FakeHttp()
        ..on(
          'GET /parcels/parcel-1',
          Reply.ok({
            'id': 'parcel-1',
            'reference': 'PC-5001',
            'status': 'IN_TRANSIT',
            'parcelType': {'code': 'SMALL', 'name': 'Small packet', 'requiresSignature': false},
            'vehicleType': {'code': 'BIKE', 'name': 'Motorbike'},
            'weightKg': '2.50',
            'declaredValue': null,
            'notes': 'Fragile',
            'pickup': {
              'address': 'Jaffna',
              'contactName': 'Nimal',
              'contactPhone': '+94771111111',
            },
            'dropoff': {
              'address': 'Point Pedro',
              'receiverName': 'Sunil',
              'receiverPhone': '+94772222222',
            },
            'charge': {'total': '890.00', 'currency': 'LKR'},
            'payment': {
              'method': 'CASH',
              'status': 'PENDING',
              'amount': '890.00',
              'currency': 'LKR',
            },
            'courier': {
              'firstName': 'Kamal',
              'avatarUrl': null,
              'rating': '4.85',
              'phone': '+94773333333',
            },
            'route': {'distanceM': 21000, 'durationS': 2400, 'polyline': '_p~iF~ps|U'},
            'timeline': const {},
            'cancellationReason': null,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final parcel = await container.read(apiProvider).parcels.get('parcel-1');

      expect(parcel.status, 'IN_TRANSIT');
      expect(parcel.isActive, isTrue);
      // Once collected, cancelling is no longer possible.
      expect(parcel.canCancel, isFalse);
      expect(parcel.courier?.firstName, 'Kamal');
      expect(parcel.receiverName, 'Sunil');
    });

    test('keeps entries without coordinates rather than inventing a position', () async {
      final http = FakeHttp()
        ..on(
          'GET /parcels/parcel-1/tracking',
          Reply.ok({
            'parcelId': 'parcel-1',
            'reference': 'PC-5001',
            'currentStatus': 'IN_TRANSIT',
            'items': [
              {
                'id': 't1',
                'status': 'PLACED',
                'note': 'Booked',
                'createdAt': '2026-09-10T08:00:00.000Z',
                'latitude': null,
                'longitude': null,
              },
              {
                'id': 't2',
                'status': 'PICKED_UP',
                'note': null,
                'createdAt': '2026-09-10T08:30:00.000Z',
                'latitude': '9.6615',
                'longitude': '80.0255',
              },
            ],
            'nextCursor': null,
            'hasMore': false,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final page = await container.read(apiProvider).parcels.tracking('parcel-1');

      expect(page.items, hasLength(2));
      expect(page.items[0].hasPosition, isFalse);
      expect(page.items[1].hasPosition, isTrue);
      expect(page.items[1].lat, closeTo(9.6615, 0.0001));
    });

    test('a parcel still awaiting a courier can be cancelled', () async {
      final http = FakeHttp()
        ..on(
          'GET /parcels/parcel-2',
          Reply.ok({
            'id': 'parcel-2',
            'reference': 'PC-5002',
            'status': 'SEARCHING_DRIVER',
            'parcelType': {'code': 'SMALL', 'name': 'Small', 'requiresSignature': false},
            'vehicleType': {'code': 'BIKE', 'name': 'Motorbike'},
            'pickup': {'address': 'A', 'contactName': 'N', 'contactPhone': '1'},
            'dropoff': {'address': 'B', 'receiverName': 'S', 'receiverPhone': '2'},
            'route': const {},
            'timeline': const {},
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final parcel = await container.read(apiProvider).parcels.get('parcel-2');

      expect(parcel.canCancel, isTrue);
    });
  });
}
