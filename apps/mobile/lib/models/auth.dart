import 'common.dart';

class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken, this.expiresIn});

  final String accessToken;
  final String refreshToken;
  final int? expiresIn;

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresIn: toIntOrNull(json['expiresIn']),
      );
}

/// The shared-ride safety preference values the backend accepts.
///
/// This list mirrors the server enum exactly. Adding an option here that the
/// API does not know would produce a booking the matching engine rejects.
enum GenderPreference {
  any('ANY', 'Any gender', 'Share with anyone travelling your way.'),
  sameGenderOnly('SAME_GENDER_ONLY', 'Same gender only',
      'Only share with passengers of the same gender as you.'),
  womenOnly('WOMEN_ONLY', 'Women only', 'Only share with women.'),
  menOnly('MEN_ONLY', 'Men only', 'Only share with men.');

  const GenderPreference(this.wire, this.label, this.description);

  final String wire;
  final String label;
  final String description;

  static GenderPreference from(dynamic value) => GenderPreference.values.firstWhere(
        (option) => option.wire == value,
        orElse: () => GenderPreference.any,
      );
}

class SafetyPreferences {
  const SafetyPreferences({
    required this.allowSharedRides,
    required this.genderPreference,
    this.maxCoPassengers,
    this.maxDetourMinutes,
    this.allowFrontSeat = true,
    this.shareContactWithCoPax = false,
  });

  final bool allowSharedRides;
  final GenderPreference genderPreference;
  final int? maxCoPassengers;
  final int? maxDetourMinutes;
  final bool allowFrontSeat;
  final bool shareContactWithCoPax;

  factory SafetyPreferences.fromJson(Map<String, dynamic> json) => SafetyPreferences(
        allowSharedRides: json['allowSharedRides'] != false,
        genderPreference: GenderPreference.from(json['genderPreference']),
        maxCoPassengers: toIntOrNull(json['maxCoPassengers']),
        maxDetourMinutes: toIntOrNull(json['maxDetourMinutes']),
        allowFrontSeat: json['allowFrontSeat'] != false,
        shareContactWithCoPax: json['shareContactWithCoPax'] == true,
      );

  SafetyPreferences copyWith({
    bool? allowSharedRides,
    GenderPreference? genderPreference,
    int? maxCoPassengers,
    int? maxDetourMinutes,
    bool? allowFrontSeat,
    bool? shareContactWithCoPax,
  }) =>
      SafetyPreferences(
        allowSharedRides: allowSharedRides ?? this.allowSharedRides,
        genderPreference: genderPreference ?? this.genderPreference,
        maxCoPassengers: maxCoPassengers ?? this.maxCoPassengers,
        maxDetourMinutes: maxDetourMinutes ?? this.maxDetourMinutes,
        allowFrontSeat: allowFrontSeat ?? this.allowFrontSeat,
        shareContactWithCoPax: shareContactWithCoPax ?? this.shareContactWithCoPax,
      );
}

class Wallet {
  const Wallet({required this.balance, required this.currency});

  final String balance;
  final String currency;

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
        balance: asMoney(json['balance']),
        currency: (json['currency'] ?? 'LKR') as String,
      );
}

class Me {
  const Me({
    required this.id,
    required this.phone,
    required this.firstName,
    this.lastName,
    this.email,
    this.gender = 'UNDISCLOSED',
    this.avatarUrl,
    this.roles = const [],
    this.driverId,
    this.sharedRidePrefs,
    this.wallet,
  });

  final String id;
  final String phone;
  final String firstName;
  final String? lastName;
  final String? email;
  final String gender;
  final String? avatarUrl;
  final List<String> roles;

  /// Present only when this account is also a driver. The mobile app decides
  /// which shell to show from this, but the backend re-checks the role on every
  /// driver endpoint — this is navigation, not authorisation.
  final String? driverId;

  final SafetyPreferences? sharedRidePrefs;
  final Wallet? wallet;

  bool get isDriver => driverId != null && roles.contains('DRIVER');

  String get displayName =>
      [firstName, if (lastName != null && lastName!.isNotEmpty) lastName].join(' ');

  String get initials {
    final first = firstName.isNotEmpty ? firstName[0] : '';
    final last = (lastName != null && lastName!.isNotEmpty) ? lastName![0] : '';
    final combined = '$first$last'.trim();
    return combined.isEmpty ? '?' : combined.toUpperCase();
  }

  factory Me.fromJson(Map<String, dynamic> json) => Me(
        id: json['id'] as String,
        phone: (json['phone'] ?? '') as String,
        firstName: (json['firstName'] ?? '') as String,
        lastName: json['lastName'] as String?,
        email: json['email'] as String?,
        gender: asEnum(json['gender'], 'UNDISCLOSED'),
        avatarUrl: json['avatarUrl'] as String?,
        roles: (json['roles'] as List?)?.whereType<String>().toList(growable: false) ?? const [],
        driverId: json['driverId'] as String?,
        sharedRidePrefs: json['sharedRidePrefs'] is Map<String, dynamic>
            ? SafetyPreferences.fromJson(json['sharedRidePrefs'] as Map<String, dynamic>)
            : null,
        wallet: json['wallet'] is Map<String, dynamic>
            ? Wallet.fromJson(json['wallet'] as Map<String, dynamic>)
            : null,
      );
}
