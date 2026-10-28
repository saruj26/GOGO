import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../models/account.dart';
import '../payments/wallet_providers.dart';

/// Promotions the backend says this account may use.
///
/// Whether one actually applies to a given booking is decided server-side when
/// the fare is quoted — the code is passed through and the discount comes back
/// in the price. Nothing here decides eligibility.
class PromotionsScreen extends ConsumerWidget {
  const PromotionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final promotions = ref.watch(promotionsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Promotions')),
      body: promotions.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(promotionsProvider)),
        data: (offers) => offers.isEmpty
            ? const EmptyState(
                title: 'No promotions right now',
                message: 'When you have an offer available it will show up here.',
                icon: Icons.local_offer_outlined,
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(promotionsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  itemCount: offers.length,
                  separatorBuilder: (_, _) => Gap.md,
                  itemBuilder: (context, index) => _PromotionCard(promotion: offers[index]),
                ),
              ),
      ),
    );
  }
}

class _PromotionCard extends StatelessWidget {
  const _PromotionCard({required this.promotion});

  final AvailablePromotion promotion;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(promotion.name, style: theme.textTheme.titleMedium)),
                Text(
                  promotion.isPercent
                      ? '${promotion.value.replaceAll(RegExp(r'\.00$'), '')}% off'
                      : '${fmt.money(promotion.value)} off',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.success,
                  ),
                ),
              ],
            ),
            if (promotion.description != null) ...[
              Gap.sm,
              Text(promotion.description!, style: theme.textTheme.bodyMedium),
            ],
            Gap.md,
            InkWell(
              onTap: () {
                Clipboard.setData(ClipboardData(text: promotion.code));
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('${promotion.code} copied')),
                );
              },
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      promotion.code,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.5,
                      ),
                    ),
                    Gap.sm,
                    const Icon(Icons.copy_rounded, size: 16),
                  ],
                ),
              ),
            ),
            Gap.md,
            // These are the restrictions the backend published. They are shown
            // so the person understands the offer, not applied here.
            Text(
              [
                if (promotion.minOrderAmount != '0.00')
                  'Minimum spend ${fmt.money(promotion.minOrderAmount)}',
                if (promotion.maxDiscount != null)
                  'Up to ${fmt.money(promotion.maxDiscount)} off',
                if (promotion.appliesTo != null)
                  'For ${promotion.appliesTo!.map((s) => labelFor(serviceLabel, s)).join(', ')}',
                if (promotion.expiresAt != null) 'Expires ${fmt.dateOnly(promotion.expiresAt)}',
                '${promotion.usesLeft} ${promotion.usesLeft == 1 ? 'use' : 'uses'} left',
              ].join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
      ),
    );
  }
}
