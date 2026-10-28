import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../models/common.dart';
import '../../models/support.dart';

final myTicketsProvider = FutureProvider.autoDispose<CursorPage<SupportTicketSummary>>(
  (ref) => ref.watch(apiProvider).support.list(limit: 30),
);

final ticketProvider =
    FutureProvider.autoDispose.family<SupportTicketDetail, String>((ref, ticketId) {
  return ref.watch(apiProvider).support.get(ticketId);
});
