import 'dart:async';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../errors/api_exception.dart';
import '../storage/token_store.dart';

/// The single seam between the application and the backend.
///
/// No screen builds a URL, attaches a token, or interprets an HTTP status. That
/// keeps three things in one place: how a session is attached, how an expired
/// session is recovered, and how a failure is described to a person.
class ApiClient {
  ApiClient({
    required AppConfig config,
    required TokenStore tokenStore,
    Dio? dio,
    this.onSessionExpired,
    // An initialising formal would put `_tokenStore:` in every call site,
    // leaking a private name across library boundaries.
    // ignore: prefer_initializing_formals
  })  : _tokenStore = tokenStore,
        _dio = dio ??
            Dio(BaseOptions(
              baseUrl: config.apiBaseUrl,
              connectTimeout: config.connectTimeout,
              receiveTimeout: config.receiveTimeout,
              sendTimeout: config.connectTimeout,
              // We interpret every status ourselves so an error body reaches
              // the mapper instead of being thrown away by Dio.
              validateStatus: (_) => true,
              headers: {'Accept': 'application/json'},
            )) {
    _dio.options.baseUrl = config.apiBaseUrl;
  }

  final Dio _dio;
  final TokenStore _tokenStore;

  /// Called when the refresh token itself is rejected, so the router can move
  /// to the sign-in screen exactly once rather than every screen doing it.
  final void Function()? onSessionExpired;

  Future<bool>? _refreshFuture;

