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

    if (user == null) return const Scaffold(body: LoadingState());

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
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
              label: const Text('Edit profile'),
            ),
            Gap.lg,
            summary.when(
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
              data: (value) => Row(
                children: [
                  _Stat(label: 'Rides', value: '${value.rides}'),
                  Gap.md,
                  _Stat(label: 'Food', value: '${value.foodOrders}'),
                  Gap.md,
                  _Stat(label: 'Parcels', value: '${value.parcels}'),
                ],
              ),
            ),
            Gap.lg,
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.account_balance_wallet_outlined),
                    title: const Text('Wallet & payments'),
                    subtitle: Text(
                      summary.value == null
                          ? 'Balance and payment history'
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
                    title: const Text('Promotions'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/promotions'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.bookmark_outline),
                    title: const Text('Saved places'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/profile/places'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.shield_outlined),
                    title: const Text('Shared-ride safety'),
                    subtitle: Text(
                      user.sharedRidePrefs?.genderPreference.label ?? 'Not set',
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/profile/safety'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.notifications_none_rounded),
                    title: const Text('Notifications'),
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
                    title: const Text('Help & support'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/support'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.support_agent_outlined),
                    title: const Text('Your support tickets'),
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
                  title: const Text('Switch to driving'),
                  subtitle: const Text('Go online and take rides and deliveries'),
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
              label: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your phone number and password to sign back in.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
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
