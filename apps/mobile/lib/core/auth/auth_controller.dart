import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/auth.dart';
import '../errors/api_exception.dart';
import '../networking/api.dart';
import '../providers.dart';
import '../storage/token_store.dart';
import 'auth_state.dart';

/// Owns the session for the whole application.
///
/// It is the only thing that writes tokens or decides that a person is signed
/// in. Screens read the result; the backend remains the authority on what that
/// person may actually do.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    // A rejected refresh token means the session is over wherever it was
    // noticed, so the controller reacts to it here rather than each screen
    // handling its own 401.
    ref.listen<int>(sessionExpiredProvider, (previous, next) {
      if (previous != null && next > previous) _forceSignOut();
    });

    Future.microtask(restore);
    return const AuthState.unknown();
  }

  Api get _api => ref.read(apiProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);

  /// Loads any stored session at launch.
  ///
  /// A stored token is not treated as proof of a session: it is spent on
  /// `/auth/me`, and only a real answer signs the person in. That is what stops
  /// the app opening a signed-in shell around a revoked account.
  Future<void> restore() async {
    final stored = await _tokens.read();
    if (stored == null) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    try {
      final user = await _api.auth.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
      unawaited(ref.read(realtimeClientProvider).connect());
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.unauthorized) {
        await _tokens.clear();
        state = const AuthState(status: AuthStatus.unauthenticated);
        return;
      }

      // The session may well be fine and the network is not. Staying signed in
      // and letting individual screens show their own retry is better than
      // signing someone out because a train went into a tunnel.
      state = AuthState(status: AuthStatus.authenticated, error: error.message);
    }
  }

  Future<bool> signIn({required String phone, required String password}) async {
    state = state.copyWith(busy: true, clearError: true);

    try {
      final tokens = await _api.auth.login(phone: phone, password: password);
      await _tokens.write(
        SessionTokens(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken),
      );

      final user = await _api.auth.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
      unawaited(ref.read(realtimeClientProvider).connect());
      return true;
    } on ApiException catch (error) {
      await _tokens.clear();
      state = AuthState(status: AuthStatus.unauthenticated, error: error.message);
      return false;
    }
  }

  Future<bool> register({
    required String phone,
    required String password,
    required String firstName,
    String? lastName,
    String? email,
    String? gender,
  }) async {
    state = state.copyWith(busy: true, clearError: true);

    try {
      final tokens = await _api.auth.register(
        phone: phone,
        password: password,
        firstName: firstName,
        lastName: lastName,
        email: email,
        gender: gender,
      );
      await _tokens.write(
        SessionTokens(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken),
      );

      final user = await _api.auth.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
      return true;
    } on ApiException catch (error) {
      await _tokens.clear();
      state = AuthState(status: AuthStatus.unauthenticated, error: error.message);
      return false;
    }
  }

  /// Signs out locally whatever the network does.
  ///
  /// Revoking the refresh token server-side is the right thing to attempt, but
  /// a person tapping "sign out" on a bad connection must still end up signed
  /// out on this device.
  Future<void> signOut() async {
    state = state.copyWith(busy: true);

    final stored = await _tokens.read();
    try {
      await _api.auth.logout(stored?.refreshToken);
    } on ApiException {
      // Deliberately ignored; the local session is cleared either way.
    }

    await _tokens.clear();
    // A signed-out device must not keep an authenticated socket open.
    ref.read(realtimeClientProvider).disconnect();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Re-reads the profile, e.g. after safety preferences change.
  Future<void> refreshUser() async {
    if (!state.isAuthenticated) return;

    try {
      final user = await _api.auth.me();
      state = state.copyWith(user: user, clearError: true);
    } on ApiException {
      // A refresh failing does not invalidate what is already on screen.
    }
  }

  void applySafetyPreferences(SafetyPreferences preferences) {
    final user = state.user;
    if (user == null) return;

    state = state.copyWith(
      user: Me(
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        gender: user.gender,
        avatarUrl: user.avatarUrl,
        roles: user.roles,
        driverId: user.driverId,
        sharedRidePrefs: preferences,
        wallet: user.wallet,
      ),
    );
  }

  Future<void> _forceSignOut() async {
    await _tokens.clear();
    ref.read(realtimeClientProvider).disconnect();
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      error: 'Your session has ended. Please sign in again.',
    );
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

/// The signed-in person, or null. Convenience for the many screens that only
/// need the user and not the whole auth state.
final currentUserProvider = Provider<Me?>((ref) => ref.watch(authControllerProvider).user);
