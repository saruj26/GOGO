# RideFlow mobile

The Flutter application for **customers** and **drivers**. It consumes the same
backend as the customer web app and the admin console — no business logic is
reimplemented here.

Android is the first target. Nothing in the code is Android-specific: platform
concerns sit behind interfaces (`core/location`, `core/storage`,
`core/notifications`, `core/maps`), so adding iOS is a `flutter create
--platforms=ios .` plus a keychain review, not a rewrite.

## What the backend decides, not this app

The application never computes any of the following. It asks, and it renders
the answer:

| Decision | Where it is made |
| --- | --- |
| Whether two journeys can be shared | `POST /rides/shared/search` |
| Route overlap, direction, stop order, detour ceilings | matching engine |
| Fares, shared pricing, savings, discounts | pricing service |
| Seat availability | row lock on the ride, at join time |
| Safety / gender constraints | matching engine, as a hard constraint |
| Driver earnings and commission | fare quote, per passenger |
| Every state transition | the service that owns it |

The one thing the app decides is which of those to ask for.

## Layout

```
lib/
  core/
    config/         build-time configuration; public values only
    networking/     the API client and the typed endpoint surface
    auth/           the session, and the only writer of tokens
    errors/         one failure type the whole app switches on
    routing/        routes and the role-aware redirect
    storage/        tokens, in the platform keystore
    location/       device positioning behind an interface
    maps/           tiles, markers, route geometry
    realtime/       how the app learns something changed (polling, today)
    notifications/  delivery transport (absent, today)
    widgets/        design system
    theme/  format/
  features/
    auth  home  rides  shared_rides  tracking  food  parcels
    payments  promotions  profile  history  ratings  support  notifications
    driver/  home  requests  current_ride  deliveries  earnings  history
  models/           the response contract, hand-written to mirror the API
```

State is Riverpod, scoped per feature. Money is carried as the decimal string
the backend produced and is never parsed into a `double`.

## Running it

```bash
flutter pub get

# The emulator reaches the host machine on 10.0.2.2, which is the default.
flutter run

# Against a different backend:
flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

### Build-time configuration

All of it is public and safe to ship. No database URL, signing secret, payment
key or private map key exists in this application.

| Define | Default |
| --- | --- |
| `API_BASE_URL` | `http://10.0.2.2:3000/api/v1` |
| `MAP_TILE_URL` | OpenStreetMap raster tiles |
| `MAP_ATTRIBUTION` | `© OpenStreetMap contributors` |
| `SUPPORT_PHONE`, `SUPPORT_EMAIL` | placeholders |

## Verifying

```bash
flutter analyze
flutter test
flutter build apk --release
```

## Known limitations

These are real gaps in the platform, not gaps in this app, and the application
states each of them where a person would otherwise wonder:

- **No realtime transport.** Tracking screens poll behind `LiveUpdates`. A
  socket becomes a second implementation of that interface.
- **No live driver position for passengers.** The API does not expose one, so no
  moving vehicle marker is drawn. The route and status are shown instead.
- **No push delivery.** Notifications are recorded server-side and read by the
  app; nothing arrives while it is closed.
- **No support ticket API.** The support screen gives real contact routes rather
  than a form that would go nowhere.
- **No profile-edit API.** Profile is read-only, and says so.
- **Card and online payment are refused at booking** by the backend. Rides are
  cash; food and parcels are cash or wallet.
- **No wallet top-up endpoint.** Balance is shown; adding funds is not offered.
- **No document upload endpoint.** Drivers see document status, not a camera.
- **The dev routing estimator uses straight-line distance.** Distances and ETAs
  are not production road figures until a routing provider is configured.
- **The geocoder is development-only.** Nominatim's usage policy does not permit
  production traffic.
