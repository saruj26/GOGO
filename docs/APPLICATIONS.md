# The applications

Three clients on one backend: two Next.js applications on the App Router, and a
Flutter application for phones.

| | Customer web app | Admin console | Mobile |
|---|---|---|---|
| Stack | Next.js | Next.js | Flutter |
| Port | 3000 | 3001 | — |
| Audience | People booking rides, food and parcels | Operations staff | Customers **and** drivers |
| Shape | Mobile-first; map-led booking, bottom tab bar | Desktop-first; persistent sidebar, dense tables | Two shells behind one sign-in |
| Routes / screens | 20 | 16 | 36 |

The web applications share `packages/shared`. The Flutter application cannot
import TypeScript, so it re-states the same contract in Dart — but it re-states
only the *shapes*, never the decisions. The section below applies to all three
clients identically.

## What is shared

`packages/shared` holds the API client, the response types and the formatting
helpers. Both applications import it; neither has its own copy of a URL, a
response shape or a currency formatter.

### The API client

One place owns four things no component should repeat
([`api-client.ts`](../packages/shared/src/api-client.ts)):

- **Auth.** The access token is attached to every request except sign-in.
- **Session recovery.** A 401 triggers exactly one refresh, no matter how many
  requests expire together, and the original request is retried. The backend
  rotates refresh tokens, so concurrent refreshes would be rejected as replays —
  the in-flight promise is shared to prevent that.
- **Errors.** Every failure becomes a typed `ApiError` carrying the code and the
  sentence the backend wrote. When there is no readable body, a generic message
  is used rather than whatever HTML the response contained.
- **Time and cancellation.** Every request has a budget, and a caller's
  `AbortSignal` is combined with it — so a superseded search-as-you-type is
  cancelled rather than left racing.

## The frontend is not the business authority

This is the rule the applications are built around. They **display** backend
decisions and never make them.

| Decision | Where it is made |
|---|---|
| Whether a shared ride is compatible | `POST /rides/shared/search` — route geometry, direction, detour, timing, capacity and safety |
| What a fare is | The pricing engine, persisted as a `fare_quotes` row |
| What an order costs | Recalculated at checkout from live menu prices and routed distance |
| Whether a seat is free | Re-checked under a row lock at booking |
| Whether payment succeeded | The server, at the point the service was delivered |

Concretely: the checkout DTO has **no total field**, and the validation pipe
rejects one if sent — verified in
[`evidence/food-lifecycle.txt`](../evidence/food-lifecycle.txt). Money arrives as
a fixed-point decimal string and is displayed as one; it is never parsed into a
float, because a float would eventually disagree with the receipt.

## Mobile application

One installed app, one sign-in, two shells. Which shell opens is decided from
the profile the backend returns; every driver endpoint re-checks the role
itself, so that choice is navigation and not authorisation.

The customer shell mirrors the web product: map-led booking with solo and shared
given equal weight, food, parcels, activity and account. The driver shell is a
different job and is kept deliberately separate — going online, ride requests,
the current ride with its backend-sequenced stops, food and parcel deliveries on
one board, and earnings with the shared-passenger uplift shown as its own
figure.

Two things about sharing are worth stating plainly, because they are easy to get
wrong:

- **A driver does not accept individual shared passengers.** There is no such
  endpoint. Consent is the standing `acceptsShared` setting, and the matching
  engine adds a compatible passenger directly under a row lock. The driver app
  therefore shows the updated passenger list and stop order — it does not offer
  an accept/reject prompt that would have nothing to call.
- **Stop order is never computed on the device.** When a passenger joins, the
  backend resequences the stops and the app renders that order as given.

Platform concerns sit behind interfaces — `LocationService`, `TokenStore`,
`LiveUpdates`, `PushTransport`, the map view — so iOS is a platform folder and a
keychain review rather than a second implementation of the product. Driver
position reporting is distance-filtered and rate-limited on the device before it
reaches the backend, which thins the history again on its side.

## Customer application

Ride booking is the centrepiece. Pickup and destination can come from address
search, a saved place, the device's location, or a pin dropped on the map. Once
both are set, the backend prices every eligible vehicle class and the customer
chooses **solo** or **shared** — given equal weight in the interface, because
sharing is the product's distinguishing idea.

