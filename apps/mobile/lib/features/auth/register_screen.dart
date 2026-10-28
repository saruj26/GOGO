import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';

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
    setState(() {
      _errors.clear();
      if (_firstName.text.trim().isEmpty) _errors['firstName'] = 'Enter your first name';
      if (_phone.text.trim().isEmpty) _errors['phone'] = 'Enter your phone number';
      if (_password.text.length < 8) {
        _errors['password'] = 'Use at least 8 characters';
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

    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
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
                    label: 'First name',
                    controller: _firstName,
                    textInputAction: TextInputAction.next,
                    errorText: _errors['firstName'],
                    autofillHints: const [AutofillHints.givenName],
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Last name (optional)',
                    controller: _lastName,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.familyName],
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Phone number',
                    controller: _phone,
                    hint: '+94 7X XXX XXXX',
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    errorText: _errors['phone'],
                    autofillHints: const [AutofillHints.telephoneNumber],
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Email (optional)',
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                  ),
                  Gap.lg,
                  AppField(
                    label: 'Password',
                    controller: _password,
                    obscureText: _obscure,
                    helper: 'At least 8 characters',
                    errorText: _errors['password'],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    suffix: IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(
                        _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                      ),
                      tooltip: _obscure ? 'Show password' : 'Hide password',
                    ),
                  ),
                  Gap.xl,
                  Text('Gender (optional)', style: theme.textTheme.labelLarge),
                  Gap.xs,
                  Text(
                    'Only used for shared-ride safety preferences such as women-only rides.',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                  Gap.sm,
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final option in const [
                        ('FEMALE', 'Female'),
                        ('MALE', 'Male'),
                        ('OTHER', 'Other'),
                        ('UNDISCLOSED', 'Prefer not to say'),
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
                  BusyButton(label: 'Create account', busy: _busy, onPressed: _submit),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
