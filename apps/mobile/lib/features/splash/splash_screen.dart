import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/brand_mark.dart';
import 'tugo_loader.dart';

/// The `/starting` screen: shown while the stored session is being checked.
///
/// Per the brand's startup spec: the wordmark appears immediately on a solid
/// Deep Teal background, then crossfades into the looping geometric loader
/// while [AuthController.restore] is in flight, then the router moves on the
/// instant the session resolves. A short local timeout guards the one real
/// failure mode `restore()` doesn't already handle itself — an unguarded
/// secure-storage read, or a hang — with a branded retry rather than a
/// screen stuck forever.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  static const _wordmarkBeat = Duration(milliseconds: 500);
  static const _stuckAfter = Duration(seconds: 12);

  bool _showLoader = false;
  bool _timedOut = false;
  Timer? _beatTimer;
  Timer? _stuckTimer;

  @override
  void initState() {
    super.initState();
    _beatTimer = Timer(_wordmarkBeat, () {
      if (mounted) setState(() => _showLoader = true);
    });
    _armStuckTimer();
  }

  void _armStuckTimer() {
    _stuckTimer?.cancel();
    _stuckTimer = Timer(_stuckAfter, () {
      if (mounted) setState(() => _timedOut = true);
    });
  }

  @override
  void dispose() {
    _beatTimer?.cancel();
    _stuckTimer?.cancel();
    super.dispose();
  }

  void _retry() {
    setState(() {
      _timedOut = false;
      _showLoader = false;
    });
    _beatTimer?.cancel();
    _beatTimer = Timer(_wordmarkBeat, () {
      if (mounted) setState(() => _showLoader = true);
    });
    _armStuckTimer();
    unawaited(ref.read(authControllerProvider.notifier).restore());
  }

  @override
  Widget build(BuildContext context) {
    // Resolution is driven by app_router's redirect watching this same
    // provider; this screen only needs to know what to show meanwhile.
    ref.watch(authControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.brand,
      body: Center(
        child: _timedOut ? _RetryContent(onRetry: _retry) : _LoadingContent(showLoader: _showLoader),
      ),
    );
  }
}

class _LoadingContent extends StatelessWidget {
  const _LoadingContent({required this.showLoader});

  final bool showLoader;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 400),
      child: showLoader
          ? const TugoLoader(key: ValueKey('loader'))
          : const TugoWordmark(key: ValueKey('wordmark')),
    );
  }
}

class _RetryContent extends StatelessWidget {
  const _RetryContent({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const TugoWordmark(size: 40),
          Gap.lg,
          const Text(
            "This is taking longer than expected.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white, fontSize: 16),
          ),
          Gap.lg,
          OutlinedButton.icon(
            onPressed: onRetry,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: Colors.white),
            ),
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}
