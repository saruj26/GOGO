import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../l10n/app_localizations.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  /// Offered because the shared-ride safety preferences depend on it. Left
  /// unset unless the person chooses, and never inferred from a name.
  String? _gender;

  bool _busy = false;
  bool _obscure = true;
  final Map<String, String> _errors = {};

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _errors.clear();
      if (_firstName.text.trim().isEmpty) _errors['firstName'] = l10n.enterFirstName;
      if (_phone.text.trim().isEmpty) _errors['phone'] = l10n.enterPhoneNumber;
      if (_password.text.length < 8) {
        _errors['password'] = l10n.useAtLeast8Characters;
      }
    });

    if (_errors.isNotEmpty) return;

    setState(() => _busy = true);
    await ref.read(authControllerProvider.notifier).register(
          phone: _phone.text.trim(),
          password: _password.text,
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim(),
          email: _email.text.trim(),
          gender: _gender,
        );
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.createAccount)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 8,
            bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (auth.error != null) ...[FormError(message: auth.error!), Gap.lg],
                  AppField(
                    label: l10n.firstNameLabel,
                    controller: _firstName,
                    textInputAction: TextInputAction.next,
                    errorText: _errors['firstName'],
                    autofillHints: const [AutofillHints.givenName],
                  ),
                  Gap.lg,
                  AppField(
                    label: l10n.lastNameOptionalLabel,
                    controller: _lastName,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.familyName],
                  ),
                  Gap.lg,
                  AppField(
                    label: l10n.phoneNumberLabel,
                    controller: _phone,
                    hint: '+94 7X XXX XXXX',
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    errorText: _errors['phone'],
                    autofillHints: const [AutofillHints.telephoneNumber],
                  ),
                  Gap.lg,
                  AppField(
                    label: l10n.emailOptionalLabel,
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                  ),
                  Gap.lg,
                  AppField(
                    label: l10n.passwordLabel,
                    controller: _password,
                    obscureText: _obscure,
                    helper: l10n.useAtLeast8Characters,
                    errorText: _errors['password'],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    suffix: IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(
                        _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                      ),
                      tooltip: _obscure ? l10n.showPassword : l10n.hidePassword,
                    ),
                  ),
                  Gap.xl,
                  Text(l10n.genderOptionalLabel, style: theme.textTheme.labelLarge),
                  Gap.xs,
                  Text(
                    l10n.genderHelp,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                  Gap.sm,
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final option in [
                        ('FEMALE', l10n.genderFemale),
                        ('MALE', l10n.genderMale),
                        ('OTHER', l10n.genderOther),
                        ('UNDISCLOSED', l10n.genderPreferNotToSay),
                      ])
                        ChoiceChip(
                          label: Text(option.$2),
                          selected: _gender == option.$1,
                          onSelected: (selected) =>
                              setState(() => _gender = selected ? option.$1 : null),
                        ),
                    ],
                  ),
                  Gap.xl,
                  BusyButton(label: l10n.createAccount, busy: _busy, onPressed: _submit),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
