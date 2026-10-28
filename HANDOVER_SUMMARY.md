# Handover summary

**Approval status: Pending Team Lead review. Not approved for production.
Nothing has been committed or pushed.**

## What was asked for, and where it stands

The specification describes a full multi-service platform: backend, matching
engine, pricing, Flutter app, responsive web, admin console, restaurant portal,
food delivery and parcel delivery. This session delivered the **backend
foundation and the differentiating capability**, verified end to end. The client
applications and the two delivery verticals are not started.

## Built and verified

| Area | State |
|---|---|
| Database schema | 52 tables live on Neon, with PostGIS geometry, 44 CHECK constraints, 12 conditional unique indexes, 11 GiST indexes, 30 triggers |
| Migrations | Two, hand-authored, applied successfully |
| Authentication | Argon2id, rotating refresh tokens, globally closed routes |
| Authorization | Role-based, roles re-read per request, per-viewer read projections |
| Routing abstraction | Google / OSRM / development estimator behind one interface |
| Pricing engine | Versioned rules, immutable quotes, passenger and driver computed independently |
| **Shared-ride matching engine** | Full pipeline, hard constraints before scoring, every candidate audited |
| Ride lifecycle | Booking, driver acceptance, arrival, start, completion, settlement, cancellation |
| Driver-declared journeys | A driver declares a corridor and offers the seats along it |
| Live location | Two-table design with thinning and retention |
| Driver earnings | Per-passenger earnings and commission records, with shared-ride uplift surfaced separately |
| Overbooking protection | Row lock, guarded update and CHECK constraint — demonstrated |
| Tests | 62 unit tests, two end-to-end scenarios, all passing |
| Documentation | README, architecture, matching algorithm, pricing model |
| **Food ordering** | Catalogue, cart, server-side checkout, restaurant portal, courier delivery, settlement |
| **Parcel delivery** | Classes, compatibility, pricing with surcharges, booking, courier lifecycle, tracking |
| Payments | Shared lifecycle service and wallet ledger, used by food and parcel |
| Notifications | Idempotent in-app notifications across both delivery verticals |
| Promotions | Extracted from rides and shared by all three service lines |

## Not built

| Area | Note |
|---|---|
| Flutter application | Toolchain not installed on this machine |
| Customer web app | `apps/web` is an empty directory |
| Admin console | `apps/admin` is an empty directory; the settings registry is designed so its UI can be generated |
| Realtime WebSocket layer | Live location is persisted and served over HTTP |
| Payment gateway adapters | Lifecycle and abstraction exist; cash and wallet settle end to end, card and online are refused at booking |
| Push, SMS and email transports | Notification rows are written; nothing delivers them |
| Ratings, support APIs | Schema exists; no endpoints |
| Driver document upload and object storage | Schema exists; no endpoints |
| Menu item options and stock | No option groups, no per-item stock quantity |

## What a reviewer should check first

1. **Rotate the Neon credential.** It was supplied in plaintext in the task
   prompt and is therefore in the conversation record. It is stored only in a
   git-ignored `.env` with 600 permissions and appears in no source file,
   document, log or response.
2. **Re-run the scenario against Google Maps.** Everything was verified with the
   straight-line development estimator, which cannot model a road that bends.
   The matching geometry is exercised genuinely, but distances, durations and
   therefore fares are approximations until a real road router is configured.
3. **Decide the driver-gender policy.** Whether a women-only preference should
   also constrain the driver's gender is a business decision, not a technical
   one. It is exposed as `safety.apply_gender_preference_to_driver`, currently
   off. It was deliberately not decided here.
4. **Review the seeded pricing.** The LKR figures in the seed are plausible
   starting points, not a commercial recommendation. Every one is editable at
   runtime.
5. **Read `ERROR_LOG.md`.** Eleven defects have now been found by running the
   system; the schema's own constraints caught three of them, including one of
   mine from this phase.
6. **Ride promotions never record a redemption**, so their usage limits cannot
   bite. Found while extracting the shared promotions service. Deliberately not
   fixed here because it changes verified settlement behaviour — one-line fix,
   needs your call.
7. **`npm run lint` has never worked.** The script is declared but no ESLint
   configuration exists. Not claimed as passing anywhere.

## Suggested next phase

In dependency order:

1. **Admin console** — generated from the settings registry, plus driver
   approval, pricing rules, restaurant approval and the matching audit trail.
   Every module now has data worth administering.
2. **Responsive customer web app** — ride booking with the shared-ride offer
   screen as its centrepiece, plus food and parcel.
3. **Realtime layer** — WebSocket transport for live position, ride status,
   courier position and restaurant order arrival.
4. **Flutter application** — passenger, driver and courier, once the API
   contract has been exercised by the web client.

Smaller items worth folding into whichever phase touches them:

- Wire ride promotions into `PromotionsService.redeem` (see `ERROR_LOG.md`).
- Move ride payments onto `PaymentsService` so all three lines share one path.
- Decide whether menu items need stock quantities.

## Open question for the business

The specification frames shared rides two ways: a passenger books and others join
their route (§2's opening), and a driver is already travelling a corridor (§2's
example). Both are implemented — `POST /rides` with `rideType: SHARED`, and
`POST /rides/driver/planned-journey`. Which is the primary product motion affects
driver onboarding, dispatch and the mobile UI, and should be settled before the
apps are built.
