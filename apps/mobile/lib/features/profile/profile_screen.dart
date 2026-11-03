import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/l10n/language_picker.dart';
import '../../core/l10n/locale_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../l10n/app_localizations.dart';
import '../payments/wallet_providers.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final summary = ref.watch(accountSummaryProvider);
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    if (user == null) return const Scaffold(body: LoadingState());

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navAccount)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(accountSummaryProvider);
          await ref.read(authControllerProvider.notifier).refreshUser();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: theme.colorScheme.primaryContainer,
                  child: Text(
                    user.initials,
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                ),
                Gap.lg,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user.displayName, style: theme.textTheme.titleLarge),
                      Text(
                        fmt.phone(user.phone),
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                      if (user.email != null)
                        Text(
                          user.email!,
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: theme.colorScheme.outline),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            Gap.lg,
            OutlinedButton.icon(
              onPressed: () => context.push('/profile/edit'),
              icon: const Icon(Icons.edit_outlined),
              label: Text(l10n.profileEditProfile),
            ),
            Gap.lg,
            summary.when(
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
              data: (value) => Row(
                children: [
                  _Stat(label: l10n.profileStatRides, value: '${value.rides}'),
                  Gap.md,
                  _Stat(label: l10n.profileStatFood, value: '${value.foodOrders}'),
                  Gap.md,
                  _Stat(label: l10n.profileStatParcels, value: '${value.parcels}'),
                ],
              ),
            ),
            Gap.lg,
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.account_balance_wallet_outlined),
                    title: Text(l10n.profileWallet),
                    subtitle: Text(
                      summary.value == null
                          ? l10n.profileWalletSubtitleEmpty
                          : fmt.money(
                              summary.value!.walletBalance,
                              currency: summary.value!.currency,
                            ),
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/wallet'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.local_offer_outlined),
                    title: Text(l10n.profilePromotions),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/promotions'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.bookmark_outline),
                    title: Text(l10n.profileSavedPlaces),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/profile/places'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.shield_outlined),
                    title: Text(l10n.profileSharedRideSafety),
                    subtitle: Text(
                      user.sharedRidePrefs?.genderPreference.label ?? l10n.profileNotSet,
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/profile/safety'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.notifications_none_rounded),
                    title: Text(l10n.profileNotifications),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/notifications'),
                  ),
                  const Divider(height: 1),
                  Consumer(
                    builder: (context, ref, _) {
                      final l10n = AppLocalizations.of(context);
                      final locale = ref.watch(localeControllerProvider);
                      return ListTile(
                        leading: const Icon(Icons.language_rounded),
                        title: Text(l10n.languageLabel),
                        subtitle: Text(switch (locale?.languageCode) {
                          'ta' => l10n.languageTamil,
                          'si' => l10n.languageSinhala,
                          'en' => l10n.languageEnglish,
                          _ => l10n.languageSystem,
                        }),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => showLanguagePicker(context, ref),
                      );
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.help_outline_rounded),
                    title: Text(l10n.profileHelpSupport),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/support'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.support_agent_outlined),
                    title: Text(l10n.profileSupportTickets),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/support/tickets'),
                  ),
                ],
              ),
            ),
            if (user.isDriver) ...[
              Gap.lg,
              Card(
                child: ListTile(
                  leading: const Icon(Icons.local_taxi_rounded),
                  title: Text(l10n.profileSwitchToDriving),
                  subtitle: Text(l10n.profileSwitchToDrivingSubtitle),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.go('/driver'),
                ),
              ),
            ],
            Gap.xl,
            OutlinedButton.icon(
              onPressed: () => _confirmSignOut(context, ref),
              style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
              icon: const Icon(Icons.logout_rounded),
              label: Text(l10n.profileSignOut),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.profileSignOutConfirmTitle),
        content: Text(l10n.profileSignOutConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.profileStay),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.profileSignOut),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await ref.read(authControllerProvider.notifier).signOut();
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          child: Column(
            children: [
              Text(value, style: theme.textTheme.titleLarge),
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
