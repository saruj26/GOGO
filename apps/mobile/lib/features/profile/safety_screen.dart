import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/errors/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../models/auth.dart';

/// Shared-ride safety preferences.
///
/// These are stored on the account and enforced by the matching engine when it
/// decides who may share a vehicle with whom. Changing them here changes what
/// the backend will match — the app is not filtering anything itself.
class SafetyScreen extends ConsumerStatefulWidget {
  const SafetyScreen({super.key});

  @override
  ConsumerState<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends ConsumerState<SafetyScreen> {
  SafetyPreferences? _draft;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final theme = Theme.of(context);

    if (user == null) return const Scaffold(body: LoadingState());

    final current = _draft ??
        user.sharedRidePrefs ??
        const SafetyPreferences(
          allowSharedRides: true,
          genderPreference: GenderPreference.any,
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Shared-ride safety')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          SectionCard(
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: current.allowSharedRides,
              onChanged: _busy
                  ? null
                  : (value) => setState(
                        () => _draft = current.copyWith(allowSharedRides: value),
                      ),
              title: const Text('Allow shared rides'),
              subtitle: const Text(
                'Let other passengers join journeys you are on, and let you join theirs.',
              ),
            ),
          ),
          Gap.lg,
          SectionCard(
            title: 'Who you are willing to share with',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RadioGroup<GenderPreference>(
                  groupValue: current.genderPreference,
                  onChanged: (value) {
                    if (_busy || value == null) return;
                    setState(() => _draft = current.copyWith(genderPreference: value));
                  },
                  child: Column(
                    children: [
                      for (final option in GenderPreference.values)
                        RadioListTile<GenderPreference>(
                          value: option,
                          enabled: !_busy,
                          contentPadding: EdgeInsets.zero,
                          title: Text(option.label),
                          subtitle: Text(option.description),
                        ),
                    ],
                  ),
                ),
                Gap.sm,
                Text(
                  'Same-gender matching uses the gender on your account. If you have not set '
                  'one, a same-gender preference cannot be honoured.',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ),
          ),
          Gap.lg,
          SectionCard(
            title: 'Comfort',
            child: Column(
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: current.allowFrontSeat,
                  onChanged: _busy
                      ? null
                      : (value) =>
                          setState(() => _draft = current.copyWith(allowFrontSeat: value)),
                  title: const Text('Allow the front seat'),
                  subtitle: const Text('You may be seated next to the driver.'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: current.shareContactWithCoPax,
                  onChanged: _busy
                      ? null
                      : (value) => setState(
                            () => _draft = current.copyWith(shareContactWithCoPax: value),
                          ),
                  title: const Text('Share my contact with co-passengers'),
                  subtitle: const Text('Off by default. Your details stay private.'),
                ),
              ],
            ),
          ),
          if (_error != null) ...[Gap.lg, FormError(message: _error!)],
          Gap.xl,
          BusyButton(
            label: 'Save preferences',
            busy: _busy,
            onPressed: _draft == null ? null : _save,
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final draft = _draft;
    if (draft == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final saved = await ref.read(apiProvider).auth.updateSafetyPreferences(
            allowSharedRides: draft.allowSharedRides,
            genderPreference: draft.genderPreference,
            allowFrontSeat: draft.allowFrontSeat,
            shareContactWithCoPax: draft.shareContactWithCoPax,
          );

      ref.read(authControllerProvider.notifier).applySafetyPreferences(saved);

      if (!mounted) return;
      setState(() {
        _busy = false;
        _draft = null;
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Preferences saved')));
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    }
  }
}
