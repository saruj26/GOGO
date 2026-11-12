// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Tamil (`ta`).
class AppLocalizationsTa extends AppLocalizations {
  AppLocalizationsTa([String locale = 'ta']) : super(locale);

  @override
  String get welcomeBack => 'மீண்டும் வரவேற்கிறோம்';

  @override
  String get signInSubtitle =>
      'சவாரி பதிவு செய்ய, உணவு ஆர்டர் செய்ய அல்லது பார்சல் அனுப்ப உள்நுழையவும்.';

  @override
  String get phoneNumberLabel => 'தொலைபேசி எண்';

  @override
  String get passwordLabel => 'கடவுச்சொல்';

  @override
  String get enterPhoneNumber => 'உங்கள் தொலைபேசி எண்ணை உள்ளிடவும்';

  @override
  String get enterPassword => 'உங்கள் கடவுச்சொல்லை உள்ளிடவும்';

  @override
  String get showPassword => 'கடவுச்சொல்லைக் காட்டு';

  @override
  String get hidePassword => 'கடவுச்சொல்லை மறை';

  @override
  String get signIn => 'உள்நுழைக';

  @override
  String get newHere => 'புதியவரா?';

  @override
  String get createAnAccount => 'கணக்கை உருவாக்கவும்';

  @override
  String get createAccount => 'கணக்கை உருவாக்கு';

  @override
  String get firstNameLabel => 'முதல் பெயர்';

  @override
  String get lastNameOptionalLabel => 'கடைசி பெயர் (விருப்பத்தேர்வு)';

  @override
  String get enterFirstName => 'உங்கள் முதல் பெயரை உள்ளிடவும்';

  @override
  String get emailOptionalLabel => 'மின்னஞ்சல் (விருப்பத்தேர்வு)';

  @override
  String get useAtLeast8Characters =>
      'குறைந்தது 8 எழுத்துக்களைப் பயன்படுத்தவும்';

  @override
  String get genderOptionalLabel => 'பாலினம் (விருப்பத்தேர்வு)';

  @override
  String get genderHelp =>
      'பகிரப்பட்ட சவாரி பாதுகாப்பு விருப்பங்களுக்கு மட்டுமே பயன்படுத்தப்படுகிறது, எடுத்துக்காட்டாக பெண்களுக்கு மட்டுமான சவாரிகள்.';

  @override
  String get genderFemale => 'பெண்';

  @override
  String get genderMale => 'ஆண்';

  @override
  String get genderOther => 'மற்றவை';

  @override
  String get genderPreferNotToSay => 'சொல்ல விரும்பவில்லை';

  @override
  String get helloGeneric => 'வணக்கம்';

  @override
  String helloWithName(String name) {
    return 'வணக்கம், $name';
  }

  @override
  String get notifications => 'அறிவிப்புகள்';

  @override
  String get whereTo => 'எங்கே செல்ல வேண்டும்?';

  @override
  String get happeningNow => 'இப்போது நடக்கிறது';

  @override
  String get serviceRide => 'சவாரி';

  @override
  String get serviceShareSave => 'பகிர்ந்து சேமிக்க';

  @override
  String get serviceFood => 'உணவு';

  @override
  String get serviceParcel => 'பார்சல்';

  @override
  String get sharedBadge => 'பகிரப்பட்டது';

  @override
  String get navHome => 'முகப்பு';

  @override
  String get navActivity => 'செயல்பாடு';

  @override
  String get navAccount => 'கணக்கு';

  @override
  String get navDriving => 'ஓட்டுதல்';

  @override
  String get navRequests => 'கோரிக்கைகள்';

  @override
  String get navDeliver => 'விநியோகி';

  @override
  String get navEarnings => 'வருமானம்';

  @override
  String get languageLabel => 'மொழி';

  @override
  String get languageSystem => 'சாதன மொழி';

  @override
  String get languageEnglish => 'ஆங்கிலம்';

  @override
  String get languageTamil => 'தமிழ்';

  @override
  String get languageSinhala => 'சிங்களம்';

  @override
  String get welcomeTagline => 'உங்கள் பயணம், உங்கள் வழியில்';

  @override
  String get welcomeHeadline => 'உங்கள் நகரத்தில் எளிதாக பயணியுங்கள்';

  @override
  String get welcomeSubtitle =>
      'பாதுகாப்பான, மலிவான மற்றும் நம்பகமான சவாரிகள் எப்போது வேண்டுமானாலும்.';

  @override
  String get logIn => 'உள்நுழைக';

  @override
  String get vehicleCar => 'கார்';

