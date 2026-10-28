# Validation result

**Date:** 2026-09-07
**Verdict:** PARTIAL PASS — the delivered scope is verified; substantial scope is
not yet built and is therefore **not** validated.
**Approval status:** Pending Team Lead review. Not approved for production.

Nothing below is marked passing without evidence. Evidence lives in `evidence/`
and is reproducible.

## Evidence

| Artefact | What it demonstrates |
|---|---|
| `evidence/unit-tests.txt` | 62 unit tests, 3 suites, all passing; typecheck clean |
| `evidence/shared-ride-scenario.txt` | The §33 scenario end to end against the live database |
| `evidence/seat-race.txt` | Two passengers, one seat, simultaneous claims |
| `evidence/shared-ride-scenario.mjs`, `evidence/seat-race.mjs` | The scripts themselves, re-runnable |

## Acceptance criteria

### Verified

| Criterion | Evidence |
|---|---|
| Backend builds successfully | `nest build` succeeds; typecheck clean |
| Database migrations work | Both migrations applied to Neon; 52 tables, 13 generated columns, 44 CHECKs, 11 GiST, 12 partial unique, 30 triggers confirmed by query |
| Authentication works | Four accounts authenticated in the scenario |
| Role authorization works | Unauthenticated request to `/rides` returns 401; driver-only routes reject non-drivers |
| User ride booking works | Passengers A and B booked and were charged |
| Driver ride acceptance works | Driver accepted, started and completed |
| Vehicle types work | Four database-driven classes priced independently |
| Fare calculation works | Bike/Auto/Car/Mini-Van estimates; 24 pricing unit tests |
| Shared ride matching works | Passenger B offered Kopay → Nelliyady at 92/100 match quality |
| Route direction is validated | Nelliyady → Kopay refused |
| Pickup/drop-off route proximity is validated | Mannar refused as off-corridor |
| Maximum detour is enforced | Four detour-ceiling unit tests |
| Time compatibility works | 8:13 arrival for an 8:15 request accepted; 9:00 refused |
| Vehicle capacity is enforced | Seat-race: exactly one of two simultaneous claims succeeded |
| Gender safety preference is enforced | Women-only passenger refused a ride carrying men; offered the same ride with the restriction lifted |
| Multiple passengers can be managed | Two passengers on one ride, six-stop plan re-sequenced |
| Shared ride fare is calculated correctly | Passenger B charged LKR 1,254.83, saving LKR 489.03 |
| Driver earning is calculated separately | Driver net LKR 1,056.26 against passenger payments of LKR 3,416.91 |
| Platform commission is calculated separately | Recorded per passenger in `platform_commissions` |
| Payment state is tracked | Payment and transaction rows written at settlement |
| Cancellation works | Scenario reset cancels an active ride through the API |
| Ride history works | Cursor-paginated passenger and driver history |
| Live location architecture works | Two-table design; ping endpoint exercised throughout the scenario |
| API authorization is secure | Global closed-by-default guard; per-viewer read projections |
| No secrets are exposed | No credential in source, documentation, logs or responses; `.env` git-ignored |
| Database queries are indexed appropriately | 11 GiST, 12 partial unique, plus supporting composite indexes |
| Pagination is implemented | Cursor pagination on every unbounded feed |
| Tests exist for critical business logic | 62 unit tests plus two end-to-end scenarios |
| Build/type checks pass | Both clean |
| Documentation is updated | README, ARCHITECTURE, MATCHING, PRICING |
| Rollback approach is documented | `ROLLBACK_NOTE.md` |
| Evidence is collected | `evidence/` |

### Not verified — not yet built

Flutter application builds · Web application builds · Responsive web UI ·
Horizontal overflow checks · Mobile layout checks · Ratings · Food ordering ·
Restaurant management · Food delivery · Parcel booking · Parcel tracking ·
Admin management UI

These are **not failures**. The work has not been done, and is listed as
outstanding in `HANDOVER_SUMMARY.md`.

## Caveats a reviewer must weigh

1. **Verified with the development routing estimator, not a road router.** No
   `MAP_API_KEY` was available and an OSM extract could not be downloaded here.
   The matching engine's geometry is exercised genuinely, but distances and
   durations are straight-line approximations. **Re-run the scenario against
   Google Maps before drawing any conclusion about real-world fares or ETAs.**
2. **Load and soak testing have not been performed.** The concurrency guarantee
   is demonstrated for two simultaneous claims, not under sustained load.
3. **The payment layer settles cash only.** The abstraction and lifecycle exist;
   no gateway is integrated.
4. **No realtime transport yet.** Live location is persisted and served over
   HTTP; the WebSocket layer described in §12 is not built.
5. **The Neon credential supplied in the task prompt was transmitted in
   plaintext and should be rotated before any further use.**

---

# PHASE 2 — FOOD & PARCEL SERVICE LAYERS

