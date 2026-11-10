import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../l10n/app_localizations.dart';
import '../../models/account.dart';
import '../notifications/notifications_screen.dart';
import '../payments/wallet_providers.dart';

/// The single place offers and activity updates land, replacing a separate
/// trip to Notifications and Promotions with one tabbed view -- the pattern
/// most ride-hailing apps use for this. Both still exist as their own routes
/// (reachable from Account), this screen just reads the same two providers.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.inboxTitle),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: l10n.inboxTabAll),
              Tab(text: l10n.inboxTabOffers),
              Tab(text: l10n.inboxTabSupport),
              Tab(text: l10n.inboxTabUpdates),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _AllTab(),
            _OffersTab(),
            _SupportTab(),
            _UpdatesTab(),
          ],
        ),
      ),
    );
  }
}

/// The "Add new offer code" row, shown at the top of the All and Offers
/// tabs -- the two places a code someone was given (not already public)
/// would belong.
class _AddOfferCodeTile extends ConsumerWidget {
  const _AddOfferCodeTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);

    return Card(
      child: ListTile(
        leading: Icon(Icons.sell_outlined, color: theme.colorScheme.primary),
        title: Text(l10n.inboxAddOfferCode),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: () => _showAddOfferCodeDialog(context, ref),
      ),
    );
  }
}

Future<void> _showAddOfferCodeDialog(BuildContext context, WidgetRef ref) async {
  final l10n = AppLocalizations.of(context);
  final controller = TextEditingController();
  final messenger = ScaffoldMessenger.of(context);

  final applied = await showDialog<bool>(
    context: context,
    builder: (context) => _OfferCodeDialog(controller: controller, l10n: l10n, ref: ref),
  );

  if (applied == true) {
    messenger.showSnackBar(SnackBar(content: Text(l10n.inboxOfferCodeApplied)));
  }
}

class _OfferCodeDialog extends StatefulWidget {
  const _OfferCodeDialog({required this.controller, required this.l10n, required this.ref});

  final TextEditingController controller;
  final AppLocalizations l10n;
  final WidgetRef ref;

  @override
  State<_OfferCodeDialog> createState() => _OfferCodeDialogState();
}

class _OfferCodeDialogState extends State<_OfferCodeDialog> {
  bool _busy = false;
  String? _error;

  Future<void> _apply() async {
    final code = widget.controller.text.trim();
    if (code.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await widget.ref.read(apiProvider).account.claimPromotion(code);
      widget.ref.invalidate(promotionsProvider);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.l10n.inboxOfferCodeDialogTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppField(
            label: widget.l10n.inboxOfferCodeDialogTitle,
            controller: widget.controller,
            hint: widget.l10n.inboxOfferCodeHint,
            textInputAction: TextInputAction.done,
            inputFormatters: [UpperCaseTextFormatter()],
            onSubmitted: (_) => _apply(),
            errorText: _error,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
        ),
        BusyButton(label: widget.l10n.inboxOfferCodeApply, busy: _busy, onPressed: _apply),
      ],
    );
  }
}

class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}

class _AllTab extends ConsumerWidget {
  const _AllTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final promotions = ref.watch(promotionsProvider);
    final notifications = ref.watch(notificationsProvider);

    final loading = promotions.isLoading || notifications.isLoading;
    final error = promotions.hasError
        ? promotions.asError
        : (notifications.hasError ? notifications.asError : null);

    if (loading) return const LoadingState();
    if (error != null) {
      return ErrorState(
        error: error.error,
        onRetry: () {
          ref.invalidate(promotionsProvider);
          ref.invalidate(notificationsProvider);
        },
      );
    }

    final offers = promotions.value ?? const <AvailablePromotion>[];
    final items = notifications.value?.items ?? const [];
    final isEmpty = offers.isEmpty && items.isEmpty;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(promotionsProvider);
        ref.invalidate(notificationsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          const _AddOfferCodeTile(),
          if (isEmpty) ...[
            Gap.xl,
            EmptyState(
              title: l10n.inboxEmptyAllTitle,
              message: l10n.inboxEmptyAllMessage,
              icon: Icons.inbox_outlined,
            ),
          ],
          if (offers.isNotEmpty) ...[
            Gap.lg,
            Text(l10n.inboxSectionOffers, style: Theme.of(context).textTheme.titleMedium),
            Gap.sm,
            for (final offer in offers) ...[_OfferTile(promotion: offer), Gap.sm],
          ],
          if (items.isNotEmpty) ...[
            Gap.lg,
            Text(l10n.inboxSectionActivity, style: Theme.of(context).textTheme.titleMedium),
            Gap.sm,
            for (final item in items) ...[InboxNotificationTile(item: item), Gap.sm],
          ],
        ],
      ),
    );
  }
}

class _OffersTab extends ConsumerWidget {
  const _OffersTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final promotions = ref.watch(promotionsProvider);

