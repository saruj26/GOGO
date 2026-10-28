// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get welcomeBack => 'Welcome back';

  @override
  String get signInSubtitle =>
      'Sign in to book a ride, order food, or send a parcel.';

  @override
  String get phoneNumberLabel => 'Phone number';

  @override
  String get passwordLabel => 'Password';

  @override
  String get enterPhoneNumber => 'Enter your phone number';

  @override
  String get enterPassword => 'Enter your password';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get signIn => 'Sign in';

  @override
  String get newHere => 'New here?';

  @override
  String get createAnAccount => 'Create an account';

  @override
  String get createAccount => 'Create account';

  @override
  String get firstNameLabel => 'First name';

  @override
  String get lastNameOptionalLabel => 'Last name (optional)';

  @override
  String get enterFirstName => 'Enter your first name';

  @override
  String get emailOptionalLabel => 'Email (optional)';

  @override
  String get useAtLeast8Characters => 'Use at least 8 characters';

  @override
  String get genderOptionalLabel => 'Gender (optional)';

  @override
  String get genderHelp =>
      'Only used for shared-ride safety preferences such as women-only rides.';

  @override
  String get genderFemale => 'Female';

  @override
  String get genderMale => 'Male';

  @override
  String get genderOther => 'Other';

  @override
  String get genderPreferNotToSay => 'Prefer not to say';

  @override
  String get helloGeneric => 'Hello';

  @override
  String helloWithName(String name) {
    return 'Hello, $name';
  }

  @override
  String get notifications => 'Notifications';

  @override
  String get whereTo => 'Where to?';

  @override
  String get happeningNow => 'Happening now';

  @override
  String get serviceRide => 'Ride';

  @override
  String get serviceShareSave => 'Share & save';

  @override
  String get serviceFood => 'Food';

  @override
  String get serviceParcel => 'Parcel';

  @override
  String get sharedBadge => 'Shared';

  @override
  String get navHome => 'Home';

  @override
  String get navActivity => 'Activity';

  @override
  String get navAccount => 'Account';

  @override
  String get navDriving => 'Driving';

  @override
  String get navRequests => 'Requests';

  @override
  String get navDeliver => 'Deliver';

  @override
  String get navEarnings => 'Earnings';

  @override
  String get languageLabel => 'Language';

  @override
  String get languageSystem => 'System default';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageTamil => 'Tamil';

  @override
  String get languageSinhala => 'Sinhala';
}
