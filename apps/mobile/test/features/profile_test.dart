import 'package:flutter_test/flutter_test.dart';
import 'package:tugo_mobile/core/auth/auth_controller.dart';
import 'package:tugo_mobile/core/providers.dart';
import 'package:tugo_mobile/features/rides/location_search_screen.dart';
import 'package:tugo_mobile/models/auth.dart';

import '../support/fake_http.dart';
import '../support/fixtures.dart';
import '../support/harness.dart';

void main() {
  group('saved places', () {
    test('lists what the person has saved', () async {
      final http = FakeHttp()
        ..on(
          'GET /places/saved',
          Reply.ok([
            {
              'id': 'sp-1',
              'label': 'Home',
              'address': '12 Galle Road, Colombo 03',
              'lat': 6.9,
              'lng': 79.85,
            },
            {
              'id': 'sp-2',
              'label': 'Work',
              'address': 'World Trade Center',
              'lat': 6.93,
              'lng': 79.84,
            },
          ]),
        );

      final container = buildContainer(http, session: sessionTokens);
      final places = await container.read(savedPlacesProvider.future);

      expect(places, hasLength(2));
      expect(places.first.label, 'Home');
      expect(places.first.place.lat, closeTo(6.9, 0.001));
    });

    test('saves a new place with its coordinates', () async {
      final http = FakeHttp()
        ..on(
          'POST /places/saved',
          Reply.ok({
            'id': 'sp-3',
            'label': 'Gym',
            'address': 'Union Place',
            'lat': 6.92,
            'lng': 79.86,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).places.save(
            label: 'Gym',
            address: 'Union Place',
            lat: 6.92,
            lng: 79.86,
          );

      final sent = http.forRoute('POST /places/saved').single.body as Map;
      expect(sent['label'], 'Gym');
      expect(sent['lat'], 6.92);
    });

    test('removes a saved place', () async {
      final http = FakeHttp()..on('DELETE /places/saved/sp-1', Reply(204, null));
      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).places.removeSaved('sp-1');
      expect(http.hits('DELETE /places/saved/sp-1'), 1);
    });
  });

  group('address search', () {
    test('passes the query and a nearby bias, and returns the attribution', () async {
      final http = FakeHttp()
        ..on(
          'GET /places/search',
          Reply.ok({
            'results': [
              {'address': 'Jaffna Bus Stand', 'lat': 9.6615, 'lng': 80.0255},
            ],
            'attribution': '© OpenStreetMap contributors',
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final result = await container.read(apiProvider).places.search('jaffna');

      expect(result.results, hasLength(1));
      // The geocoder's attribution is a licence requirement, so it is carried
      // through rather than dropped.
      expect(result.attribution, '© OpenStreetMap contributors');
      expect(http.forRoute('GET /places/search').single.query['q'], 'jaffna');
    });
  });

  group('safety preferences', () {
    test('sends only the fields the person changed', () async {
      final http = FakeHttp()
        ..on(
          'PUT /auth/me/safety-preferences',
          Reply.ok({
            'allowSharedRides': true,
            'genderPreference': 'WOMEN_ONLY',
            'maxCoPassengers': 2,
            'maxDetourMinutes': 10,
            'allowFrontSeat': false,
            'shareContactWithCoPax': false,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);

      final saved = await container.read(apiProvider).auth.updateSafetyPreferences(
            genderPreference: GenderPreference.womenOnly,
            allowFrontSeat: false,
          );

      expect(saved.genderPreference, GenderPreference.womenOnly);
      expect(saved.allowFrontSeat, isFalse);

      final sent = http.forRoute('PUT /auth/me/safety-preferences').single.body as Map;
      expect(sent['genderPreference'], 'WOMEN_ONLY');
      expect(sent['allowFrontSeat'], isFalse);
      expect(sent.containsKey('maxCoPassengers'), isFalse);
    });

    test('the saved preference is reflected on the signed-in profile', () async {
      final http = FakeHttp()..on('GET /auth/me', Reply.ok(meJson()));
      final container = buildContainer(http, session: sessionTokens);

      container.read(authControllerProvider);
      await pumpEventQueue();

      expect(
        container.read(currentUserProvider)?.sharedRidePrefs?.genderPreference,
        GenderPreference.any,
      );

      container.read(authControllerProvider.notifier).applySafetyPreferences(
            const SafetyPreferences(
              allowSharedRides: true,
              genderPreference: GenderPreference.womenOnly,
            ),
          );

      expect(
        container.read(currentUserProvider)?.sharedRidePrefs?.genderPreference,
        GenderPreference.womenOnly,
      );
    });

    test('every preference option maps to a value the backend accepts', () {
      // Adding an option the API does not know would produce bookings the
      // matching engine rejects.
      expect(
        GenderPreference.values.map((p) => p.wire).toList(),
        ['ANY', 'SAME_GENDER_ONLY', 'WOMEN_ONLY', 'MEN_ONLY'],
      );

      for (final option in GenderPreference.values) {
        expect(GenderPreference.from(option.wire), option);
      }

      // An unrecognised value falls back rather than crashing.
      expect(GenderPreference.from('SOMETHING_NEW'), GenderPreference.any);
    });
  });

  group('account', () {
    test('reads the wallet, its frozen state and its transactions', () async {
      final http = FakeHttp()
        ..on(
          'GET /account/wallet',
          Reply.ok({
            'balance': '1500.00',
            'currency': 'LKR',
            'frozen': true,
            'transactions': {
              'items': [
                {
                  'id': 'wt-1',
                  'type': 'CREDIT',
                  'amount': '500.00',
                  'balanceAfter': '1500.00',
                  'description': 'Refund',
                  'reference': 'RF-1',
                  'at': '2026-09-01T10:00:00.000Z',
                },
              ],
              'nextCursor': null,
              'hasMore': false,
            },
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final wallet = await container.read(apiProvider).account.wallet();

      expect(wallet.balance, '1500.00');
      // A frozen wallet must be unusable at checkout, so the flag is carried.
      expect(wallet.frozen, isTrue);
      expect(wallet.transactions.items.first.isCredit, isTrue);
    });

    test('reads promotions with their restrictions', () async {
      final http = FakeHttp()
        ..on(
          'GET /account/promotions',
          Reply.ok([
            {
              'code': 'SAVE10',
              'name': '10% off rides',
              'description': null,
              'type': 'PERCENT',
              'value': '10.00',
              'maxDiscount': '300.00',
              'minOrderAmount': '500.00',
              'appliesTo': ['RIDE', 'SHARED_RIDE'],
              'expiresAt': '2026-12-31T00:00:00.000Z',
              'usesLeft': 3,
            },
          ]),
        );

      final container = buildContainer(http, session: sessionTokens);
      final promotions = await container.read(apiProvider).account.promotions();

      final promo = promotions.single;
      expect(promo.isPercent, isTrue);
      expect(promo.appliesToService('RIDE'), isTrue);
      expect(promo.appliesToService('FOOD_DELIVERY'), isFalse);
      expect(promo.usesLeft, 3);
    });

    test('a promotion with no service restriction applies to everything', () async {
      final http = FakeHttp()
        ..on(
          'GET /account/promotions',
          Reply.ok([
            {
              'code': 'ALL',
              'name': 'Anything',
              'type': 'FIXED',
              'value': '100.00',
              'minOrderAmount': '0.00',
              'appliesTo': null,
              'usesLeft': 1,
            },
          ]),
        );

      final container = buildContainer(http, session: sessionTokens);
      final promo = (await container.read(apiProvider).account.promotions()).single;

      expect(promo.appliesToService('PARCEL'), isTrue);
      expect(promo.appliesToService('FOOD_DELIVERY'), isTrue);
    });
  });

  group('notifications', () {
    test('reads the list and the unread count', () async {
      final http = FakeHttp()
        ..on(
          'GET /notifications',
          Reply.ok({
            'items': [
              {
                'id': 'n-1',
                'type': 'RIDE_ACCEPTED',
                'title': 'Driver assigned',
                'body': 'Kamal is on the way.',
                'data': null,
                'readAt': null,
                'createdAt': '2026-09-10T08:00:00.000Z',
              },
            ],
            'nextCursor': null,
            'hasMore': false,
          }),
        )
        ..on('GET /notifications/unread-count', Reply.ok({'count': 4}));

      final container = buildContainer(http, session: sessionTokens);

      final page = await container.read(apiProvider).notifications.list();
      expect(page.items.single.isUnread, isTrue);

      expect(await container.read(apiProvider).notifications.unreadCount(), 4);
    });
  });

  group('ratings', () {
    test('routes each kind to its own endpoint', () async {
      final http = FakeHttp()
        ..on('POST /ratings/rides/r-1', Reply.ok({'rated': true, 'score': 5}))
        ..on('POST /ratings/food-orders/o-1', Reply.ok({'rated': true, 'score': 4}))
        ..on('POST /ratings/parcels/p-1', Reply.ok({'rated': true, 'score': 3}));

      final container = buildContainer(http, session: sessionTokens);
      final ratings = container.read(apiProvider).ratings;

      await ratings.rate(kind: 'ride', id: 'r-1', score: 5, comment: 'Great');
      await ratings.rate(kind: 'food', id: 'o-1', score: 4);
      await ratings.rate(kind: 'parcel', id: 'p-1', score: 3);

      expect(http.hits('POST /ratings/rides/r-1'), 1);
      expect(http.hits('POST /ratings/food-orders/o-1'), 1);
      expect(http.hits('POST /ratings/parcels/p-1'), 1);

      final sent = http.forRoute('POST /ratings/rides/r-1').single.body as Map;
      expect(sent['score'], 5);
      expect(sent['comment'], 'Great');
    });

    test('a duplicate rating is refused by the backend, not hidden here', () async {
      final http = FakeHttp()
        ..on(
          'POST /ratings/rides/r-1',
          Reply.error(409, 'ALREADY_RATED', 'You have already rated this ride.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(apiProvider).ratings.rate(kind: 'ride', id: 'r-1', score: 5),
        throwsA(anything),
      );
    });

    test('collapses the three pending lists into one queue', () async {
      final http = FakeHttp()
        ..on(
          'GET /ratings/pending',
          Reply.ok({
            'rides': [
              {'id': 'r-1', 'reference': 'RF-1', 'completedAt': '2026-09-09T10:00:00.000Z'},
            ],
            'foodOrders': [
              {
                'id': 'o-1',
                'reference': 'FO-1',
                'restaurant': 'Green Cabin',
                'completedAt': '2026-09-09T11:00:00.000Z',
              },
            ],
            'parcels': const [],
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final pending = await container.read(apiProvider).ratings.pending();

      expect(pending.items, hasLength(2));
      expect(pending.items[0].kind, 'ride');
      expect(pending.items[1].kind, 'food');
      expect(pending.items[1].subtitle, 'Green Cabin');
    });
  });
}
