import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/brand_mark.dart';
import '../../core/widgets/forms.dart';
import '../../l10n/app_localizations.dart';
import '../../models/auth.dart';
import 'otp_screen.dart';

/// The single entry point for a signed-out person: enter a phone number,
/// verify it, and either sign in (an existing phone) or continue to name
/// entry (a new one) — matching the reference flow, where there is no
/// separate "login" vs "register" choice up front.
///
/// [prefill] carries whatever a prior Google step already verified (email,
/// name), so the signup ticket produced by OTP verification can merge it in
/// rather than losing it.
class PhoneEntryScreen extends ConsumerStatefulWidget {
  const PhoneEntryScreen({super.key, this.prefillSignupTicket});

  /// A signup ticket from a prior Google step, still missing a phone.
  final String? prefillSignupTicket;

  @override
  ConsumerState<PhoneEntryScreen> createState() => _PhoneEntryScreenState();
}

class _PhoneEntryScreenState extends ConsumerState<PhoneEntryScreen> {
  final _phone = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submitPhone() async {
    final l10n = AppLocalizations.of(context);
    final phone = _phone.text.trim();

    if (phone.isEmpty) {
      setState(() => _error = l10n.enterPhoneNumber);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final result = await ref.read(authControllerProvider.notifier).requestOtp(phone);
      if (!mounted) return;
      unawaited(context.push(
        '/auth/otp',
        extra: OtpScreenArgs(
          phone: phone,
          otpTicket: result.otpTicket,
          devCode: result.devCode,
          priorSignupTicket: widget.prefillSignupTicket,
        ),
      ));
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = _messageFor(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _messageFor(Object error) {
    final text = error.toString();
    final marker = ': ';
    final index = text.indexOf(marker);
    return index == -1 ? text : text.substring(index + marker.length);
  }

  Future<void> _continueWithGoogle() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final config = ref.read(appConfigProvider);
      // On Android the platform client id comes from google-services.json;
      // serverClientId (the web client) is what makes the returned ID token
      // verifiable by our backend, which checks its audience against the
      // same web client id.
      await GoogleSignIn.instance.initialize(serverClientId: config.googleClientId);
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;

      if (idToken == null) {
        throw StateError('Google did not return an ID token.');
      }

      final result = await ref.read(authControllerProvider.notifier).signInWithGoogle(idToken);
      if (!mounted) return;

      switch (result) {
        case GoogleAuthenticated():
          // AuthController already wrote the session; the router redirect
          // takes it from here.
          break;
        case GooglePhoneRequired(:final signupTicket):
          context.pushReplacement(
            '/auth/phone',
            extra: signupTicket,
          );
      }
    } on GoogleSignInException catch (error) {
      if (!mounted || error.code == GoogleSignInExceptionCode.canceled) return;
      setState(() => _error = l10n.phoneEntrySubtitle);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not sign in with Google. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final googleEnabled = ref.watch(appConfigProvider).googleSignInEnabled;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(child: TugoWordmark(size: 36, color: theme.colorScheme.primary)),
                Gap.xl,
                Text(l10n.phoneEntryTitle, style: theme.textTheme.headlineSmall),
                Gap.xs,
                Text(
                  l10n.phoneEntrySubtitle,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                ),
                Gap.xl,
                if (_error != null) ...[FormError(message: _error!), Gap.lg],
                AppField(
                  label: l10n.phoneNumberLabel,
                  controller: _phone,
                  hint: '+94 7X XXX XXXX',
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submitPhone(),
                  prefixIcon: Icons.phone_outlined,
                  autofillHints: const [AutofillHints.telephoneNumber],
                ),
                Gap.lg,
                BusyButton(label: l10n.continueLabel, busy: _busy, onPressed: _submitPhone),
                if (googleEnabled) ...[
                  Gap.lg,
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          l10n.orDivider,
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                        ),
                      ),
                      const Expanded(child: Divider()),
                    ],
                  ),
                  Gap.lg,
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _continueWithGoogle,
                    icon: const Icon(Icons.g_mobiledata_rounded, size: 24),
                    label: Text(l10n.continueWithGoogle),
                  ),
                ],
                Gap.xl,
                Text(
                  l10n.phoneConsentNotice,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
