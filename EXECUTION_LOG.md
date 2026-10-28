# Execution log

**Date:** 2026-09-07
**Engineer:** Claude Code (implementation)
**Approval status:** Pending Team Lead review — not approved for production

## Phase 1 — Discovery

Working directory `/home/led-247/data` was empty; no repository, no package
manager, no source. A related project was found at `/home/led-247/rideon` (Expo
SDK 51 / React Native, Clerk auth, Stripe, ~20 source files, six API routes, no
roles, no migrations, no tests). Assessed as an Uber-clone tutorial app and **not
a viable base** for this specification. It was left untouched.

Toolchain present: Node 22.22.2, npm 10.9.7, git 2.43, psql 16.15, Docker 29.1.3,
Python 3.12. **Flutter and Dart are not installed.** Redis is not installed.

Target database inspected: Neon, PostgreSQL 18.6, zero tables, PostGIS 3.6.0
available. PostGIS availability determined the matching-engine design.

## Phase 2 — Decisions taken with the user

| Question | Decision |
|---|---|
| Location | Fresh monorepo in `/home/led-247/data`; `rideon` untouched |
| Mobile | Flutter, as specified (toolchain still to be installed) |
| Map provider | Google Maps Platform as the configured default |
| Payments | Cash + wallet adapters now; gateway later behind the same interface |

## Phase 3 — Database

- `20260907000000_init` — 52 tables, all enums, foreign keys and indexes,
  extended by hand with 13 STORED generated PostGIS columns, 44 CHECK
  constraints, 11 GiST indexes, 12 partial/conditional unique indexes, a deferred
  stop-order constraint trigger, `updated_at` triggers on 30 tables, and a
  location-history retention function.
- `20260907001000_add_overlap_rejection_reason` — adds `ROUTE_OVERLAP_TOO_LOW`
  so the audit trail names the rule that actually fired.

Both applied successfully to Neon via `prisma migrate deploy`.

## Phase 4 — Backend

Built: environment validation (fail-fast, secret-safe), Prisma module, admin
settings registry and service (31 runtime-editable rules), audit service,
authentication (Argon2id, rotating refresh tokens, global JWT guard, role guard),
provider-agnostic routing layer (Google / OSRM / dev estimator), drivers module
(live location, availability, earnings aggregation), rides module (estimate,
booking, lifecycle, settlement, access-controlled reads), global exception
filter.

## Phase 5 — Matching engine

Pure rule kernel, PostGIS repository, stop sequencer, orchestration service.
Full pipeline: solo baseline → spatial shortlist → hard constraints → re-plan →
detour and time ceilings → pricing → soft scoring → persisted audit of every
candidate including rejected ones.

## Phase 6 — Pricing

Versioned rules, immutable fare quotes with ordered component breakdowns,
independent passenger and driver calculations, configurable shared-passenger
driver share, minimum-earning top-up, discount ceilings.

## Phase 11 — Testing

62 unit tests across the rule kernel, stop sequencer and pricing engine — all
passing. Two executable end-to-end scenarios against the live database — both
passing. TypeScript typecheck clean. Production build succeeds.

## Not started

Phases 7 (Flutter), 8 (web and admin), 9 (food), 10 (parcel), realtime WebSocket
layer, and the payment adapter implementations. See `HANDOVER_SUMMARY.md`.

---

# PHASE 2 — FOOD & PARCEL SERVICE LAYERS

**Date:** 2026-09-07
**Approval status:** Pending Team Lead review — not approved for production

## Inspection before any change

Confirmed present and left untouched: 52 tables, two applied migrations, the
ride and shared-ride modules, auth, RBAC, routing, pricing, matching, drivers.
Baseline recorded green before editing anything — 62 tests passing, typecheck
clean.

Confirmed the food and parcel **schema already existed in full**: `restaurants`,
`restaurant_users`, `restaurant_hours`, `menu_categories`, `menu_items`,
`food_orders`, `food_order_items`, `food_order_status_history`,
`food_deliveries`, `parcel_types`, `parcel_orders`, `parcel_tracking`. The
existing `FoodOrderStatus`, `DeliveryStatus` and `ParcelStatus` enums already
covered every lifecycle the brief asked for, so **no status was added**.

Confirmed absent and therefore built: notifications service, payments service,
wallet service, promotions service, courier assignment, and every food and
parcel service, controller and DTO.

## Schema changes — additive only

`20260907002000_food_parcel_service_layer`
- `notifications.dedupe_key` + per-recipient partial unique index
- `food_deliveries_one_active_per_driver` partial unique index — closes a gap
  where rides and parcels had this guarantee and food did not
- `food_orders_one_draft_per_user_restaurant` partial unique index
- partial indexes for the two courier job feeds
- CHECK constraints on parcel weight, declared value and the restaurant split

`20260907003000_scope_restaurant_split_check`
- Scopes the restaurant-split reconciliation to non-DRAFT rows. A cart has a
  running subtotal but no split yet; the constraint as first written rejected
  every cart update.

No table created, altered destructively or dropped. No ride table touched.

## Shared code touched

- **`PricingService`** — `FareInput.surcharges` added. Purely additive; a quote
  with no surcharges is unchanged, confirmed by the existing 24 pricing tests.
- **`PromotionsService`** — extracted from `RidesService`, which now delegates.
  Behaviour-identical validation. Ride tests and both ride evidence scenarios
  re-run and pass.
- **`AllExceptionsFilter`** — unchanged this phase; the P2028 mapping added in
  phase 1 correctly surfaced a transaction timeout as 503 during this work.

## Built

Notifications (idempotent), payments and wallet ledger, promotions, courier
assignment, restaurant catalogue and portal, menu management, cart, checkout,
food order lifecycle, courier food operations, parcel booking and pricing,
parcel lifecycle, parcel tracking, and job release for both verticals.

## Validation

123 unit tests (62 pre-existing, 61 new) passing. Typecheck clean. Build
succeeds. Four migrations applied and in sync. Five end-to-end scenarios against
the live database, all passing — including both ride scenarios re-run to confirm
no regression.
