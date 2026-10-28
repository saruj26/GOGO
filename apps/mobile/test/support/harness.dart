import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// `Override` is not in flutter_riverpod's show-list in 3.x; it lives here.
import 'package:riverpod/misc.dart' show Override;
import 'package:tugo_mobile/core/config/app_config.dart';
import 'package:tugo_mobile/core/networking/api_client.dart';
import 'package:tugo_mobile/core/providers.dart';
import 'package:tugo_mobile/core/storage/token_store.dart';

import 'fake_http.dart';

const testConfig = AppConfig(
  apiBaseUrl: 'https://api.test/api/v1',
  tileUrlTemplate: 'https://tiles.test/{z}/{x}/{y}.png',
  tileAttribution: '© Test',
  supportPhone: '+94 11 000 0000',
  supportEmail: 'support@test',
  connectTimeout: Duration(seconds: 5),
  receiveTimeout: Duration(seconds: 5),
);

/// Builds an [ApiClient] wired to a [FakeHttp], sharing the same token store as
/// the container so a test can inspect what the session ended up as.
({ApiClient client, TokenStore tokens}) buildClient(
  FakeHttp http, {
  SessionTokens? session,
  void Function()? onSessionExpired,
}) {
  final tokens = InMemoryTokenStore(session);

  final dio = Dio(BaseOptions(baseUrl: testConfig.apiBaseUrl, validateStatus: (_) => true))
    ..httpClientAdapter = http;

  return (
    client: ApiClient(
      config: testConfig,
      tokenStore: tokens,
      dio: dio,
      onSessionExpired: onSessionExpired,
    ),
    tokens: tokens,
  );
}

/// A container whose API talks to [http] and whose session is [session].
ProviderContainer buildContainer(
  FakeHttp http, {
  SessionTokens? session,
  List<Override> overrides = const [],
}) {
  final tokens = InMemoryTokenStore(session);

  final container = ProviderContainer(
    overrides: [
      appConfigProvider.overrideWithValue(testConfig),
      tokenStoreProvider.overrideWithValue(tokens),
      apiClientProvider.overrideWith((ref) {
        final dio = Dio(BaseOptions(baseUrl: testConfig.apiBaseUrl, validateStatus: (_) => true))
          ..httpClientAdapter = http;

        return ApiClient(
          config: testConfig,
          tokenStore: tokens,
          dio: dio,
          onSessionExpired: () => ref.read(sessionExpiredProvider.notifier).bump(),
        );
      }),
      ...overrides,
    ],
  );

  addTearDown(container.dispose);
  return container;
}

const sessionTokens = SessionTokens(accessToken: 'access-1', refreshToken: 'refresh-1');
