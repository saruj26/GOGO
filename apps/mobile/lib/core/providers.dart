import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/app_config.dart';
import 'networking/api.dart';
import 'networking/api_client.dart';
import 'realtime/realtime_client.dart';
import 'storage/token_store.dart';

/// Build-time configuration. Overridden in tests and at launch.
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

/// Where the session is persisted. Overridden in tests with an in-memory store
/// so no test ever needs a platform keystore.
final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(
    config: ref.watch(appConfigProvider),
    tokenStore: ref.watch(tokenStoreProvider),
    // A refresh token the backend rejected means the session is genuinely over.
    // Signalling it once here is what moves the router to sign-in, instead of
    // every screen discovering it separately.
    onSessionExpired: () => ref.read(sessionExpiredProvider.notifier).bump(),
  );

  ref.onDispose(client.raw.close);
  return client;
});

final apiProvider = Provider<Api>((ref) => Api(ref.watch(apiClientProvider)));

/// The live connection to the backend.
///
/// Created once and shared. Screens do not connect it — the auth controller
/// does, when there is a session to connect with, and drops it on sign-out so a
/// signed-out device is not holding an authenticated socket open.
final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(
    baseUrl: ref.watch(appConfigProvider).apiBaseUrl,
    tokens: ref.watch(tokenStoreProvider),
  );

  ref.onDispose(client.dispose);
  return client;
});

/// Bumped whenever the backend rejects the refresh token. The auth controller
/// listens to it; a counter rather than a flag so a second expiry later in the
/// session still fires.
class SessionExpiredSignal extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state = state + 1;
}

final sessionExpiredProvider =
    NotifierProvider<SessionExpiredSignal, int>(SessionExpiredSignal.new);
