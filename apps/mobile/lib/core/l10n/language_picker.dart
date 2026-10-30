import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import 'locale_controller.dart';

/// Shows the language picker dialog and applies the choice.
///
/// Shared by every entry point that lets someone change language (the
/// welcome screen's compact selector, the account screen's settings row) so
/// there is exactly one picker UI and one place the choice gets persisted.
Future<void> showLanguagePicker(BuildContext context, WidgetRef ref) async {
  final l10n = AppLocalizations.of(context);
  final current = ref.read(localeControllerProvider);

  final options = [
    (null, l10n.languageSystem),
    (const Locale('en'), l10n.languageEnglish),
    (const Locale('ta'), l10n.languageTamil),
    (const Locale('si'), l10n.languageSinhala),
  ];

  // `null` distinguishes "dialog dismissed without a choice" from an
  // explicit pick of "System default", which also resolves to a null
  // locale — so the picked option is wrapped rather than returned bare.
  final picked = await showDialog<_LanguageChoice>(
    context: context,
    builder: (context) => SimpleDialog(
      title: Text(l10n.languageLabel),
      children: [
        RadioGroup<String>(
          groupValue: current?.languageCode ?? '',
          onChanged: (code) {
            final match = options.firstWhere(
              (o) => (o.$1?.languageCode ?? '') == code,
            );
            Navigator.pop(context, _LanguageChoice(match.$1));
          },
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final option in options)
                RadioListTile<String>(
                  value: option.$1?.languageCode ?? '',
                  title: Text(option.$2),
                ),
            ],
          ),
        ),
      ],
    ),
  );

  if (picked == null || picked.locale == current) return;
  await ref.read(localeControllerProvider.notifier).set(picked.locale);
}

/// The current language's short display label, for a compact selector
/// (e.g. "EN", "TA", "SI") — falls back to the system locale's code.
String currentLanguageCode(BuildContext context, WidgetRef ref) {
  final locale = ref.watch(localeControllerProvider) ?? Localizations.localeOf(context);
  return locale.languageCode.toUpperCase();
}

class _LanguageChoice {
  const _LanguageChoice(this.locale);

  final Locale? locale;
}
