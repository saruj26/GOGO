import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/language_picker.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/brand_mark.dart';
import '../../l10n/app_localizations.dart';

/// First screen a signed-out person sees: a cinematic Deep Teal hero (drawn
/// natively — no network image, nothing to fetch on launch) over which the
/// brand, a language switch and the two real entry points — sign up and
/// sign in — sit. Everything here is navigation onto the existing
/// [RegisterScreen]/[SignInScreen]; no auth logic lives on this screen.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final size = MediaQuery.sizeOf(context);
    final heroHeight = size.height * 0.6;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          Positioned.fill(
            child: IgnorePointer(
              child: CustomPaint(painter: _HeroPainter(heroFraction: 0.6)),
            ),
          ),
          SizedBox(
            height: heroHeight,
            width: double.infinity,
            child: Stack(
              children: [
                // The car and the person it's arriving for, sitting on the
                // painted road — the "customer + car" cue from the brief,
                // built from icons rather than a bundled photo.
                Positioned(
                  left: 0,
                  right: 0,
                  top: heroHeight * 0.82 - 100,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Icon(
                        Icons.directions_car_rounded,
                        size: 52,
                        color: Colors.white.withValues(alpha: 0.95),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        Icons.person_rounded,
                        size: 24,
                        color: Colors.white.withValues(alpha: 0.85),
                      ),
                    ],
                  ),
                ),
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            TugoWordmark(size: 30, color: AppColors.background),
                            const Spacer(),
                            _LanguagePill(code: currentLanguageCode(context, ref)),
                          ],
                        ),
                        Gap.sm,
                        Text(
                          l10n.welcomeTagline,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                color: Colors.white.withValues(alpha: 0.92),
                                fontWeight: FontWeight.w500,
                              ),
                        ),
                        const Spacer(),
                        _VehicleRow(l10n: l10n),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: _BottomPanel(l10n: l10n),
          ),
        ],
      ),
    );
  }
}

class _LanguagePill extends ConsumerWidget {
  const _LanguagePill({required this.code});

  final String code;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: Colors.black.withValues(alpha: 0.28),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => showLanguagePicker(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.language_rounded, size: 16, color: Colors.white),
              const SizedBox(width: 6),
              Text(
                code,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              const Icon(Icons.expand_more_rounded, size: 16, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

class _VehicleRow extends StatelessWidget {
  const _VehicleRow({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.directions_car_rounded, l10n.vehicleCar),
      (Icons.electric_rickshaw_rounded, l10n.vehicleTukTuk),
      (Icons.two_wheeler_rounded, l10n.vehicleBike),
    ];

    // Purely informational — not buttons, so nothing here promises an
    // action it can't perform; vehicle class is chosen inside booking.
    return Row(
      children: [
        for (final item in items) ...[
          Expanded(child: _VehicleChip(icon: item.$1, label: item.$2)),
          if (item != items.last) const SizedBox(width: 10),
        ],
      ],
    );
  }
}

class _VehicleChip extends StatelessWidget {
  const _VehicleChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Column(
        children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.only(topLeft: Radius.circular(28), topRight: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l10n.welcomeHeadline,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                  height: 1.15,
                ),
              ),
              Gap.sm,
              Text(
                l10n.welcomeSubtitle,
                style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary),
              ),
              Gap.xl,
              // Both buttons lead to the same unified phone entry — the
              // backend decides whether the phone belongs to an existing
              // account or a new one, so there is no separate login/register
              // choice to get wrong up front.
              FilledButton.icon(
                onPressed: () => context.push('/auth/phone'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: Colors.white,
                ),
                label: Text(l10n.createAccount, style: const TextStyle(fontWeight: FontWeight.w700)),
                icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                iconAlignment: IconAlignment.end,
              ),
              Gap.md,
              FilledButton(
                onPressed: () => context.push('/auth/phone'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.secondaryBackground,
                  foregroundColor: AppColors.brandDark,
                  elevation: 0,
                ),
                child: Text(l10n.logIn, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A dusk-toned gradient skyline with a glowing car on the road — an
/// original illustration, not a photo, so the welcome screen never fetches
/// or bundles a hero image.
class _HeroPainter extends CustomPainter {
  const _HeroPainter({required this.heroFraction});

  final double heroFraction;

  @override
  void paint(Canvas canvas, Size size) {
    final heroHeight = size.height * heroFraction;

    final sky = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF00636A), AppColors.brand, Color(0xFF004449)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, heroHeight));
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), sky);

    // Skyline silhouette, a handful of rounded-top blocks of varying height.
    final buildings = Paint()..color = Colors.black.withValues(alpha: 0.14);
    final rng = math.Random(7);
    final roadY = heroHeight * 0.82;
    double x = -20;
    while (x < size.width + 20) {
      final w = 36.0 + rng.nextDouble() * 34;
      final h = heroHeight * (0.18 + rng.nextDouble() * 0.22);
      final rect = RRect.fromRectAndCorners(
        Rect.fromLTWH(x, roadY - h, w, h + 40),
        topLeft: const Radius.circular(6),
        topRight: const Radius.circular(6),
      );
      canvas.drawRRect(rect, buildings);
      x += w + 14;
    }

    // Road.
    final road = Paint()..color = Colors.black.withValues(alpha: 0.22);
    canvas.drawRect(Rect.fromLTWH(0, roadY, size.width, heroHeight - roadY), road);
    final laneDash = Paint()
      ..color = Colors.white.withValues(alpha: 0.35)
      ..strokeWidth = 3;
    double dashX = 0;
    while (dashX < size.width) {
      canvas.drawLine(
        Offset(dashX, roadY + (heroHeight - roadY) / 2),
        Offset(dashX + 14, roadY + (heroHeight - roadY) / 2),
        laneDash,
      );
      dashX += 26;
    }

    // Soft glow behind where the car/person sit, evoking headlights at dusk.
    final glowCentre = Offset(size.width * 0.5, roadY - 80);
    final glow = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.22), Colors.white.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: glowCentre, radius: 90));
    canvas.drawCircle(glowCentre, 90, glow);
  }

  @override
  bool shouldRepaint(covariant _HeroPainter oldDelegate) =>
      oldDelegate.heroFraction != heroFraction;
}