  @override
  String get vehicleTukTuk => 'டுக் டுக்';

  @override
  String get vehicleBike => 'பைக்';

  @override
  String get phoneEntryTitle => 'உங்கள் மொபைல் எண்ணை உள்ளிடவும்';

  @override
  String get phoneEntrySubtitle =>
      'நீங்கள்தான் என உறுதிசெய்ய ஒரு குறியீட்டை SMS செய்வோம்.';

  @override
  String get continueLabel => 'தொடரவும்';

  @override
  String get continueWithGoogle => 'Google மூலம் தொடரவும்';

  @override
  String get orDivider => 'அல்லது';

  @override
  String get phoneConsentNotice =>
      'தொடர்வதன் மூலம், SMS வழியாக சரிபார்ப்புக் குறியீட்டைப் பெற ஒப்புக்கொள்கிறீர்கள். செய்தி மற்றும் டேட்டா கட்டணங்கள் பொருந்தலாம்.';

  @override
  String get otpTitle => 'குறியீட்டை உள்ளிடவும்';

  @override
  String otpSubtitle(String phone) {
    return '$phone க்கு ஒரு குறியீட்டை அனுப்பியுள்ளோம்.';
  }

  @override
  String otpDevModeBanner(String code) {
    return 'SMS gateway இன்னும் இல்லை — dev mode குறியீடு: $code';
  }

  @override
  String get resendCode => 'குறியீட்டை மீண்டும் அனுப்பு';

  @override
  String resendCodeIn(int seconds) {
    return '$seconds வினாடிகளில் மீண்டும் அனுப்பலாம்';
  }

  @override
  String get changedNumber => 'எண்ணை மாற்றிவிட்டீர்களா?';

  @override
  String get verifyLabel => 'சரிபார்க்க';

  @override
  String otpIncorrectWithAttempts(int count) {
    return 'அந்தக் குறியீடு தவறானது. $count முயற்சிகள் மீதமுள்ளன.';
  }

  @override
  String get otpTooManyAttempts =>
      'பல தவறான முயற்சிகள். புதிய குறியீட்டைக் கோரவும்.';

  @override
  String get nameEntryTitle => 'உங்கள் பெயர் என்ன?';

  @override
  String get nameEntrySubtitle =>
      'உங்களை முறையாக அழைக்க எங்களுக்குத் தெரியப்படுத்துங்கள்.';

  @override
  String get profileEditProfile => 'சுயவிவரத்தைத் திருத்து';

  @override
  String get profileStatRides => 'சவாரிகள்';

  @override
  String get profileStatFood => 'உணவு';

  @override
  String get profileStatParcels => 'பார்சல்கள்';

  @override
  String get profileWallet => 'பணப்பை மற்றும் கட்டணங்கள்';

  @override
  String get profileWalletSubtitleEmpty => 'இருப்பு மற்றும் கட்டண வரலாறு';

  @override
  String get profilePromotions => 'சலுகைகள்';

  @override
  String get profileSavedPlaces => 'சேமித்த இடங்கள்';

  @override
  String get profileSharedRideSafety => 'பகிர்வு சவாரி பாதுகாப்பு';

  @override
  String get profileNotSet => 'அமைக்கப்படவில்லை';

  @override
  String get profileNotifications => 'அறிவிப்புகள்';

  @override
  String get profileHelpSupport => 'உதவி மற்றும் ஆதரவு';

  @override
  String get profileSupportTickets => 'உங்கள் ஆதரவு டிக்கெட்டுகள்';

  @override
  String get profileSignOut => 'வெளியேறு';

  @override
  String get profileSignOutConfirmTitle => 'வெளியேற வேண்டுமா?';

  @override
  String get profileSignOutConfirmBody =>
      'மீண்டும் உள்நுழைய உங்கள் தொலைபேசி எண் மற்றும் கடவுச்சொல் தேவைப்படும்.';

  @override
  String get profileStay => 'இருக்கவும்';

  @override
  String get driverAccountTitle => 'கணக்கு';

  @override
  String get driverAccountVehicle => 'வாகனம்';

  @override
  String get driverAccountNoVehicle => 'வாகன விவரம் இல்லை';

  @override
  String get driverNotAuthorizedTitle => 'இது ஓட்டுநர் கணக்கு அல்ல';

  @override
  String get driverNotAuthorizedMessage =>
      'இந்தக் கணக்கு ஓட்டுநராகப் பதிவு செய்யப்படவில்லை. Tugo வாடிக்கையாளர் ஆப்பில் ஓட்டுநராக விண்ணப்பிக்கவும், அல்லது ஓட்டுநர் கணக்கில் உள்நுழையவும்.';

