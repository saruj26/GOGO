import 'package:flutter_test/flutter_test.dart';
import 'package:rideflow_mobile/core/auth/auth_controller.dart';
import 'package:rideflow_mobile/core/auth/auth_state.dart';
import 'package:rideflow_mobile/core/providers.dart';
import 'package:rideflow_mobile/core/storage/token_store.dart';

import '../support/fake_http.dart';
import '../support/fixtures.dart';
import '../support/harness.dart';

void main() {
  group('AuthController', () {
    test('starts unauthenticated when nothing is stored', () async {
      final http = FakeHttp();
      final container = buildContainer(http);

      container.read(authControllerProvider);
      await pumpEventQueue();

      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
      // No stored token means no call was worth making.
      expect(http.sent, isEmpty);
    });

    test('restores a session by spending the stored token on /auth/me', () async {
      // A stored token is not proof of a session; only a real answer is.
      final http = FakeHttp()..on('GET /auth/me', Reply.ok(meJson()));
      final container = buildContainer(http, session: sessionTokens);

      container.read(authControllerProvider);
      await pumpEventQueue();

      final state = container.read(authControllerProvider);
      expect(state.status, AuthStatus.authenticated);
      expect(state.user?.firstName, 'Nimal');
      expect(state.isDriver, isFalse);
    });

    test('signs out a stored token the backend has revoked', () async {
      final http = FakeHttp()
        ..on('GET /auth/me', Reply.error(401, 'UNAUTHORIZED', 'revoked'))
        ..on('POST /auth/refresh', Reply.error(401, 'UNAUTHORIZED', 'revoked'));

      final container = buildContainer(http, session: sessionTokens);

      container.read(authControllerProvider);
      await pumpEventQueue();

      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
      expect(await container.read(tokenStoreProvider).read(), isNull);
    });

    test('stays signed in when restoration fails for a network reason', () async {
      // A tunnel is not a revoked session; signing the person out would be wrong.
      final http = FakeHttp()..on('GET /auth/me', Reply.error(503, 'UNAVAILABLE', 'down'));
      final container = buildContainer(http, session: sessionTokens);

      container.read(authControllerProvider);
      await pumpEventQueue();

      expect(container.read(authControllerProvider).status, AuthStatus.authenticated);
      expect(await container.read(tokenStoreProvider).read(), isNotNull);
    });

    test('signs in, stores the tokens and loads the profile', () async {
      final http = FakeHttp()
        ..on('POST /auth/login', Reply.ok(tokensJson))
        ..on('GET /auth/me', Reply.ok(meJson()));

      final container = buildContainer(http);
      container.read(authControllerProvider);
      await pumpEventQueue();

      final ok = await container
          .read(authControllerProvider.notifier)
          .signIn(phone: '+94771234567', password: 'correct-horse');

      expect(ok, isTrue);
      expect(container.read(authControllerProvider).isAuthenticated, isTrue);
      expect((await container.read(tokenStoreProvider).read())?.accessToken, 'access-1');
    });

    test('reports the backend message on bad credentials and stores nothing', () async {
      final http = FakeHttp()
        ..on(
          'POST /auth/login',
          Reply.error(401, 'INVALID_CREDENTIALS', 'That phone number or password is incorrect.'),
        );

      final container = buildContainer(http);
      container.read(authControllerProvider);
      await pumpEventQueue();

      final ok = await container
          .read(authControllerProvider.notifier)
          .signIn(phone: '+94770000000', password: 'wrong');

      expect(ok, isFalse);

      final state = container.read(authControllerProvider);
      expect(state.status, AuthStatus.unauthenticated);
      expect(state.error, 'That phone number or password is incorrect.');
      expect(await container.read(tokenStoreProvider).read(), isNull);
    });

    test('registers and lands signed in', () async {
      final http = FakeHttp()
        ..on('POST /auth/register', Reply.ok(tokensJson))
        ..on('GET /auth/me', Reply.ok(meJson()));

      final container = buildContainer(http);
      container.read(authControllerProvider);
      await pumpEventQueue();

      final ok = await container.read(authControllerProvider.notifier).register(
            phone: '+94771111111',
            password: 'a-good-password',
            firstName: 'Amara',
          );

      expect(ok, isTrue);
      expect(container.read(authControllerProvider).isAuthenticated, isTrue);
    });

    test('signs out locally even when revoking the token fails', () async {
      final http = FakeHttp()
        ..on('GET /auth/me', Reply.ok(meJson()))
        ..on('POST /auth/logout', Reply.error(503, 'UNAVAILABLE', 'down'));

      final container = buildContainer(http, session: sessionTokens);
      container.read(authControllerProvider);
      await pumpEventQueue();

      await container.read(authControllerProvider.notifier).signOut();

      // Tapping sign out on a bad connection must still sign you out here.
      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
      expect(await container.read(tokenStoreProvider).read(), isNull);
    });

    test('a rejected refresh anywhere in the app ends the session once', () async {
      final http = FakeHttp()..on('GET /auth/me', Reply.ok(meJson()));
      final container = buildContainer(http, session: sessionTokens);

      container.read(authControllerProvider);
      await pumpEventQueue();
      expect(container.read(authControllerProvider).isAuthenticated, isTrue);

      container.read(sessionExpiredProvider.notifier).bump();
      await pumpEventQueue();

      final state = container.read(authControllerProvider);
      expect(state.status, AuthStatus.unauthenticated);
      expect(state.error, contains('session has ended'));
    });

    test('recognises a driver account for shell selection', () async {
      final http = FakeHttp()..on('GET /auth/me', Reply.ok(meJson(driver: true)));
      final container = buildContainer(http, session: sessionTokens);

      container.read(authControllerProvider);
      await pumpEventQueue();

      final state = container.read(authControllerProvider);
      expect(state.isDriver, isTrue);
      expect(state.user?.driverId, 'driver-1');
    });

    test('does not treat a DRIVER role without a driver id as a driver', () async {
      // The backend is the authority; a half-populated profile must not open
      // the driver shell.
      final profile = meJson(driver: true)..['driverId'] = null;
      final http = FakeHttp()..on('GET /auth/me', Reply.ok(profile));
      final container = buildContainer(http, session: sessionTokens);

      container.read(authControllerProvider);
      await pumpEventQueue();

      expect(container.read(authControllerProvider).isDriver, isFalse);
    });
  });

  group('token store', () {
    test('a session survives being written and read back', () async {
      final store = InMemoryTokenStore();
      await store.write(const SessionTokens(accessToken: 'a', refreshToken: 'r'));
      expect((await store.read())?.refreshToken, 'r');
    });
  });
}
