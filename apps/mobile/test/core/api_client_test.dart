import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rideflow_mobile/core/errors/api_exception.dart';
import 'package:rideflow_mobile/core/storage/token_store.dart';

import '../support/fake_http.dart';
import '../support/harness.dart';

void main() {
  group('ApiClient', () {
    test('attaches the access token to authenticated calls', () async {
      final http = FakeHttp()..on('GET /auth/me', Reply.ok({'id': 'u1'}));
      final harness = buildClient(http, session: sessionTokens);

      await harness.client.get<Map<String, dynamic>>('/auth/me');

      expect(http.forRoute('GET /auth/me').single.authorization, 'Bearer access-1');
    });

    test('omits the token from anonymous calls', () async {
      final http = FakeHttp()..on('POST /auth/login', Reply.ok({'accessToken': 'a'}));
      final harness = buildClient(http, session: sessionTokens);

      await harness.client.post<Map<String, dynamic>>(
        '/auth/login',
        body: {'phone': '1'},
        anonymous: true,
      );

      expect(http.forRoute('POST /auth/login').single.authorization, isNull);
    });

    test('drops null and empty query values rather than sending them', () async {
      final http = FakeHttp()..on('GET /rides', Reply.ok({'items': []}));
      final harness = buildClient(http, session: sessionTokens);

      await harness.client.get<Map<String, dynamic>>(
        '/rides',
        query: {'cursor': null, 'status': '', 'limit': 20},
      );

      expect(http.forRoute('GET /rides').single.query, {'limit': 20});
    });

    group('session recovery', () {
      test('refreshes once on 401 and retries the original call', () async {
        final http = FakeHttp()
          ..onSequence('GET /auth/me', [
            Reply.error(401, 'UNAUTHORIZED', 'Token expired'),
            Reply.ok({'id': 'u1'}),
          ])
          ..on(
            'POST /auth/refresh',
            Reply.ok({'accessToken': 'access-2', 'refreshToken': 'refresh-2'}),
          );

        final harness = buildClient(http, session: sessionTokens);
        final result = await harness.client.get<Map<String, dynamic>>('/auth/me');

        expect(result['id'], 'u1');
        expect(http.hits('POST /auth/refresh'), 1);

        // The retry must carry the NEW token, not the one that just failed.
        expect(http.forRoute('GET /auth/me').last.authorization, 'Bearer access-2');

        final stored = await harness.tokens.read();
        expect(stored?.accessToken, 'access-2');
        expect(stored?.refreshToken, 'refresh-2');
      });

      test('collapses concurrent 401s into a single refresh', () async {
        // The backend rotates refresh tokens, so two parallel redemptions would
        // have the second rejected and sign the user out mid-session.
        final http = FakeHttp()
          ..delay = const Duration(milliseconds: 20)
          ..onSequence('GET /account/summary', [
            Reply.error(401, 'UNAUTHORIZED', 'expired'),
            Reply.error(401, 'UNAUTHORIZED', 'expired'),
            Reply.ok({'rides': 1}),
            Reply.ok({'rides': 1}),
          ])
          ..on(
            'POST /auth/refresh',
            Reply.ok({'accessToken': 'access-2', 'refreshToken': 'refresh-2'}),
          );

        final harness = buildClient(http, session: sessionTokens);

        await Future.wait([
          harness.client.get<Map<String, dynamic>>('/account/summary'),
          harness.client.get<Map<String, dynamic>>('/account/summary'),
        ]);

        expect(http.hits('POST /auth/refresh'), 1);
      });

      test('clears the session and signals expiry when the refresh is rejected', () async {
        var expired = 0;

        final http = FakeHttp()
          ..on('GET /auth/me', Reply.error(401, 'UNAUTHORIZED', 'expired'))
          ..on('POST /auth/refresh', Reply.error(401, 'UNAUTHORIZED', 'revoked'));

        final harness = buildClient(
          http,
          session: sessionTokens,
          onSessionExpired: () => expired++,
        );

        await expectLater(
          harness.client.get<Map<String, dynamic>>('/auth/me'),
          throwsA(
            isA<ApiException>()
                .having((e) => e.kind, 'kind', ApiErrorKind.unauthorized)
                .having((e) => e.code, 'code', 'SESSION_EXPIRED'),
          ),
        );

        expect(expired, 1);
        expect(await harness.tokens.read(), isNull);
      });

      test('does not attempt a refresh when there is no session', () async {
        final http = FakeHttp()..on('GET /auth/me', Reply.error(401, 'UNAUTHORIZED', 'no token'));
        final harness = buildClient(http);

        await expectLater(
          harness.client.get<Map<String, dynamic>>('/auth/me'),
          throwsA(isA<ApiException>()),
        );

        expect(http.hits('POST /auth/refresh'), 0);
      });

      test('gives up rather than looping when the retry also returns 401', () async {
        final http = FakeHttp()
          ..on('GET /auth/me', Reply.error(401, 'UNAUTHORIZED', 'expired'))
          ..on(
            'POST /auth/refresh',
            Reply.ok({'accessToken': 'access-2', 'refreshToken': 'refresh-2'}),
          );

        final harness = buildClient(http, session: sessionTokens);

        await expectLater(
          harness.client.get<Map<String, dynamic>>('/auth/me'),
          throwsA(isA<ApiException>()),
        );

        // Exactly one refresh and one retry: no unbounded recursion.
        expect(http.hits('POST /auth/refresh'), 1);
        expect(http.hits('GET /auth/me'), 2);
      });
    });

    group('error mapping', () {
      test('surfaces the backend message and code verbatim', () async {
        final http = FakeHttp()
          ..on(
            'POST /rides/shared/join',
            Reply.error(409, 'SEATS_UNAVAILABLE', 'The last seat on that ride has just been taken.'),
          );

        final harness = buildClient(http, session: sessionTokens);

        await expectLater(
          harness.client.post<dynamic>('/rides/shared/join', body: {}),
          throwsA(
            isA<ApiException>()
                .having((e) => e.kind, 'kind', ApiErrorKind.conflict)
                .having((e) => e.code, 'code', 'SEATS_UNAVAILABLE')
                .having(
                  (e) => e.message,
                  'message',
                  'The last seat on that ride has just been taken.',
                ),
          ),
        );
      });

      test('maps a 500 to a retryable server failure', () async {
        final http = FakeHttp()..on('GET /rides', Reply.error(500, 'INTERNAL', 'boom'));
        final harness = buildClient(http, session: sessionTokens);

        try {
          await harness.client.get<dynamic>('/rides');
          fail('expected a failure');
        } on ApiException catch (error) {
          expect(error.kind, ApiErrorKind.server);
          expect(error.isRetryable, isTrue);
        }
      });

      test('maps a validation failure as not retryable and keeps field errors', () async {
        final http = FakeHttp()
          ..on(
            'POST /parcels',
            Reply(400, {
              'error': {
                'code': 'VALIDATION_FAILED',
                'message': 'Check the form.',
                'details': {'weightKg': 'Too heavy for this parcel type'},
              },
            }),
          );

        final harness = buildClient(http, session: sessionTokens);

        try {
          await harness.client.post<dynamic>('/parcels', body: {});
          fail('expected a failure');
        } on ApiException catch (error) {
          expect(error.kind, ApiErrorKind.validation);
          expect(error.isRetryable, isFalse);
          expect(error.fieldErrors['weightKg'], 'Too heavy for this parcel type');
        }
      });

      test('reports a timeout as retryable', () async {
        final http = FakeHttp()..failWith = DioExceptionType.receiveTimeout;
        final harness = buildClient(http, session: sessionTokens);

        try {
          await harness.client.get<dynamic>('/rides');
          fail('expected a failure');
        } on ApiException catch (error) {
          expect(error.kind, ApiErrorKind.timeout);
          expect(error.isRetryable, isTrue);
        }
      });

      test('reports a connection failure as being offline', () async {
        final http = FakeHttp()..failWith = DioExceptionType.connectionError;
        final harness = buildClient(http, session: sessionTokens);

        try {
          await harness.client.get<dynamic>('/rides');
          fail('expected a failure');
        } on ApiException catch (error) {
          expect(error.kind, ApiErrorKind.network);
          expect(error.message, contains('offline'));
        }
      });

      test('distinguishes a cancellation from a failure', () async {
        final http = FakeHttp()..failWith = DioExceptionType.cancel;
        final harness = buildClient(http, session: sessionTokens);

        try {
          await harness.client.get<dynamic>('/places/search');
          fail('expected a failure');
        } on ApiException catch (error) {
          expect(error.kind, ApiErrorKind.cancelled);
          expect(error.isRetryable, isFalse);
        }
      });

      test('falls back to a generic sentence when the body has no message', () async {
        final http = FakeHttp()..on('GET /rides', Reply(503, 'not json at all'));
        final harness = buildClient(http, session: sessionTokens);

        try {
          await harness.client.get<dynamic>('/rides');
          fail('expected a failure');
        } on ApiException catch (error) {
          expect(error.message, isNotEmpty);
          expect(error.kind, ApiErrorKind.server);
        }
      });
    });

    test('a 204 resolves rather than failing to parse', () async {
      final http = FakeHttp()..on('DELETE /places/saved/p1', Reply(204, null));
      final harness = buildClient(http, session: sessionTokens);

      await expectLater(harness.client.delete<void>('/places/saved/p1'), completes);
    });
  });

  group('SecureTokenStore contract', () {
    test('in-memory store round-trips and clears', () async {
      final store = InMemoryTokenStore();
      expect(await store.read(), isNull);

      await store.write(sessionTokens);
      expect((await store.read())?.accessToken, 'access-1');

      await store.clear();
      expect(await store.read(), isNull);
    });

    test('rejects a malformed stored payload instead of half-restoring it', () {
      expect(SessionTokens.fromJson({'accessToken': 'a'}), isNull);
      expect(SessionTokens.fromJson({'accessToken': '', 'refreshToken': 'b'}), isNull);
      expect(SessionTokens.fromJson({'accessToken': 'a', 'refreshToken': 'b'}), isNotNull);
    });
  });
}
