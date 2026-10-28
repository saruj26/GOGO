/// How a failed call is described to the rest of the application.
///
/// Screens switch on [kind] rather than on HTTP status codes, so the retry
/// affordance, the sign-in redirect and the "you are offline" banner are all
/// decided in one place.
enum ApiErrorKind {
  network,
  timeout,
  cancelled,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validation,
  server,
  unknown,
}

class ApiException implements Exception {
  ApiException({
    required this.kind,
    required this.message,
    this.status,
    this.code,
    this.fieldErrors = const {},
  });

  final ApiErrorKind kind;

  /// Safe to show to a person. The API writes these for humans; we never
  /// synthesise our own copy for a domain rule we do not own.
  final String message;

  final int? status;

  /// The backend's own error code, e.g. `SEATS_UNAVAILABLE`.
  final String? code;

  final Map<String, String> fieldErrors;

  /// Whether offering a retry button makes sense. A validation failure or a
  /// revoked session will fail identically on a second attempt.
  bool get isRetryable =>
      kind == ApiErrorKind.network ||
      kind == ApiErrorKind.timeout ||
      kind == ApiErrorKind.server;

  bool get isSessionExpired => kind == ApiErrorKind.unauthorized;

  @override
  String toString() => 'ApiException($kind, $code): $message';
}
