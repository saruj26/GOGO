/// Presentation of values the backend produced.
///
/// Money arrives as a fixed-point decimal string and is displayed as one. It is
/// never parsed into a `double` for arithmetic: the backend is the only thing
/// that does money arithmetic, and a binary float would quietly disagree with
/// the receipt. These functions group digits textually and nothing more.
library;

import 'package:intl/intl.dart';

String money(String? amountValue, {String currency = 'LKR'}) {
  if (amountValue == null || amountValue.isEmpty) return '—';
  return '$currency ${amount(amountValue)}';
}

/// Money without the currency code, for rows where it is already shown.
String amount(String? value) {
  if (value == null || value.isEmpty) return '—';

  final negative = value.startsWith('-');
  final bare = negative ? value.substring(1) : value;

  final parts = bare.split('.');
  final whole = parts.first;
  final fraction = parts.length > 1 ? parts[1] : '00';

  final buffer = StringBuffer();
  for (var i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 == 0) buffer.write(',');
    buffer.write(whole[i]);
  }

  return '${negative ? '-' : ''}$buffer.$fraction';
}

String distance(int? metres) {
  if (metres == null) return '—';
  if (metres < 1000) return '$metres m';
  return '${(metres / 1000).toStringAsFixed(1)} km';
}

String duration(int? seconds) {
  if (seconds == null) return '—';

  final minutes = (seconds / 60).round();
  if (minutes < 60) return '$minutes min';

  final hours = minutes ~/ 60;
  final remainder = minutes % 60;
  return remainder == 0 ? '$hours h' : '$hours h $remainder min';
}

String minutes(int? value) => value == null ? '—' : '$value min';

String dateTime(DateTime? value) =>
    value == null ? '—' : DateFormat('d MMM, HH:mm').format(value);

String dateOnly(DateTime? value) => value == null ? '—' : DateFormat('d MMM y').format(value);

String clockTime(DateTime? value) => value == null ? '—' : DateFormat('HH:mm').format(value);

String relativeTime(DateTime? value) {
  if (value == null) return '—';

  final elapsed = DateTime.now().difference(value);
  if (elapsed.isNegative) return dateTime(value);
  if (elapsed.inMinutes < 1) return 'just now';
  if (elapsed.inMinutes < 60) return '${elapsed.inMinutes} min ago';
  if (elapsed.inHours < 24) return '${elapsed.inHours} h ago';
  if (elapsed.inDays < 7) return '${elapsed.inDays} d ago';
  return dateTime(value);
}

/// Readable without changing the value.
String phone(String? value) {
  if (value == null || value.isEmpty) return '—';

  final match = RegExp(r'^(\+\d{2})(\d{2})(\d{3})(\d{4})$').firstMatch(value);
  if (match == null) return value;

  return '${match[1]} ${match[2]} ${match[3]} ${match[4]}';
}
