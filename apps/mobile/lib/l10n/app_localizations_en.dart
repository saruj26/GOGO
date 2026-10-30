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

  @override
  String get welcomeTagline => 'Your Ride, Your Way';

  @override
  String get welcomeHeadline => 'Move around your city easily';

  @override
  String get welcomeSubtitle =>
      'Safe, affordable and reliable rides whenever you need.';

  @override
  String get logIn => 'Log in';

  @override
  String get vehicleCar => 'Car';

  @override
  String get vehicleTukTuk => 'Tuk Tuk';

  @override
  String get vehicleBike => 'Bike';

  @override
  String get phoneEntryTitle => 'Enter your mobile number';

  @override
  String get phoneEntrySubtitle =>
      'We\'ll text you a code to verify it\'s you.';

  @override
  String get continueLabel => 'Continue';

  @override
  String get continueWithGoogle => 'Continue with Google';

  @override
  String get orDivider => 'or';

  @override
  String get phoneConsentNotice =>
      'By continuing, you agree to receive a verification code by SMS. Message and data rates may apply.';

  @override
  String get otpTitle => 'Enter the code';

  @override
  String otpSubtitle(String phone) {
    return 'We sent a code to $phone.';
  }

  @override
  String otpDevModeBanner(String code) {
    return 'No SMS gateway yet — dev mode code: $code';
  }

  @override
  String get resendCode => 'Resend code';

  @override
  String resendCodeIn(int seconds) {
    return 'Resend code in ${seconds}s';
  }

  @override
  String get changedNumber => 'Changed your number?';

  @override
  String get verifyLabel => 'Verify';

  @override
  String otpIncorrectWithAttempts(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count attempts left',
      one: '1 attempt left',
    );
    return 'That code is incorrect. $_temp0.';
  }

  @override
  String get otpTooManyAttempts =>
      'Too many incorrect attempts. Request a new code.';

  @override
  String get nameEntryTitle => 'What\'s your name?';

  @override
  String get nameEntrySubtitle => 'Let us know how to properly address you.';
}