    return promotions.when(
      loading: () => const LoadingState(),
      error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(promotionsProvider)),
      data: (offers) => RefreshIndicator(
        onRefresh: () async => ref.invalidate(promotionsProvider),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            const _AddOfferCodeTile(),
            Gap.lg,
            if (offers.isEmpty)
              EmptyState(
                title: l10n.inboxEmptyOffersTitle,
                message: l10n.inboxEmptyOffersMessage,
                icon: Icons.local_offer_outlined,
              )
            else
              for (final offer in offers) ...[_OfferTile(promotion: offer), Gap.sm],
          ],
        ),
      ),
    );
  }
}

/// Notifications whose type starts with `support.` -- replies on a ticket --
/// as opposed to the operational updates every other type carries.
bool _isSupportNotification(NotificationItem item) => item.type.startsWith('support.');

class _SupportTab extends ConsumerWidget {
  const _SupportTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final notifications = ref.watch(notificationsProvider);

    return notifications.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(notificationsProvider)),
      data: (page) {
        final items = page.items.where(_isSupportNotification).toList(growable: false);
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(notificationsProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              if (items.isEmpty)
                EmptyState(
                  title: l10n.inboxEmptySupportTitle,
                  message: l10n.inboxEmptySupportMessage,
                  icon: Icons.support_agent_outlined,
                )
              else
                for (final item in items) ...[InboxNotificationTile(item: item), Gap.sm],
            ],
          ),
        );
      },
    );
  }
}

class _UpdatesTab extends ConsumerWidget {
  const _UpdatesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final notifications = ref.watch(notificationsProvider);

    return notifications.when(
      loading: () => const LoadingState(),
      error: (error, _) =>
          ErrorState(error: error, onRetry: () => ref.invalidate(notificationsProvider)),
      data: (page) {
        final items = page.items.where((i) => !_isSupportNotification(i)).toList(growable: false);
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(notificationsProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              if (items.isEmpty)
                EmptyState(
                  title: l10n.inboxEmptyUpdatesTitle,
                  message: l10n.inboxEmptyUpdatesMessage,
                  icon: Icons.notifications_none_rounded,
                )
              else
                for (final item in items) ...[InboxNotificationTile(item: item), Gap.sm],
            ],
          ),
        );
      },
    );
  }
}

/// A promotion rendered inline in the inbox: the discount, the terms, and a
/// tap-to-copy code -- the same interaction as the standalone Promotions
/// screen, since there is no single destination to "book" into that is
/// correct for every service a promotion might apply to.
class _OfferTile extends StatelessWidget {
  const _OfferTile({required this.promotion});

  final AvailablePromotion promotion;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.local_offer_rounded, color: AppColors.success),
                Gap.sm,
                Expanded(child: Text(promotion.name, style: theme.textTheme.titleMedium)),
                Text(
                  promotion.isPercent
                      ? l10n.promotionsPercentOff(
                          promotion.value.replaceAll(RegExp(r'\.00$'), ''),
                        )
                      : l10n.promotionsAmountOff(fmt.money(promotion.value)),
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
                  SnackBar(content: Text(l10n.promotionsCodeCopied(promotion.code))),
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
            Text(
              [
                if (promotion.minOrderAmount != '0.00')
                  l10n.promotionsMinSpend(fmt.money(promotion.minOrderAmount)),
                if (promotion.maxDiscount != null)
                  l10n.promotionsUpTo(fmt.money(promotion.maxDiscount)),
                if (promotion.appliesTo != null)
                  l10n.promotionsForServices(
                    promotion.appliesTo!.map((s) => labelFor(serviceLabel, s)).join(', '),
                  ),
                if (promotion.expiresAt != null)
                  l10n.promotionsExpires(fmt.dateOnly(promotion.expiresAt)),
                l10n.promotionsUsesLeft(promotion.usesLeft),
              ].join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shared with [NotificationsScreen] in spirit (same data, same mark-as-read
/// behaviour) but public so the inbox tabs here can use it too.
class InboxNotificationTile extends ConsumerWidget {
  const InboxNotificationTile({super.key, required this.item});

  final NotificationItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Card(
      color: item.isUnread ? theme.colorScheme.primaryContainer.withValues(alpha: 0.3) : null,
      child: ListTile(
        onTap: item.isUnread
            ? () async {
                await ref.read(apiProvider).notifications.markRead(item.id);
                ref.invalidate(notificationsProvider);
                ref.invalidate(unreadCountProvider);
              }
            : null,
        leading: Icon(
          _isSupportNotification(item) ? Icons.support_agent_rounded : Icons.campaign_rounded,
          color: item.isUnread ? theme.colorScheme.primary : theme.colorScheme.outline,
        ),
        title: Text(
          item.title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: item.isUnread ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Gap.xs,
            Text(item.body),
            Gap.xs,
            Text(
              fmt.relativeTime(item.createdAt),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
        isThreeLine: true,
      ),
    );
  }
}