  @override
  String get inboxTitle => 'இன்பாக்ஸ்';

  @override
  String get inboxTabAll => 'அனைத்தும்';

  @override
  String get inboxTabOffers => 'சலுகைகள்';

  @override
  String get inboxTabSupport => 'ஆதரவு';

  @override
  String get inboxTabUpdates => 'புதுப்பிப்புகள்';

  @override
  String get inboxAddOfferCode => 'புதிய சலுகைக் குறியீட்டைச் சேர்';

  @override
  String get inboxOfferCodeDialogTitle => 'சலுகைக் குறியீட்டை உள்ளிடவும்';

  @override
  String get inboxOfferCodeHint => 'உதா. WELCOME20';

  @override
  String get inboxOfferCodeApply => 'செயல்படுத்து';

  @override
  String get inboxOfferCodeApplied => 'சலுகை உங்கள் கணக்கில் சேர்க்கப்பட்டது.';

  @override
  String get inboxSectionOffers => 'சலுகைகள்';

  @override
  String get inboxSectionActivity => 'செயல்பாடு';

  @override
  String get inboxEmptyAllTitle => 'இதுவரை ஏதுமில்லை';

  @override
  String get inboxEmptyAllMessage =>
      'உங்கள் சவாரிகள், ஆர்டர்கள் மற்றும் பார்சல்கள் பற்றிய சலுகைகள் மற்றும் புதுப்பிப்புகள் இங்கே தோன்றும்.';

  @override
  String get inboxEmptyOffersTitle => 'இப்போது சலுகைகள் இல்லை';

  @override
  String get inboxEmptyOffersMessage =>
      'ஒரு சலுகை கிடைக்கும்போது அது இங்கே தோன்றும்.';

  @override
  String get inboxEmptySupportTitle => 'ஆதரவு செய்திகள் இல்லை';

  @override
  String get inboxEmptySupportMessage =>
      'உங்கள் ஆதரவு டிக்கெட்டுகளுக்கான பதில்கள் இங்கே தோன்றும்.';

  @override
  String get inboxEmptyUpdatesTitle => 'புதுப்பிப்புகள் இல்லை';

  @override
  String get inboxEmptyUpdatesMessage =>
      'உங்கள் சவாரிகள், ஆர்டர்கள் மற்றும் பார்சல்கள் பற்றிய புதுப்பிப்புகள் இங்கே தோன்றும்.';

  @override
  String get notificationsTitle => 'அறிவிப்புகள்';

  @override
  String get notificationsMarkAllRead => 'அனைத்தையும் படித்ததாகக் குறி';

  @override
  String get notificationsPushNotice =>
      'புஷ் அறிவிப்புகள் இன்னும் இயக்கப்படவில்லை, எனவே நீங்கள் ஆப்ஸைத் திறக்கும்போது மட்டுமே இவை தோன்றும். புதுப்பிக்க கீழே இழுக்கவும்.';

  @override
  String get notificationsEmptyTitle => 'இதுவரை ஏதுமில்லை';

  @override
  String get notificationsEmptyMessage =>
      'உங்கள் சவாரிகள், ஆர்டர்கள் மற்றும் பார்சல்கள் பற்றிய புதுப்பிப்புகள் இங்கே தோன்றும்.';

  @override
  String get promotionsTitle => 'சலுகைகள்';

  @override
  String get promotionsEmptyTitle => 'இப்போது சலுகைகள் இல்லை';

  @override
  String get promotionsEmptyMessage =>
      'ஒரு சலுகை கிடைக்கும்போது அது இங்கே தோன்றும்.';

  @override
  String promotionsCodeCopied(String code) {
    return '$code நகலெடுக்கப்பட்டது';
  }

  @override
  String promotionsPercentOff(String value) {
    return '$value% தள்ளுபடி';
  }

  @override
  String promotionsAmountOff(String amount) {
    return '$amount தள்ளுபடி';
  }

  @override
  String promotionsMinSpend(String amount) {
    return 'குறைந்தபட்ச செலவு $amount';
  }

  @override
  String promotionsUpTo(String amount) {
    return '$amount வரை தள்ளுபடி';
  }

  @override
  String promotionsForServices(String services) {
    return '$services சேவைகளுக்கு';
  }

  @override
  String promotionsExpires(String date) {
    return '$date அன்று காலாவதியாகும்';
  }

  @override
  String promotionsUsesLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count முறைகள் மீதம்',
      one: '1 முறை மீதம்',
    );
    return '$_temp0';
  }
}
