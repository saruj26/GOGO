/// Build-time configuration.
///
/// Everything here ships inside the installed bundle and must therefore be
/// public information only. Database URLs, JWT signing secrets, payment private
/// keys and map provider private keys stay on the server; the application only
/// ever learns the address of the API that holds them.
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.tileUrlTemplate,
    required this.tileAttribution,
    required this.supportPhone,
    required this.supportEmail,
    required this.connectTimeout,
    required this.receiveTimeout,
  });

  final String apiBaseUrl;
  final String tileUrlTemplate;
  final String tileAttribution;
  final String supportPhone;
  final String supportEmail;
  final Duration connectTimeout;
  final Duration receiveTimeout;

  /// Reads `--dart-define` values, falling back to the local API so a checkout
  /// runs without a build script.
  factory AppConfig.fromEnvironment() {
    return AppConfig(
      apiBaseUrl: const String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://10.0.2.2:4000/api/v1',
      ),
      // OpenStreetMap raster tiles: the same keyless source the web client
      // uses. Swapping to a commercial provider is a template change plus a
      // key held by that provider's own SDK, not a code change here.
      tileUrlTemplate: const String.fromEnvironment(
        'MAP_TILE_URL',
        defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ),
      tileAttribution: const String.fromEnvironment(
        'MAP_ATTRIBUTION',
        defaultValue: '© OpenStreetMap contributors',
      ),
      supportPhone: const String.fromEnvironment(
        'SUPPORT_PHONE',
        defaultValue: '+94 11 234 5678',
      ),
      supportEmail: const String.fromEnvironment(
        'SUPPORT_EMAIL',
        defaultValue: 'support@tugo.lk',
      ),
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
    );
  }
}
