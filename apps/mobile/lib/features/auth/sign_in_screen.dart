import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';

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
    final phone = _phone.text.trim();
    final password = _password.text;

    setState(() {
      _phoneError = phone.isEmpty ? 'Enter your phone number' : null;
      _passwordError = password.isEmpty ? 'Enter your password' : null;
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
                    Icon(Icons.alt_route_rounded, size: 44, color: theme.colorScheme.primary),
                    Gap.lg,
                    Text('Welcome back', style: theme.textTheme.headlineSmall),
                    Gap.xs,
                    Text(
                      'Sign in to book a ride, order food, or send a parcel.',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                    Gap.xl,
                    if (auth.error != null) ...[
                      FormError(message: auth.error!),
                      Gap.lg,
                    ],
                    AppField(
                      label: 'Phone number',
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
                      label: 'Password',
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
                        tooltip: _obscure ? 'Show password' : 'Hide password',
                      ),
                    ),
                    Gap.xl,
                    BusyButton(label: 'Sign in', busy: _busy, onPressed: _submit),
                    Gap.lg,
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'New here?',
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: theme.colorScheme.outline),
                        ),
                        TextButton(
                          onPressed: () => context.push('/register'),
                          child: const Text('Create an account'),
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
