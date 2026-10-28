import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../models/account.dart';
import '../../models/common.dart';

final accountSummaryProvider = FutureProvider.autoDispose<AccountSummary>(
  (ref) => ref.watch(apiProvider).account.summary(),
);

final walletProvider = FutureProvider.autoDispose<WalletView>(
  (ref) => ref.watch(apiProvider).account.wallet(limit: 20),
);

final paymentsProvider = FutureProvider.autoDispose<CursorPage<PaymentHistoryItem>>(
  (ref) => ref.watch(apiProvider).account.payments(limit: 20),
);

final promotionsProvider = FutureProvider.autoDispose<List<AvailablePromotion>>(
  (ref) => ref.watch(apiProvider).account.promotions(),
);
