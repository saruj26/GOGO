import 'package:flutter/material.dart';

import '../format/format.dart' as fmt;
import '../theme/app_theme.dart';

/// Chooses how something is paid for.
///
/// Only the methods the backend will actually accept are selectable. Card and
/// online payments are refused at booking because no gateway is integrated, so
/// they are shown as unavailable with the reason rather than hidden — hiding
/// them would make the app look finished and leave the person wondering.
class PaymentPicker extends StatelessWidget {
  const PaymentPicker({
    super.key,
    required this.value,
    required this.onChanged,
    this.walletBalance,
    this.walletCurrency = 'LKR',
    this.walletFrozen = false,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String? walletBalance;
  final String walletCurrency;
  final bool walletFrozen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RadioGroup<String>(
          groupValue: value,
          onChanged: (selected) {
            if (selected != null) onChanged(selected);
          },
          child: Column(
            children: [
              const RadioListTile<String>(
                value: 'CASH',
                title: Text('Cash'),
                subtitle: Text('Pay the courier on delivery'),
                contentPadding: EdgeInsets.zero,
              ),
              RadioListTile<String>(
                value: 'WALLET',
                // A frozen wallet cannot be spent, and the backend refuses it,
                // so the option is disabled with the reason rather than
                // failing after the person has committed to an order.
                enabled: !walletFrozen,
                title: const Text('Wallet'),
                subtitle: Text(
                  walletFrozen
                      ? 'Your wallet is on hold'
                      : walletBalance == null
                          ? 'Pay from your wallet balance'
                          : 'Balance ${fmt.money(walletBalance, currency: walletCurrency)}',
                ),
                contentPadding: EdgeInsets.zero,
              ),
            ],
          ),
        ),
        Gap.sm,
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.credit_card_off_outlined, size: 18, color: theme.colorScheme.outline),
              Gap.sm,
              Expanded(
                child: Text(
                  'Card and online payment are not available yet.',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
