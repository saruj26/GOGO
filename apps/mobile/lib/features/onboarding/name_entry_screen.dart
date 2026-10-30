import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../l10n/app_localizations.dart';

/// Navigation data from [OtpScreen] to this screen — the signup ticket that
/// `/auth/register/complete` needs, plus whatever a prior Google step already
/// verified, pre-filled rather than asked for again.
class NameEntryArgs {
  const NameEntryArgs({
    required this.signupTicket,
    this.prefillFirstName,
    this.prefillEmail,
  });

  final String signupTicket;
  final String? prefillFirstName;
  final String? prefillEmail;
}

/// The final step for a new account: only ever reached once a phone (and
/// optionally a Google identity) has already been verified — see
/// [OtpScreen].
class NameEntryScreen extends ConsumerStatefulWidget {
  const NameEntryScreen({super.key, required this.args});

  final NameEntryArgs args;

  @override
  ConsumerState<NameEntryScreen> createState() => _NameEntryScreenState();
}

class _NameEntryScreenState extends ConsumerState<NameEntryScreen> {
  late final _firstName = TextEditingController(text: widget.args.prefillFirstName);
  final _lastName = TextEditingController();
  bool _busy = false;
  String? _firstNameError;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);

    setState(() {
      _firstNameError = _firstName.text.trim().isEmpty ? l10n.enterFirstName : null;
    });
    if (_firstNameError != null) return;

    setState(() => _busy = true);

    final ok = await ref.read(authControllerProvider.notifier).completeSignup(
          signupTicket: widget.args.signupTicket,
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim().isEmpty ? null : _lastName.text.trim(),
        );

    // On success the router redirect takes over as soon as the auth state
    // flips; only a failure needs this screen to do anything further.
    if (mounted && !ok) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final auth = ref.watch(authControllerProvider);

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.nameEntryTitle, style: theme.textTheme.headlineSmall),
                Gap.xs,
                Text(
                  l10n.nameEntrySubtitle,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                ),
                Gap.xl,
                if (auth.error != null) ...[FormError(message: auth.error!), Gap.lg],
                AppField(
                  label: l10n.firstNameLabel,
                  controller: _firstName,
                  textInputAction: TextInputAction.next,
                  errorText: _firstNameError,
                  autofillHints: const [AutofillHints.givenName],
                ),
                Gap.lg,
                AppField(
                  label: l10n.lastNameOptionalLabel,
                  controller: _lastName,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  autofillHints: const [AutofillHints.familyName],
                ),
                Gap.xl,
                BusyButton(label: l10n.createAccount, busy: _busy, onPressed: _submit),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
