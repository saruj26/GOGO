import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The app's chosen language, persisted across launches.
///
/// `null` means "follow the device" — the common case, and the one that
/// needs no explicit choice from anyone.
class LocaleController extends Notifier<Locale?> {
  static const _key = 'tugo.locale';
  static const supported = {'en', 'ta', 'si'};

  FlutterSecureStorage get _storage => const FlutterSecureStorage();

  @override
  Locale? build() {
    Future.microtask(_restore);
    return null;
  }

  Future<void> _restore() async {
    final code = await _storage.read(key: _key);
    if (code != null && supported.contains(code)) {
      state = Locale(code);
    }
  }

  Future<void> set(Locale? locale) async {
    state = locale;
    if (locale == null) {
      await _storage.delete(key: _key);
    } else {
      await _storage.write(key: _key, value: locale.languageCode);
    }
  }
}

final localeControllerProvider = NotifierProvider<LocaleController, Locale?>(
  LocaleController.new,
);
