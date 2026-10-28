import '../../models/auth.dart';

enum AuthStatus {
  /// Before the stored session has been checked. The router waits rather than
  /// deciding, so a returning user never flashes the sign-in screen.
  unknown,
  authenticated,
  unauthenticated,
}

class AuthState {
  const AuthState({required this.status, this.user, this.busy = false, this.error});

  const AuthState.unknown() : this(status: AuthStatus.unknown);

  final AuthStatus status;
  final Me? user;

  /// A sign-in or sign-out is in flight.
  final bool busy;

  final String? error;

  bool get isAuthenticated => status == AuthStatus.authenticated && user != null;
  bool get isResolved => status != AuthStatus.unknown;

  /// Whether this account may use the driver side of the application. The
  /// backend enforces the role on every driver endpoint regardless; this only
  /// decides which shell to show.
  bool get isDriver => user?.isDriver ?? false;

  AuthState copyWith({
    AuthStatus? status,
    Me? user,
    bool? busy,
    String? error,
    bool clearError = false,
    bool clearUser = false,
  }) =>
      AuthState(
        status: status ?? this.status,
        user: clearUser ? null : (user ?? this.user),
        busy: busy ?? this.busy,
        error: clearError ? null : (error ?? this.error),
      );
}