Choosing shared reveals the safety preference and then the offers the matching
engine returned: fare, saving, walking distance to the pickup, arrival time, how
many seats are free and how many people are already aboard. Everything on that
card is the backend's; the application performs no compatibility check of its own
and has no way to.

Ride tracking uses `useRideTracking`, which polls only while a ride is actually
moving and stops when it finishes. **The shape is the point**: screens consume
`{ ride, isLive }` and know nothing about how it arrives, so adding a WebSocket
means changing the inside of one hook. It deliberately does not render a moving
vehicle: the API does not expose a driver's live coordinates to a passenger, and
a dot pretending to be a car would be a lie.

Food and parcel follow the same discipline. A cart is a DRAFT order on the
server. Order progress is drawn from the backend's own status history, with
friendly labels applied at the edge — `PLACED` reads as "Sent to restaurant"
without the stored value changing.

## Admin console

Twelve operational screens over the endpoints added for this phase. Two things
run through all of them:

- **Every list is paginated and counted in the database.** No screen can pull an
  unbounded result set.
- **Every state change is audited.** Approving a driver, suspending an account,
  changing a price — each writes a record naming the administrator.

Some controls are absent on purpose. A promotion's redemption counter is not
editable, because the platform maintains it. A restaurant's commission is not in
the profile DTO, because a restaurant must not be able to change what it is
charged. Pricing is edited by **superseding** a rule with a new version, so every
historical fare remains reproducible from the version that produced it.

The ride detail view summarises shared matching — how many candidates were
evaluated, how many were offered, and why the rest were not — without exposing
per-candidate scores. Operations needs to know why a ride was refused, not the
internals of how it was ranked.

## Responsive design

Verified in a real browser at 320, 375, 390, 414, 768, 1024, 1280, 1440 and 1920,
across all 24 significant screens — 216 combinations, checked for horizontal
overflow, content escaping the viewport, tap targets under 32px and text under
11px. Recorded in [`evidence/responsive-check.txt`](../evidence/responsive-check.txt),
with screenshots in `evidence/screenshots/`.

The customer app is mobile-first: a five-item tab bar within thumb reach, with
everything else on the profile page; on desktop the full navigation moves to a
sidebar. Both are driven by one list, so a route cannot appear in one and be
forgotten in the other.

The admin console is desktop-first but never breaks: below `lg` its tables become
lists of cards driven by the same column definitions, and its sidebar becomes a
drawer. A twelve-column table on a phone is not a table — it is a horizontal
scroll nobody reads.

## Performance

- The map is `dynamic`-imported, taking the booking page from 409 kB to 137 kB.
- Search is debounced and superseded requests are cancelled.
- Polling happens only while something can still change, and stops at a terminal
  status.
- Lists use cursor pagination where they grow without bound, offset pagination
  where staff need page numbers.
- The dashboard chart is drawn with plain elements — a charting library would add
  more than a hundred kilobytes to render fourteen bars.

## Known limitations

- **No realtime transport.** Live data is polled. The abstraction is in place.
- **No live driver position for passengers.** The API does not expose it.
- **Support has no ticketing.** `SupportTicket` exists in the schema but has no
  endpoints, so the support page offers a phone number and an email address
  rather than a form that would go nowhere.
- **Profile editing is read-only.** There is no endpoint to change a name, phone
  number or password.
- **Card and online payments are refused at booking**, as on the backend.
- **Vehicle classes are read-only in admin.** Their fares are editable; their
  capabilities are not.
- **An admin who is not a member of a restaurant cannot open its portal** — a
  backend constraint carried forward.
- **No end-to-end browser tests of full flows.** Component tests cover the
  decision points; the executable scenarios in `evidence/` cover the flows
  through the API.

Additionally, on mobile:

- **No push delivery.** Notifications are recorded and read, never pushed, so
  nothing arrives while the app is closed.
- **No wallet top-up and no document upload.** Both are shown read-only, because
  neither has an endpoint.
- **iOS is not scaffolded.** The architecture is ready for it; the platform
  folder has not been generated.
