import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// One canned reply.
class Reply {
  Reply(this.status, this.body);

  Reply.ok(Object? body) : this(200, body);
  Reply.error(int status, String code, String message)
      : this(status, {
          'error': {'code': code, 'message': message},
        });

  final int status;
  final Object? body;
}

/// A recorded outgoing request, so a test can assert what was actually sent.
class SentRequest {
  SentRequest(this.method, this.path, this.headers, this.body, this.query);

  final String method;
  final String path;
  final Map<String, dynamic> headers;
  final Object? body;
  final Map<String, dynamic> query;

  String? get authorization => headers['Authorization'] as String?;
}

/// A Dio adapter that answers from a routing table instead of the network.
///
/// Tests drive the real [ApiClient] through this, so token attachment, the
/// refresh path, error mapping and cancellation are all exercised rather than
/// stubbed over.
class FakeHttp implements HttpClientAdapter {
  FakeHttp();

  final List<SentRequest> sent = [];

  /// `'POST /auth/login'` → a reply, or a function of the call index so a route
  /// can answer differently the second time (a token that expires once).
  final Map<String, Object> _routes = {};

  final Map<String, int> _hits = {};

  /// Artificial latency, used to test that concurrent 401s collapse into one
  /// refresh rather than racing.
  Duration delay = Duration.zero;

  /// When set, every request throws this instead of replying.
  DioExceptionType? failWith;

  void on(String route, Reply reply) => _routes[route] = reply;

  /// Replies according to how many times this route has been hit (0-based).
  void onSequence(String route, List<Reply> replies) => _routes[route] = replies;

  int hits(String route) => _hits[route] ?? 0;

  List<SentRequest> forRoute(String route) {
    final parts = route.split(' ');
    return sent
        .where((request) => request.method == parts[0] && request.path == parts[1])
        .toList(growable: false);
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final route = '${options.method} ${options.path}';

    sent.add(
      SentRequest(
        options.method,
        options.path,
        options.headers,
        options.data,
        options.queryParameters,
      ),
    );

    if (delay > Duration.zero) await Future<void>.delayed(delay);

    if (failWith != null) {
      throw DioException(requestOptions: options, type: failWith!);
    }

    // `_hits` holds the number of completed calls, so the index of THIS call is
    // the count before it is incremented.
    final index = _hits[route] ?? 0;
    _hits[route] = index + 1;

    final configured = _routes[route];

    final reply = switch (configured) {
      final Reply reply => reply,
      final List<Reply> replies => replies[index.clamp(0, replies.length - 1)],
      _ => Reply.error(404, 'NOT_FOUND', 'No fake route for $route'),
    };

    final encoded = reply.body == null ? '' : jsonEncode(reply.body);

    return ResponseBody.fromString(
      encoded,
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
