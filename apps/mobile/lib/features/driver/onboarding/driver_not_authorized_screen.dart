import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/widgets/states.dart';
import '../../../l10n/app_localizations.dart';

/// Shown when a signed-in account has no driver role on it.
///
/// The router sends anyone authenticated-but-not-a-driver here rather than
/// into the driver shell, which would otherwise call endpoints the backend
/// is going to refuse anyway.
class DriverNotAuthorizedScreen extends ConsumerWidget {
  const DriverNotAuthorizedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      body: SafeArea(
        child: EmptyState(
          title: l10n.driverNotAuthorizedTitle,
          message: l10n.driverNotAuthorizedMessage,
          icon: Icons.no_crash_outlined,
          action: OutlinedButton.icon(
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
            icon: const Icon(Icons.logout_rounded),
            label: Text(l10n.profileSignOut),
          ),
        ),
      ),
    );
  }
}
