import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../l10n/app_localizations.dart';
import '../../models/auth.dart';
import 'name_entry_screen.dart';

/// Navigation data handed from [PhoneEntryScreen] to this screen via
/// `GoRouterState.extra` — plain data about where we are in the flow, not
/// app state, so it does not belong in a provider.
class OtpScreenArgs {
  const OtpScreenArgs({
    required this.phone,
    required this.otpTicket,
    this.devCode,
    this.priorSignupTicket,
  });

  final String phone;
  final String otpTicket;

  /// Only present while there is no SMS gateway.
  final String? devCode;

  /// A signup ticket from a prior Google step, still missing a phone.
  final String? priorSignupTicket;
}

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.args});

  final OtpScreenArgs args;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  static const _resendCooldown = Duration(seconds: 30);

  final _code = TextEditingController();
  late String _otpTicket;
  bool _busy = false;
  String? _error;
  int _attemptsRemaining = 5;
  Timer? _resendTimer;
  int _resendSecondsLeft = _resendCooldown.inSeconds;

  @override
  void initState() {
    super.initState();
    _otpTicket = widget.args.otpTicket;
    _startResendCooldown();
  }

  @override
  void dispose() {
    _code.dispose();
    _resendTimer?.cancel();
    super.dispose();
  }

  void _startResendCooldown() {
    _resendTimer?.cancel();
    setState(() => _resendSecondsLeft = _resendCooldown.inSeconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() => _resendSecondsLeft--);
      if (_resendSecondsLeft <= 0) timer.cancel();
    });
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final result = await ref.read(authControllerProvider.notifier).requestOtp(widget.args.phone);
      if (!mounted) return;
      setState(() => _otpTicket = result.otpTicket);
      _startResendCooldown();
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not resend the code. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    final l10n = AppLocalizations.of(context);
    final code = _code.text.trim();

    if (code.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final result = await ref.read(authControllerProvider.notifier).verifyOtp(
            phone: widget.args.phone,
            code: code,
            otpTicket: _otpTicket,
            priorSignupTicket: widget.args.priorSignupTicket,
          );

      if (!mounted) return;

      switch (result) {
        case OtpAuthenticated():
          // AuthController already wrote the session; the router redirect
          // takes it from here — nothing more to do on this screen.
          break;

        case OtpSignupRequired(:final signupTicket, :final firstName, :final email):
          unawaited(context.push(
            '/auth/name',
            extra: NameEntryArgs(
              signupTicket: signupTicket,
              prefillFirstName: firstName,
              prefillEmail: email,
            ),
          ));

        case OtpIncorrect(:final otpTicket, :final attemptsRemaining):
          _code.clear();
          setState(() {
            _otpTicket = otpTicket;
            _attemptsRemaining = attemptsRemaining;
            _error = attemptsRemaining <= 0
                ? l10n.otpTooManyAttempts
                : l10n.otpIncorrectWithAttempts(attemptsRemaining);
          });
      }
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);

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
                Text(l10n.otpTitle, style: theme.textTheme.headlineSmall),
                Gap.xs,
                Text(
                  l10n.otpSubtitle(widget.args.phone),
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                ),
                if (widget.args.devCode != null) ...[
                  Gap.lg,
                  InfoNote(message: l10n.otpDevModeBanner(widget.args.devCode!)),
                ],
                Gap.xl,
                if (_error != null) ...[FormError(message: _error!), Gap.lg],
                AppField(
                  label: l10n.otpTitle,
                  controller: _code,
                  hint: '••••••',
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _verify(),
                  maxLength: 8,
                  prefixIcon: Icons.password_rounded,
                ),
                Gap.lg,
                BusyButton(
                  label: l10n.verifyLabel,
                  busy: _busy,
                  onPressed: _attemptsRemaining <= 0 ? null : _verify,
                ),
                Gap.lg,
                Center(
                  child: _resendSecondsLeft > 0
                      ? Text(
                          l10n.resendCodeIn(_resendSecondsLeft),
                          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                        )
                      : TextButton(
                          onPressed: _busy ? null : _resend,
                          child: Text(l10n.resendCode),
                        ),
                ),
                Center(
                  child: TextButton(
                    onPressed: () => context.pop(),
                    child: Text(l10n.changedNumber),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