**Date:** 2026-09-07
**Verdict:** PASS for the delivered scope. Scope outside food and parcel is
unchanged from phase 1 and remains unvalidated where it was.
**Approval status:** Pending Team Lead review. Not approved for production.

## Evidence

| Artefact | Demonstrates |
|---|---|
| `evidence/unit-tests.txt` | 123 tests, 6 suites, all passing; typecheck clean; build succeeds; 4 migrations in sync |
| `evidence/food-lifecycle.txt` | Browse → cart → checkout → accept → prepare → ready → claim → collect → deliver → settle |
| `evidence/parcel-lifecycle.txt` | Classes → compatibility → estimate → book → claim → collect → transit → deliver → settle |
| `evidence/delivery-race.txt` | Two couriers, one job, simultaneous claims |
| `evidence/shared-ride-scenario.txt` | Phase-1 ride scenario **re-run after the promotions refactor** |
| `evidence/seat-race.txt` | Phase-1 seat race **re-run after the promotions refactor** |

## Food — required tests

| # | Case | Verified by |
|---|---|---|
| 1 | Create order | `food-lifecycle` — order placed |
| 2 | Invalid menu item | Unit + `food-lifecycle` (unknown item → 404) |
| 3 | Unavailable menu item | `food-lifecycle` — `MENU_ITEM_UNAVAILABLE` on add and at checkout |
| 4 | Quantity validation | `food-lifecycle` — zero rejected; per-item ceiling configurable |
| 5 | Server-side total | `food-lifecycle` — client `total` rejected outright; totals recomputed |
| 6 | Promotion validation | `PromotionsService`; caps covered by 24 pricing tests |
| 7 | Restaurant accepts | `food-lifecycle` |
| 8 | Restaurant rejects | Implemented with refund; state machine unit-tested |
| 9 | Preparation status | `food-lifecycle` |
| 10 | Driver assignment | `food-lifecycle` — courier offered and claims |
| 11 | Driver accepts | `food-lifecycle`, `delivery-race` |
| 12 | Food pickup | `food-lifecycle` |
| 13 | Food delivery | `food-lifecycle` — settled, courier paid |
| 14 | Invalid status transition | 31 unit tests + 3 live refusals |
| 15 | Customer cancellation | `food-lifecycle` — refused after the configured cut-off |
| 16 | Payment failure | Wallet shortfall → `INSUFFICIENT_WALLET_BALANCE`, order stays DRAFT; card/online refused at booking |
| 17 | Authorization | 5 live checks: cross-customer cart, cross-customer order, customer-as-restaurant, courier-as-restaurant, restaurant privacy |
| 18 | Concurrent acceptance | `delivery-race` — exactly one winner |

## Parcel — required tests

| # | Case | Verified by |
|---|---|---|
| 1 | Create parcel | `parcel-lifecycle` |
| 2 | Address validation | DTO latitude/longitude/phone validation |
| 3 | Vehicle compatibility | `parcel-lifecycle` — bike refused for a 120 kg parcel; over-weight class refused |
| 4 | Price calculation | 10 unit tests + `parcel-lifecycle` (quote matches booking exactly) |
| 5 | Driver assignment | `parcel-lifecycle` |
| 6 | Driver accepts | `parcel-lifecycle` |
| 7 | Pickup | `parcel-lifecycle` |
| 8 | In transit | `parcel-lifecycle` |
| 9 | Delivery | `parcel-lifecycle` — settled, courier paid |
| 10 | Invalid status transition | 20 unit tests + live refusals |
| 11 | Cancellation | `parcel-lifecycle` — refused after collection |
| 12 | Payment failure | Same as food |
| 13 | Tracking history | `parcel-lifecycle` — 5-entry trail |
| 14 | Authorization | Cross-customer read and tracking both 404; sender cannot mark collected |
| 15 | Concurrent acceptance | Same guarded-claim pattern as food, plus a partial unique index. **Demonstrated for food, not separately for parcel** — the demo fleet has one bike and one car, and a parcel is bound to its booked vehicle class, so two demo couriers cannot contend for one parcel. The mechanism is identical and unit-covered; a same-class second courier would be needed to demonstrate it live. |

## Not validated

- **Lint.** `package.json` declares a `lint` script but **no ESLint configuration
  has ever existed** in this repository. The command fails with a missing-config
  error. Not claimed as passing.
- **Load and soak.** Concurrency is demonstrated for two simultaneous actors,
  not under sustained load.
- **Push, SMS, email.** Notification rows are written; no transport delivers them.
- **Card and online payments.** Refused at booking by design; no gateway integrated.
- Everything listed as unbuilt in phase 1 — Flutter, web, admin UI, realtime —
  remains unbuilt and unvalidated.

## Caveat carried forward

All routing still uses the straight-line development estimator. Delivery
distances, ETAs and therefore delivery fees are approximations until a real road
router is configured. The provider abstraction is untouched and
`MAP_PROVIDER=haversine` is still refused in production.
