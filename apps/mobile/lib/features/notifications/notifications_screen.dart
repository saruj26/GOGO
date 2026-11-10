import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart' as fmt;
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../l10n/app_localizations.dart';
import '../../models/account.dart';
import '../../models/common.dart';

final notificationsProvider = FutureProvider.autoDispose<CursorPage<NotificationItem>>(
  (ref) => ref.watch(apiProvider).notifications.list(limit: 30),
);

final unreadCountProvider = FutureProvider.autoDispose<int>(
  (ref) => ref.watch(apiProvider).notifications.unreadCount(),
);

/// Notifications the backend recorded.
///
/// They are read here, not pushed: there is no push or realtime transport yet,
/// so nothing arrives while the app is closed. Saying so is better than a bell
/// icon that silently never rings.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.notificationsTitle),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(apiProvider).notifications.markAllRead();
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadCountProvider);
            },
            child: Text(l10n.notificationsMarkAllRead),
          ),
        ],
      ),
      body: notifications.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(notificationsProvider)),
        data: (page) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(notificationsProvider);
            ref.invalidate(unreadCountProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              InfoNote(
                icon: Icons.notifications_off_outlined,
                message: l10n.notificationsPushNotice,
              ),
              Gap.lg,
              if (page.items.isEmpty)
                EmptyState(
                  title: l10n.notificationsEmptyTitle,
                  message: l10n.notificationsEmptyMessage,
                  icon: Icons.notifications_none_rounded,
                )
              else
                for (final item in page.items) ...[
                  _NotificationTile(item: item),
                  Gap.sm,
                ],
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.item});

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
          item.isUnread ? Icons.mark_email_unread_outlined : Icons.mark_email_read_outlined,
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
