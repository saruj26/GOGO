import '../../../models/auth.dart';
import '../api_client.dart';

class AuthApi {
  const AuthApi(this._client);

  final ApiClient _client;

  Future<AuthTokens> login({required String phone, required String password}) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/login',
      body: {'phone': phone, 'password': password},
      anonymous: true,
    );
    return AuthTokens.fromJson(data);
  }

  Future<AuthTokens> register({
    required String phone,
    required String password,
    required String firstName,
    String? lastName,
    String? email,
    String? gender,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/register',
      body: {
        'phone': phone,
        'password': password,
        'firstName': firstName,
        if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
        if (email != null && email.isNotEmpty) 'email': email,
        if (gender != null && gender.isNotEmpty) 'gender': gender,
      },
      anonymous: true,
    );
    return AuthTokens.fromJson(data);
  }

  /// Starts phone verification. No SMS gateway is configured yet, so
  /// [OtpRequestResult.devCode] carries the code directly in development —
  /// `null` once a real gateway exists and dev mode is switched off.
  Future<OtpRequestResult> requestOtp(String phone) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/otp/request',
      body: {'phone': phone},
      anonymous: true,
    );
    return OtpRequestResult.fromJson(data);
  }

  /// A wrong code is an ordinary, retryable outcome, not a thrown error —
  /// see [OtpVerifyResult].
  Future<OtpVerifyResult> verifyOtp({
    required String phone,
    required String code,
    required String otpTicket,
    String? priorSignupTicket,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      body: {
        'phone': phone,
        'code': code,
        'otpTicket': otpTicket,
        'signupTicket': ?priorSignupTicket,
      },
      anonymous: true,
    );
    return OtpVerifyResult.fromJson(data);
  }

  /// Finishes creating the account a signup ticket was verified for.
  Future<AuthTokens> completeSignup({
    required String signupTicket,
    required String firstName,
    String? lastName,
    String? gender,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/register/complete',
      body: {
        'signupTicket': signupTicket,
        'firstName': firstName,
        if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
        if (gender != null && gender.isNotEmpty) 'gender': gender,
      },
      anonymous: true,
    );
    return AuthTokens.fromJson(data);
  }

  /// Verifies a Google ID token server-side. An existing account signs
  /// straight in; a new identity still needs a verified phone — see
  /// [GoogleSignInResult].
  Future<GoogleSignInResult> googleSignIn(String idToken) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/google',
      body: {'idToken': idToken},
      anonymous: true,
    );
    return GoogleSignInResult.fromJson(data);
  }

  Future<Me> me() async {
    final data = await _client.get<Map<String, dynamic>>('/auth/me');
    return Me.fromJson(data);
  }

  /// Tells the backend to revoke the refresh token. Best-effort: the local
  /// session is cleared regardless, so a sign-out never leaves the user stuck
  /// on a screen because the network was down.
  Future<void> logout(String? refreshToken) =>
      _client.post<void>('/auth/logout', body: {'refreshToken': refreshToken});

  /// Updates the profile fields a person owns.
  ///
  /// Phone is absent on purpose: it is the login identifier and the backend
  /// will not change it without verification, so offering it here would be a
  /// field that always fails.
  Future<Me> updateProfile({
    String? firstName,
    String? lastName,
    String? email,
    String? gender,
    String? avatarUrl,
  }) async {
    final data = await _client.put<Map<String, dynamic>>(
      '/auth/me',
      body: {
        'firstName': ?firstName,
        'lastName': ?lastName,
        'email': ?email,
        'gender': ?gender,
        'avatarUrl': ?avatarUrl,
      },
    );
    return Me.fromJson(data);
  }

  Future<SafetyPreferences> updateSafetyPreferences({
    bool? allowSharedRides,
    GenderPreference? genderPreference,
    int? maxCoPassengers,
    int? maxDetourMinutes,
    bool? allowFrontSeat,
    bool? shareContactWithCoPax,
  }) async {
    final data = await _client.put<Map<String, dynamic>>(
      '/auth/me/safety-preferences',
      body: {
        'allowSharedRides': ?allowSharedRides,
        if (genderPreference != null) 'genderPreference': genderPreference.wire,
        'maxCoPassengers': ?maxCoPassengers,
        'maxDetourMinutes': ?maxDetourMinutes,
        'allowFrontSeat': ?allowFrontSeat,
        'shareContactWithCoPax': ?shareContactWithCoPax,
      },
    );
    return SafetyPreferences.fromJson(data);
  }
}
