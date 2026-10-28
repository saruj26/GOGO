import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../storage/token_store.dart';

/// One event pushed by the backend.
class RealtimeMessage {
  const RealtimeMessage({required this.event, required this.data, this.at});

  final String event;
  final Map<String, dynamic> data;
  final DateTime? at;
}

/// The socket connection.
///
/// A thin wrapper on purpose. It owns three things the rest of the app should
/// not have to think about: attaching the access token at handshake, asking the
/// server for a room and being told no, and re-joining those rooms after a
/// reconnect — which is the part that is easy to forget and impossible to
/// notice until someone's map stops moving.
class RealtimeClient {
  RealtimeClient({required String baseUrl, required this.tokens})
      : _url = _originOf(baseUrl);

  /// Where the access token comes from at handshake time.
  final TokenStore tokens;

  final String _url;

  io.Socket? _socket;

  final _messages = StreamController<RealtimeMessage>.broadcast();

  /// Rooms this client believes it is in, so they can be re-joined on
  /// reconnect. The server re-authorises every one of them again.
  final Set<String> _rooms = {};

  Stream<RealtimeMessage> get messages => _messages.stream;

  bool get isConnected => _socket?.connected ?? false;

  /// Only the events for one room, already filtered.
  Stream<RealtimeMessage> forRoom(String room) {
    final id = room.split(':').last;
    return _messages.stream.where((message) =>
        message.data['rideId'] == id ||
        message.data['orderId'] == id ||
        message.data['parcelId'] == id ||
        message.data['id'] == id);
  }

  Future<void> connect() async {
    if (_socket != null) return;

    final session = await tokens.read();
    if (session == null) return;

    final socket = io.io(
      '$_url/realtime',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': session.accessToken})
          // Reconnection is the normal state of a phone, not an error path.
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(10000)
          .build(),
    );

    socket.onConnect((_) {
      // Rooms do not survive a reconnect on the server, so they are asked for
      // again — and re-authorised again.
      for (final room in _rooms) {
        socket.emitWithAck('subscribe', {'room': room}, ack: (_) {});
      }
    });

    socket.onAny((event, data) {
      if (data is! Map) return;

      _messages.add(
        RealtimeMessage(
          event: event,
          data: Map<String, dynamic>.from((data['data'] as Map?) ?? const {}),
          at: DateTime.tryParse('${data['at']}'),
        ),
      );
    });

    socket.on('unauthorized', (_) {
      // The token expired while connected. Dropping the socket lets the next
      // connect pick up a refreshed one rather than retrying with a dead token.
      disconnect();
    });

    _socket = socket;
    socket.connect();
  }

  /// Asks to follow a resource. The server decides.
  Future<bool> subscribe(String room) async {
    _rooms.add(room);

    final socket = _socket;
    if (socket == null || !socket.connected) {
      await connect();
      return false;
    }

    final completer = Completer<bool>();

    socket.emitWithAck('subscribe', {'room': room}, ack: (dynamic response) {
      final ok = response is Map && response['ok'] == true;
      if (!ok) _rooms.remove(room);
      if (!completer.isCompleted) completer.complete(ok);
    });

    // A server that never acknowledges must not hang the caller; the polling
    // fallback carries the screen in that case.
    return completer.future.timeout(
      const Duration(seconds: 5),
      onTimeout: () => false,
    );
  }

  Future<void> unsubscribe(String room) async {
    _rooms.remove(room);
    _socket?.emit('unsubscribe', {'room': room});
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _rooms.clear();
  }

  Future<void> dispose() async {
    disconnect();
    await _messages.close();
  }

  /// `https://api.example.com/api/v1` → `https://api.example.com`.
  static String _originOf(String baseUrl) {
    final uri = Uri.parse(baseUrl);
    return '${uri.scheme}://${uri.authority}';
  }
}
