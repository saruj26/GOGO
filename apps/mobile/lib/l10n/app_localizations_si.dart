// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Sinhala Sinhalese (`si`).
class AppLocalizationsSi extends AppLocalizations {
  AppLocalizationsSi([String locale = 'si']) : super(locale);

  @override
  String get welcomeBack => 'ආයුබෝවන්, නැවත පිළිගනිමු';

  @override
  String get signInSubtitle =>
      'රථයක් වෙන් කරගැනීමට, ආහාර ඇණවුම් කිරීමට හෝ පාර්සලයක් යැවීමට පුරන්න.';

  @override
  String get phoneNumberLabel => 'දුරකථන අංකය';

  @override
  String get passwordLabel => 'මුරපදය';

  @override
  String get enterPhoneNumber => 'ඔබේ දුරකථන අංකය ඇතුළත් කරන්න';

  @override
  String get enterPassword => 'ඔබේ මුරපදය ඇතුළත් කරන්න';

  @override
  String get showPassword => 'මුරපදය පෙන්වන්න';

  @override
  String get hidePassword => 'මුරපදය සඟවන්න';

  @override
  String get signIn => 'පුරන්න';

  @override
  String get newHere => 'අලුත්ද?';

  @override
  String get createAnAccount => 'ගිණුමක් සාදන්න';

  @override
  String get createAccount => 'ගිණුම සාදන්න';

  @override
  String get firstNameLabel => 'මුල් නම';

  @override
  String get lastNameOptionalLabel => 'අවසන් නම (විකල්පයි)';

  @override
  String get enterFirstName => 'ඔබේ මුල් නම ඇතුළත් කරන්න';

  @override
  String get emailOptionalLabel => 'විද්‍යුත් තැපෑල (විකල්පයි)';

  @override
  String get useAtLeast8Characters => 'අවම වශයෙන් අක්ෂර 8ක් භාවිත කරන්න';

  @override
  String get genderOptionalLabel => 'ස්ත්‍රී පුරුෂ භාවය (විකල්පයි)';

  @override
  String get genderHelp =>
      'බෙදාගත් ගමන්වල ආරක්ෂිත අභිප්‍රේත සඳහා පමණක් භාවිතා වේ, උදා. කාන්තාවන්ට පමණක් වූ ගමන්.';

  @override
  String get genderFemale => 'ගැහැණු';

  @override
  String get genderMale => 'පිරිමි';

  @override
  String get genderOther => 'වෙනත්';

  @override
  String get genderPreferNotToSay => 'පැවසීමට අකමැතියි';

  @override
  String get helloGeneric => 'ආයුබෝවන්';

  @override
  String helloWithName(String name) {
    return 'ආයුබෝවන්, $name';
  }

  @override
  String get notifications => 'දැනුම්දීම්';

  @override
  String get whereTo => 'කොහෙද යන්නේ?';

  @override
  String get happeningNow => 'දැන් සිදුවෙමින්';

  @override
  String get serviceRide => 'ගමන';

  @override
  String get serviceShareSave => 'බෙදාගෙන ඉතිරි කරන්න';

  @override
  String get serviceFood => 'ආහාර';

  @override
  String get serviceParcel => 'පාර්සලය';

  @override
  String get sharedBadge => 'බෙදාගත්';

  @override
  String get navHome => 'මුල් පිටුව';

  @override
  String get navActivity => 'ක්‍රියාකාරකම්';

  @override
  String get navAccount => 'ගිණුම';

  @override
  String get navDriving => 'රිය පැදවීම';

  @override
  String get navRequests => 'ඉල්ලීම්';

  @override
  String get navDeliver => 'බෙදාහරින්න';

  @override
  String get navEarnings => 'ඉපයීම්';

  @override
  String get languageLabel => 'භාෂාව';

  @override
  String get languageSystem => 'උපාංග භාෂාව';

  @override
  String get languageEnglish => 'ඉංග්‍රීසි';

  @override
  String get languageTamil => 'දෙමළ';

  @override
  String get languageSinhala => 'සිංහල';
}
