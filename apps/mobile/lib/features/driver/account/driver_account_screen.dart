import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/format/format.dart' as fmt;
import '../../../core/l10n/language_picker.dart';
import '../../../core/l10n/locale_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/states.dart';
import '../../../l10n/app_localizations.dart';
import '../driver_providers.dart';

/// The driver app's equivalent of the rider Account screen — deliberately
/// its own widget rather than a reuse of [ProfileScreen], since that screen
/// is full of rider-only concepts (ride/food/parcel stats, wallet,
/// promotions, saved places) that don't apply here.
class DriverAccountScreen extends ConsumerWidget {
  const DriverAccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final profile = ref.watch(driverProfileProvider);
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    if (user == null) return const Scaffold(body: LoadingState());

    return Scaffold(
      appBar: AppBar(title: Text(l10n.driverAccountTitle)),
      body: ListView(
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
                  ],
                ),
              ),
            ],
          ),
          Gap.lg,
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.directions_car_filled_outlined),
                  title: Text(l10n.driverAccountVehicle),
                  subtitle: Text(
                    profile.value?.vehicles.isNotEmpty == true
                        ? profile.value!.vehicles
                            .firstWhere((v) => v.isPrimary, orElse: () => profile.value!.vehicles.first)
                            .plateNumber
                        : l10n.driverAccountNoVehicle,
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.notifications_none_rounded),
                  title: Text(l10n.notifications),
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
              ],
            ),
          ),
          Gap.xl,
          OutlinedButton.icon(
            onPressed: () => _confirmSignOut(context, ref),
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
            icon: const Icon(Icons.logout_rounded),
            label: Text(l10n.profileSignOut),
          ),
        ],
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