  Dio get raw => _dio;

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool anonymous = false,
  }) =>
      _request<T>('GET', path, query: query, cancelToken: cancelToken, anonymous: anonymous);

  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool anonymous = false,
  }) =>
      _request<T>('POST', path,
          body: body, query: query, cancelToken: cancelToken, anonymous: anonymous);

  Future<T> put<T>(
    String path, {
    Object? body,
    CancelToken? cancelToken,
  }) =>
      _request<T>('PUT', path, body: body, cancelToken: cancelToken);

  Future<T> delete<T>(String path, {CancelToken? cancelToken}) =>
      _request<T>('DELETE', path, cancelToken: cancelToken);

  Future<T> _request<T>(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool anonymous = false,
    bool isRetry = false,
  }) async {
    final response = await _send(
      method,
      path,
      body: body,
      query: query,
      cancelToken: cancelToken,
      anonymous: anonymous,
    );

    // One recovery attempt only. A second 401 after a successful refresh means
    // the account genuinely cannot reach this resource, and retrying forever
    // would spin.
    if (response.statusCode == 401 && !anonymous && !isRetry) {
      final recovered = await _refreshSession();
      if (recovered) {
        return _request<T>(
          method,
          path,
          body: body,
          query: query,
          cancelToken: cancelToken,
          anonymous: anonymous,
          isRetry: true,
        );
      }

      await _tokenStore.clear();
      onSessionExpired?.call();
      throw ApiException(
        kind: ApiErrorKind.unauthorized,
        status: 401,
        code: 'SESSION_EXPIRED',
        message: 'Your session has ended. Please sign in again.',
      );
    }

    return _parse<T>(response);
  }

  Future<Response<dynamic>> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool anonymous = false,
  }) async {
    final headers = <String, dynamic>{};

    if (!anonymous) {
      final tokens = await _tokenStore.read();
      if (tokens != null) headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    }

    try {
      return await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: _clean(query),
        cancelToken: cancelToken,
        options: Options(method: method, headers: headers),
      );
    } on DioException catch (error) {
      throw _fromDio(error);
    }
  }

  /// Nulls and empty strings would become `?q=` and change what the API
  /// matches, so they are dropped rather than sent.
  Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;

    final cleaned = <String, dynamic>{};
    query.forEach((key, value) {
      if (value == null) return;
      if (value is String && value.isEmpty) return;
      cleaned[key] = value;
    });

    return cleaned.isEmpty ? null : cleaned;
  }

  T _parse<T>(Response<dynamic> response) {
    final status = response.statusCode ?? 0;

    if (status == 204 || response.data == null) {
      if (status >= 200 && status < 300) return null as T;
    }

    if (status >= 200 && status < 300) {
      return response.data as T;
    }

    throw _fromBody(status, response.data);
  }

  /// The API's error envelope is `{ error: { code, message, details } }`.
  ApiException _fromBody(int status, dynamic data) {
    String? code;
    String? message;
    final fieldErrors = <String, String>{};

    if (data is Map) {
      final error = data['error'];
      if (error is Map) {
        code = error['code'] as String?;
        message = error['message'] as String?;

        final details = error['details'];
        if (details is Map) {
          details.forEach((key, value) {
            if (value is String) {
              fieldErrors['$key'] = value;
            } else if (value is List && value.isNotEmpty) {
              fieldErrors['$key'] = '${value.first}';
            }
          });
        }
      }
    }

    return ApiException(
      kind: _kindFor(status),
      status: status,
      code: code,
      // The backend writes messages meant for people. Falling back to our own
      // sentence only when it did not is what keeps domain wording server-side.
      message: message ?? _defaultMessageFor(status),
      fieldErrors: fieldErrors,
    );
  }

  ApiErrorKind _kindFor(int status) {
    if (status == 401) return ApiErrorKind.unauthorized;
    if (status == 403) return ApiErrorKind.forbidden;
    if (status == 404) return ApiErrorKind.notFound;
    if (status == 409) return ApiErrorKind.conflict;
    if (status == 400 || status == 422) return ApiErrorKind.validation;
    if (status >= 500) return ApiErrorKind.server;
    return ApiErrorKind.unknown;
  }

  String _defaultMessageFor(int status) {
    if (status == 403) return 'You do not have access to that.';
    if (status == 404) return 'We could not find that.';
    if (status >= 500) return 'Something went wrong on our side. Please try again.';
    return 'Something went wrong. Please try again.';
  }

  ApiException _fromDio(DioException error) {
    switch (error.type) {
      case DioExceptionType.cancel:
        return ApiException(
          kind: ApiErrorKind.cancelled,
          message: 'Request cancelled.',
        );
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiException(
          kind: ApiErrorKind.timeout,
          message: 'That took too long. Check your connection and try again.',
        );
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return ApiException(
          kind: ApiErrorKind.network,
          message: 'You appear to be offline. Check your connection and try again.',
        );
      case DioExceptionType.badCertificate:
        return ApiException(
          kind: ApiErrorKind.network,
          message: 'We could not establish a secure connection.',
        );
      case DioExceptionType.badResponse:
        return _fromBody(error.response?.statusCode ?? 0, error.response?.data);
      // Dio may grow further cases; anything we do not recognise is reported as
      // a generic failure rather than crashing the call.
      default:
        return ApiException(
          kind: ApiErrorKind.unknown,
          message: 'Something went wrong. Please try again.',
        );
    }
  }

  /// Exchanges the refresh token, collapsing concurrent attempts into one.
  ///
  /// The backend rotates refresh tokens, so two parallel 401s each redeeming
  /// the stored token would have the second one rejected and would sign the
  /// user out mid-session. Every caller awaits the same future instead.
  Future<bool> _refreshSession() {
    final existing = _refreshFuture;
    if (existing != null) return existing;

    final future = _performRefresh();
    _refreshFuture = future;

    return future.whenComplete(() => _refreshFuture = null);
  }

  Future<bool> _performRefresh() async {
    final tokens = await _tokenStore.read();
    if (tokens == null) return false;

    try {
      final response = await _dio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': tokens.refreshToken},
        options: Options(headers: {'Accept': 'application/json'}),
      );

      final status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) return false;

      final data = response.data;
      if (data is! Map) return false;

      final next = SessionTokens.fromJson(Map<String, dynamic>.from(data));
      if (next == null) return false;

      await _tokenStore.write(next);
      return true;
    } on DioException {
      // A network failure during refresh is not proof the session is dead, but
      // the call that triggered it has already failed; the next attempt will
      // refresh again.
      return false;
    }
  }

  Future<void> setSession(SessionTokens tokens) => _tokenStore.write(tokens);

  Future<void> clearSession() => _tokenStore.clear();

  Future<bool> get hasSession async => (await _tokenStore.read()) != null;
}
