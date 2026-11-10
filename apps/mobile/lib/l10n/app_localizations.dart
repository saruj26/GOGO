import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_si.dart';
import 'app_localizations_ta.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('si'),
    Locale('ta'),
  ];

  /// No description provided for @welcomeBack.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get welcomeBack;

  /// No description provided for @signInSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to book a ride, order food, or send a parcel.'**
  String get signInSubtitle;

  /// No description provided for @phoneNumberLabel.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get phoneNumberLabel;

  /// No description provided for @passwordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get passwordLabel;

  /// No description provided for @enterPhoneNumber.
  ///
  /// In en, this message translates to:
  /// **'Enter your phone number'**
  String get enterPhoneNumber;

  /// No description provided for @enterPassword.
  ///
  /// In en, this message translates to:
  /// **'Enter your password'**
  String get enterPassword;

  /// No description provided for @showPassword.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get showPassword;

  /// No description provided for @hidePassword.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get hidePassword;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signIn;

  /// No description provided for @newHere.
  ///
  /// In en, this message translates to:
  /// **'New here?'**
  String get newHere;

  /// No description provided for @createAnAccount.
  ///
  /// In en, this message translates to:
  /// **'Create an account'**
  String get createAnAccount;

  /// No description provided for @createAccount.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get createAccount;

  /// No description provided for @firstNameLabel.
  ///
  /// In en, this message translates to:
  /// **'First name'**
  String get firstNameLabel;

  /// No description provided for @lastNameOptionalLabel.
  ///
  /// In en, this message translates to:
  /// **'Last name (optional)'**
  String get lastNameOptionalLabel;

  /// No description provided for @enterFirstName.
  ///
  /// In en, this message translates to:
  /// **'Enter your first name'**
  String get enterFirstName;

  /// No description provided for @emailOptionalLabel.
  ///
  /// In en, this message translates to:
  /// **'Email (optional)'**
  String get emailOptionalLabel;

  /// No description provided for @useAtLeast8Characters.
  ///
  /// In en, this message translates to:
  /// **'Use at least 8 characters'**
  String get useAtLeast8Characters;

  /// No description provided for @genderOptionalLabel.
  ///
  /// In en, this message translates to:
  /// **'Gender (optional)'**
  String get genderOptionalLabel;

  /// No description provided for @genderHelp.
  ///
  /// In en, this message translates to:
  /// **'Only used for shared-ride safety preferences such as women-only rides.'**
  String get genderHelp;

  /// No description provided for @genderFemale.
  ///
  /// In en, this message translates to:
  /// **'Female'**
  String get genderFemale;

  /// No description provided for @genderMale.
  ///
  /// In en, this message translates to:
  /// **'Male'**
  String get genderMale;

  /// No description provided for @genderOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get genderOther;

  /// No description provided for @genderPreferNotToSay.
  ///
  /// In en, this message translates to:
  /// **'Prefer not to say'**
  String get genderPreferNotToSay;

  /// No description provided for @helloGeneric.
  ///
  /// In en, this message translates to:
  /// **'Hello'**
  String get helloGeneric;

  /// No description provided for @helloWithName.
  ///
  /// In en, this message translates to:
  /// **'Hello, {name}'**
  String helloWithName(String name);

  /// No description provided for @notifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notifications;

  /// No description provided for @whereTo.
  ///
  /// In en, this message translates to:
  /// **'Where to?'**
  String get whereTo;

  /// No description provided for @happeningNow.
  ///
  /// In en, this message translates to:
  /// **'Happening now'**
  String get happeningNow;

  /// No description provided for @serviceRide.
  ///
  /// In en, this message translates to:
  /// **'Ride'**
  String get serviceRide;

  /// No description provided for @serviceShareSave.
  ///
  /// In en, this message translates to:
  /// **'Share & save'**
  String get serviceShareSave;

  /// No description provided for @serviceFood.
  ///
  /// In en, this message translates to:
  /// **'Food'**
  String get serviceFood;

  /// No description provided for @serviceParcel.
  ///
  /// In en, this message translates to:
  /// **'Parcel'**
  String get serviceParcel;

  /// No description provided for @sharedBadge.
  ///
  /// In en, this message translates to:
  /// **'Shared'**
  String get sharedBadge;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navActivity.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get navActivity;

  /// No description provided for @navAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get navAccount;

  /// No description provided for @navDriving.
  ///
  /// In en, this message translates to:
  /// **'Driving'**
  String get navDriving;

  /// No description provided for @navRequests.
  ///
  /// In en, this message translates to:
  /// **'Requests'**
  String get navRequests;

  /// No description provided for @navDeliver.
  ///
  /// In en, this message translates to:
  /// **'Deliver'**
  String get navDeliver;

  /// No description provided for @navEarnings.
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get navEarnings;

  /// No description provided for @languageLabel.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageLabel;

  /// No description provided for @languageSystem.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get languageSystem;

  /// No description provided for @languageEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get languageEnglish;

  /// No description provided for @languageTamil.
  ///
  /// In en, this message translates to:
  /// **'Tamil'**
  String get languageTamil;

  /// No description provided for @languageSinhala.
  ///
  /// In en, this message translates to:
  /// **'Sinhala'**
  String get languageSinhala;

  /// No description provided for @welcomeTagline.
  ///
  /// In en, this message translates to:
  /// **'Your Ride, Your Way'**
  String get welcomeTagline;

  /// No description provided for @welcomeHeadline.
  ///
  /// In en, this message translates to:
  /// **'Move around your city easily'**
  String get welcomeHeadline;

  /// No description provided for @welcomeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Safe, affordable and reliable rides whenever you need.'**
  String get welcomeSubtitle;

  /// No description provided for @logIn.
  ///
  /// In en, this message translates to:
  /// **'Log in'**
  String get logIn;

  /// No description provided for @vehicleCar.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get vehicleCar;

  /// No description provided for @vehicleTukTuk.
  ///
  /// In en, this message translates to:
  /// **'Tuk Tuk'**
  String get vehicleTukTuk;

  /// No description provided for @vehicleBike.
  ///
  /// In en, this message translates to:
  /// **'Bike'**
  String get vehicleBike;

  /// No description provided for @phoneEntryTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your mobile number'**
  String get phoneEntryTitle;

  /// No description provided for @phoneEntrySubtitle.
  ///
  /// In en, this message translates to:
  /// **'We\'ll text you a code to verify it\'s you.'**
  String get phoneEntrySubtitle;

  /// No description provided for @continueLabel.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueLabel;

  /// No description provided for @continueWithGoogle.
  ///
  /// In en, this message translates to:
  /// **'Continue with Google'**
  String get continueWithGoogle;

  /// No description provided for @orDivider.
  ///
  /// In en, this message translates to:
  /// **'or'**
  String get orDivider;

  /// No description provided for @phoneConsentNotice.
  ///
  /// In en, this message translates to:
  /// **'By continuing, you agree to receive a verification code by SMS. Message and data rates may apply.'**
  String get phoneConsentNotice;

  /// No description provided for @otpTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter the code'**
  String get otpTitle;

  /// No description provided for @otpSubtitle.
  ///
  /// In en, this message translates to:
  /// **'We sent a code to {phone}.'**
  String otpSubtitle(String phone);

  /// No description provided for @otpDevModeBanner.
  ///
  /// In en, this message translates to:
  /// **'No SMS gateway yet — dev mode code: {code}'**
  String otpDevModeBanner(String code);

  /// No description provided for @resendCode.
  ///
  /// In en, this message translates to:
  /// **'Resend code'**
  String get resendCode;

  /// No description provided for @resendCodeIn.
  ///
  /// In en, this message translates to:
  /// **'Resend code in {seconds}s'**
  String resendCodeIn(int seconds);

  /// No description provided for @changedNumber.
  ///
  /// In en, this message translates to:
  /// **'Changed your number?'**
  String get changedNumber;

  /// No description provided for @verifyLabel.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get verifyLabel;

  /// No description provided for @otpIncorrectWithAttempts.
  ///
  /// In en, this message translates to:
  /// **'That code is incorrect. {count, plural, one {1 attempt left} other {{count} attempts left}}.'**
  String otpIncorrectWithAttempts(int count);

  /// No description provided for @otpTooManyAttempts.
  ///
  /// In en, this message translates to:
  /// **'Too many incorrect attempts. Request a new code.'**
  String get otpTooManyAttempts;

  /// No description provided for @nameEntryTitle.
  ///
  /// In en, this message translates to:
  /// **'What\'s your name?'**
  String get nameEntryTitle;

  /// No description provided for @nameEntrySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Let us know how to properly address you.'**
  String get nameEntrySubtitle;

  /// No description provided for @profileEditProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get profileEditProfile;

  /// No description provided for @profileStatRides.
  ///
  /// In en, this message translates to:
  /// **'Rides'**
  String get profileStatRides;

  /// No description provided for @profileStatFood.
  ///
  /// In en, this message translates to:
  /// **'Food'**
  String get profileStatFood;

  /// No description provided for @profileStatParcels.
  ///
  /// In en, this message translates to:
  /// **'Parcels'**
  String get profileStatParcels;

  /// No description provided for @profileWallet.
  ///
  /// In en, this message translates to:
  /// **'Wallet & payments'**
  String get profileWallet;

  /// No description provided for @profileWalletSubtitleEmpty.
  ///
  /// In en, this message translates to:
  /// **'Balance and payment history'**
  String get profileWalletSubtitleEmpty;

  /// No description provided for @profilePromotions.
  ///
  /// In en, this message translates to:
  /// **'Promotions'**
  String get profilePromotions;

  /// No description provided for @profileSavedPlaces.
  ///
  /// In en, this message translates to:
  /// **'Saved places'**
  String get profileSavedPlaces;

  /// No description provided for @profileSharedRideSafety.
  ///
  /// In en, this message translates to:
  /// **'Shared-ride safety'**
  String get profileSharedRideSafety;

  /// No description provided for @profileNotSet.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get profileNotSet;

  /// No description provided for @profileNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get profileNotifications;

  /// No description provided for @profileHelpSupport.
  ///
  /// In en, this message translates to:
  /// **'Help & support'**
  String get profileHelpSupport;

  /// No description provided for @profileSupportTickets.
  ///
  /// In en, this message translates to:
  /// **'Your support tickets'**
  String get profileSupportTickets;

  /// No description provided for @profileSwitchToDriving.
  ///
  /// In en, this message translates to:
  /// **'Switch to driving'**
  String get profileSwitchToDriving;

  /// No description provided for @profileSwitchToDrivingSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Go online and take rides and deliveries'**
  String get profileSwitchToDrivingSubtitle;

  /// No description provided for @profileSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get profileSignOut;

  /// No description provided for @profileSignOutConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign out?'**
  String get profileSignOutConfirmTitle;

  /// No description provided for @profileSignOutConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'You will need your phone number and password to sign back in.'**
  String get profileSignOutConfirmBody;

  /// No description provided for @profileStay.
  ///
  /// In en, this message translates to:
  /// **'Stay'**
  String get profileStay;

  /// No description provided for @inboxTitle.
  ///
  /// In en, this message translates to:
  /// **'Inbox'**
  String get inboxTitle;

  /// No description provided for @inboxTabAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get inboxTabAll;

  /// No description provided for @inboxTabOffers.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get inboxTabOffers;

  /// No description provided for @inboxTabSupport.
  ///
  /// In en, this message translates to:
  /// **'Support'**
  String get inboxTabSupport;

  /// No description provided for @inboxTabUpdates.
  ///
  /// In en, this message translates to:
  /// **'Updates'**
  String get inboxTabUpdates;

  /// No description provided for @inboxAddOfferCode.
  ///
  /// In en, this message translates to:
  /// **'Add new offer code'**
  String get inboxAddOfferCode;

  /// No description provided for @inboxOfferCodeDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter offer code'**
  String get inboxOfferCodeDialogTitle;

  /// No description provided for @inboxOfferCodeHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. WELCOME20'**
  String get inboxOfferCodeHint;

  /// No description provided for @inboxOfferCodeApply.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get inboxOfferCodeApply;

  /// No description provided for @inboxOfferCodeApplied.
  ///
  /// In en, this message translates to:
  /// **'Offer added to your account.'**
  String get inboxOfferCodeApplied;

  /// No description provided for @inboxSectionOffers.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get inboxSectionOffers;

  /// No description provided for @inboxSectionActivity.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get inboxSectionActivity;

  /// No description provided for @inboxEmptyAllTitle.
  ///
  /// In en, this message translates to:
  /// **'Nothing yet'**
  String get inboxEmptyAllTitle;

  /// No description provided for @inboxEmptyAllMessage.
  ///
  /// In en, this message translates to:
  /// **'Offers and updates about your rides, orders and parcels will appear here.'**
  String get inboxEmptyAllMessage;

  /// No description provided for @inboxEmptyOffersTitle.
  ///
  /// In en, this message translates to:
  /// **'No offers right now'**
  String get inboxEmptyOffersTitle;

  /// No description provided for @inboxEmptyOffersMessage.
  ///
  /// In en, this message translates to:
  /// **'When you have an offer available it will show up here.'**
  String get inboxEmptyOffersMessage;

  /// No description provided for @inboxEmptySupportTitle.
  ///
  /// In en, this message translates to:
  /// **'No support messages'**
  String get inboxEmptySupportTitle;

  /// No description provided for @inboxEmptySupportMessage.
  ///
  /// In en, this message translates to:
  /// **'Replies to your support tickets will appear here.'**
  String get inboxEmptySupportMessage;

  /// No description provided for @inboxEmptyUpdatesTitle.
  ///
  /// In en, this message translates to:
  /// **'No updates yet'**
  String get inboxEmptyUpdatesTitle;

  /// No description provided for @inboxEmptyUpdatesMessage.
  ///
  /// In en, this message translates to:
  /// **'Updates about your rides, orders and parcels will appear here.'**
  String get inboxEmptyUpdatesMessage;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get notificationsMarkAllRead;

  /// No description provided for @notificationsPushNotice.
  ///
  /// In en, this message translates to:
  /// **'Push notifications are not switched on yet, so these appear only when you open the app. Pull down to refresh.'**
  String get notificationsPushNotice;

  /// No description provided for @notificationsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Nothing yet'**
  String get notificationsEmptyTitle;

  /// No description provided for @notificationsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Updates about your rides, orders and parcels will appear here.'**
  String get notificationsEmptyMessage;

  /// No description provided for @promotionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Promotions'**
  String get promotionsTitle;

  /// No description provided for @promotionsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No promotions right now'**
  String get promotionsEmptyTitle;

  /// No description provided for @promotionsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'When you have an offer available it will show up here.'**
  String get promotionsEmptyMessage;

  /// No description provided for @promotionsCodeCopied.
  ///
  /// In en, this message translates to:
  /// **'{code} copied'**
  String promotionsCodeCopied(String code);

  /// No description provided for @promotionsPercentOff.
  ///
  /// In en, this message translates to:
  /// **'{value}% off'**
  String promotionsPercentOff(String value);

  /// No description provided for @promotionsAmountOff.
  ///
  /// In en, this message translates to:
  /// **'{amount} off'**
  String promotionsAmountOff(String amount);

  /// No description provided for @promotionsMinSpend.
  ///
  /// In en, this message translates to:
  /// **'Minimum spend {amount}'**
  String promotionsMinSpend(String amount);

  /// No description provided for @promotionsUpTo.
  ///
  /// In en, this message translates to:
  /// **'Up to {amount} off'**
  String promotionsUpTo(String amount);

  /// No description provided for @promotionsForServices.
  ///
  /// In en, this message translates to:
  /// **'For {services}'**
  String promotionsForServices(String services);

  /// No description provided for @promotionsExpires.
  ///
  /// In en, this message translates to:
  /// **'Expires {date}'**
  String promotionsExpires(String date);

  /// No description provided for @promotionsUsesLeft.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one {1 use left} other {{count} uses left}}'**
  String promotionsUsesLeft(int count);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'si', 'ta'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'si':
      return AppLocalizationsSi();
    case 'ta':
      return AppLocalizationsTa();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
