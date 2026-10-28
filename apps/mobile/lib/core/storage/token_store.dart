import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionTokens {
  const SessionTokens({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
      };

  static SessionTokens? fromJson(Map<String, dynamic> json) {
    final access = json['accessToken'];
    final refresh = json['refreshToken'];
    if (access is! String || refresh is! String) return null;
    if (access.isEmpty || refresh.isEmpty) return null;
    return SessionTokens(accessToken: access, refreshToken: refresh);
  }
}

/// Where the session lives between launches.
///
/// An interface rather than a concrete class so tests can run without a
/// platform keystore, and so a future migration off `flutter_secure_storage`
/// touches one file.
abstract class TokenStore {
  Future<SessionTokens?> read();
  Future<void> write(SessionTokens tokens);
  Future<void> clear();
}

/// Backed by the Android keystore / iOS keychain.
///
/// Tokens are never written to shared preferences or to a log line: an access
/// token in logcat is a stolen session.
class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage, this.key = 'rideflow.session'})
      // v11 already defaults to AES-GCM with RSA-OAEP key wrapping on Android,
      // so the secure default needs no options. The iOS accessibility class is
      // set explicitly: the session may survive a reboot, but only once the
      // device has been unlocked at least one time.
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;
  final String key;

  SessionTokens? _cached;

  @override
  Future<SessionTokens?> read() async {
    if (_cached != null) return _cached;

    final raw = await _storage.read(key: key);
    if (raw == null || raw.isEmpty) return null;

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      return _cached = SessionTokens.fromJson(decoded);
    } on FormatException {
      // A corrupt entry is indistinguishable from no session; drop it rather
      // than trapping the user in a launch that always fails.
      await _storage.delete(key: key);
      return null;
    }
  }

  @override
  Future<void> write(SessionTokens tokens) async {
    _cached = tokens;
    await _storage.write(key: key, value: jsonEncode(tokens.toJson()));
  }

  @override
  Future<void> clear() async {
    _cached = null;
    await _storage.delete(key: key);
  }
}

/// For tests and for previewing a signed-in shell without a keystore.
class InMemoryTokenStore implements TokenStore {
  InMemoryTokenStore([this._tokens]);

  SessionTokens? _tokens;

  @override
  Future<SessionTokens?> read() async => _tokens;

  @override
  Future<void> write(SessionTokens tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;
}
