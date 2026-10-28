import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/brand_mark.dart';
import '../../core/widgets/forms.dart';
import '../../l10n/app_localizations.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _phoneError;
  String? _passwordError;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final phone = _phone.text.trim();
    final password = _password.text;

    setState(() {
      _phoneError = phone.isEmpty ? l10n.enterPhoneNumber : null;
      _passwordError = password.isEmpty ? l10n.enterPassword : null;
    });

    if (_phoneError != null || _passwordError != null) return;

    setState(() => _busy = true);
    await ref.read(authControllerProvider.notifier).signIn(phone: phone, password: password);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            // Keeps the fields above the keyboard on a 320dp phone instead of
            // the password field disappearing behind it.
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 24,
              bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(child: TugoWordmark(size: 40, color: theme.colorScheme.primary)),
                    Gap.xl,
                    Text(l10n.welcomeBack, style: theme.textTheme.headlineSmall),
                    Gap.xs,
                    Text(
                      l10n.signInSubtitle,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                    Gap.xl,
                    if (auth.error != null) ...[
                      FormError(message: auth.error!),
                      Gap.lg,
                    ],
                    AppField(
                      label: l10n.phoneNumberLabel,
                      controller: _phone,
                      hint: '+94 7X XXX XXXX',
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      prefixIcon: Icons.phone_outlined,
                      errorText: _phoneError,
                      autofillHints: const [AutofillHints.telephoneNumber],
                    ),
                    Gap.lg,
                    AppField(
                      label: l10n.passwordLabel,
                      controller: _password,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                      prefixIcon: Icons.lock_outline,
                      errorText: _passwordError,
                      autofillHints: const [AutofillHints.password],
                      suffix: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        tooltip: _obscure ? l10n.showPassword : l10n.hidePassword,
                      ),
                    ),
                    Gap.xl,
                    BusyButton(label: l10n.signIn, busy: _busy, onPressed: _submit),
                    Gap.lg,
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          l10n.newHere,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: theme.colorScheme.outline),
                        ),
                        TextButton(
                          onPressed: () => context.push('/register'),
                          child: Text(l10n.createAnAccount),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
