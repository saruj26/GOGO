import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import 'wallet_providers.dart';

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Payments'),
          bottom: const TabBar(tabs: [Tab(text: 'Wallet'), Tab(text: 'History')]),
        ),
        body: const TabBarView(children: [_WalletTab(), _PaymentsTab()]),
      ),
    );
  }
}

class _WalletTab extends ConsumerWidget {
  const _WalletTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(walletProvider);
    final theme = Theme.of(context);

    return wallet.when(
      loading: () => const LoadingState(),
      error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(walletProvider)),
      data: (view) => RefreshIndicator(
        onRefresh: () async => ref.invalidate(walletProvider),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Balance',
                      style:
                          theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                    ),
                    Gap.xs,
                    Text(
                      fmt.money(view.balance, currency: view.currency),
                      style: theme.textTheme.headlineMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    if (view.frozen) ...[
                      Gap.md,
                      const InfoNote(
                        icon: Icons.lock_outline,
                        message: 'Your wallet is on hold and cannot be used for payments. '
                            'Please contact support.',
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Gap.lg,
            // Stated rather than offered: there is no top-up endpoint, and a
            // button that led nowhere would be worse than none.
            const InfoNote(
              icon: Icons.info_outline_rounded,
              message: 'Wallet top-up is not available in the app yet. Your balance grows from '
                  'refunds and credits applied by support.',
            ),
            Gap.lg,
            Text('Recent activity', style: theme.textTheme.titleMedium),
            Gap.md,
            if (view.transactions.items.isEmpty)
              const EmptyState(
                title: 'No wallet activity',
                message: 'Credits and payments made from your wallet will appear here.',
                icon: Icons.account_balance_wallet_outlined,
              )
            else
              for (final transaction in view.transactions.items)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Icon(
                      transaction.isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                      color: transaction.isCredit ? AppColors.success : theme.colorScheme.outline,
                    ),
                    title: Text(transaction.description ?? (transaction.isCredit ? 'Credit' : 'Payment')),
                    subtitle: Text(fmt.dateTime(transaction.at)),
                    trailing: Text(
                      '${transaction.isCredit ? '+' : '−'}${fmt.amount(transaction.amount)}',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: transaction.isCredit ? AppColors.success : null,
                      ),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _PaymentsTab extends ConsumerWidget {
  const _PaymentsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payments = ref.watch(paymentsProvider);
    final theme = Theme.of(context);

    return payments.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(paymentsProvider)),
      data: (page) => page.items.isEmpty
          ? const EmptyState(
              title: 'No payments yet',
              message: 'Payments for rides, food and parcels will appear here.',
              icon: Icons.receipt_long_outlined,
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(paymentsProvider),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                itemCount: page.items.length,
                separatorBuilder: (_, _) => Gap.sm,
                itemBuilder: (context, index) {
                  final payment = page.items[index];

                  return Card(
                    child: ListTile(
                      title: Text(
                        payment.description ?? labelFor(serviceLabel, payment.serviceType),
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            StatusBadge(
                              status: payment.status,
                              labels: paymentStatusLabel,
                              dense: true,
                            ),
                            Text(
                              '${labelFor(paymentMethodLabel, payment.method)} · ${fmt.dateTime(payment.paidAt ?? payment.createdAt)}',
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                            ),
                          ],
                        ),
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            fmt.money(payment.amount, currency: payment.currency),
                            style: theme.textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          if (payment.refunded != '0.00')
                            Text(
                              'refunded ${fmt.amount(payment.refunded)}',
                              style: theme.textTheme.bodySmall
                                  ?.copyWith(color: theme.colorScheme.outline),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
