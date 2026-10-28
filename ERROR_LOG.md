# Error log

Defects found during implementation and how they were resolved. All were found
by running the system, not by inspection.

## 1. Interactive transactions timing out against a remote database

**Symptom:** intermittent HTTP 400 on ride creation and completion.
**Cause:** Prisma's 5-second default transaction budget. Ride creation makes
roughly a dozen round trips to a database in another region; ordinary latency
exceeded the budget.
**Fix:** explicit 30-second budget on the multi-step transactions
(`TRANSACTION_OPTIONS`). No external call is made inside a transaction, so a
generous budget costs nothing.

## 2. Transaction timeouts reported as validation failures

**Symptom:** a Prisma `P2028` surfaced to clients as `VALIDATION_FAILED`, HTTP 400.
**Cause:** the exception filter mapped every unrecognised Prisma error code to
400.
**Fix:** `P2024`, `P2028` and `P2034` now map to HTTP 503 with a `SERVICE_BUSY`
code and are logged at error level. Telling a client its request was invalid when
the service was merely busy sends it off debugging the wrong thing.

## 3. Missing pricing rule during shared-ride search

**Symptom:** `PRICING_RULE_MISSING` on every shared search.
**Cause:** the solo baseline was priced against the *requested* vehicle type,
which a search need not specify. With no vehicle type, rule resolution found no
match.
**Fix:** the baseline is resolved per candidate vehicle class and memoised. This
is also more correct — the saving shown is now against a solo ride in the same
vehicle class as the one being offered.

## 4. Stop renumbering violated the unique sequence constraint

**Symptom:** HTTP 409 on every attempt to join a shared ride.
**Cause:** re-sequencing interleaved inserts with updates, so a new stop claimed
a sequence number an existing stop had not yet vacated, violating
`UNIQUE(ride_id, sequence)`.
**Fix:** three-phase renumbering — park existing stops, insert new ones at final
positions, then move existing ones into place.

## 5. Parking sequences on negative numbers violated a CHECK constraint

**Symptom:** HTTP 500, `ride_stops_sequence_non_negative` violated.
**Cause:** the phase-one parking values were negative, which the schema forbids.
**Fix:** park above the valid range (offset 100,000) instead.

Worth recording: this was the schema's own constraint catching an application
bug within minutes of it being written.

## 6. Non-idempotent verification scenario

**Symptom:** the end-to-end scenario passed once, then failed on re-run.
**Cause:** two separate issues — a ride left active by the previous run held the
driver (`rides_one_active_per_driver`), and the driver's recorded position went
stale mid-run past `location.stale_after_s`.
**Fix:** the scenario now clears any active ride through the API before starting,
and pings the driver's position before each search, as a real driver application
would.

## Open observations, not defects

- The straight-line development estimator cannot reproduce a road that bends, so
  the specification's exact corridor could not be demonstrated through
  passenger-initiated booking alone. Kopay lies 3.26 km from the straight line
  between Jaffna and Point Pedro. This is a property of the estimator, not of the
  matching engine. A real road router (Google, as configured for production, or a
  self-hosted OSRM) resolves it. An OSM extract could not be downloaded in this
  environment — `download.geofabrik.de` returned HTTP 502.
- Driver earnings figures in a repeated scenario run are cumulative across runs,
  because the summary endpoint reports lifetime totals.

---

# PHASE 2 — FOOD & PARCEL

## 7. A CHECK constraint rejected every cart update

**Symptom:** HTTP 500 on the first "add to cart"; `food_orders_restaurant_split_reconciles` violated.
**Cause:** the constraint added earlier in this phase required
`restaurant_payout = items_subtotal − restaurant_commission`. A DRAFT cart has a
running subtotal but no restaurant split, so the invariant is not yet meaningful.
**Fix:** migration `20260907003000` scopes the constraint to non-DRAFT rows.

Worth recording: this is the third time in this project a hand-written
constraint has caught a defect within minutes of the code being written — here,
one of my own from the same session.

## 8. Cart transactions hit the 5-second default timeout

**Symptom:** HTTP 503 `SERVICE_BUSY` on adding a cart item; only one of two
lines persisted.
**Cause:** `CartService` opened interactive transactions without the explicit
budget the other services use. Round-trip latency to the managed database
exceeded Prisma's 5-second default.
**Fix:** `FOOD_TRANSACTION_OPTIONS` applied to both cart transactions. Every
`$transaction` in the new modules was then audited for the same omission; none
others were missing it.

The phase-1 fix that maps `P2028` to 503 rather than 400 is what made this
diagnosable — the error said the service was busy rather than that the request
was invalid.

## 9. A courier holding a second job was refused with an opaque error

**Symptom:** claiming a second delivery returned 400 `VALIDATION_FAILED`,
"The request could not be processed."
**Cause:** the refusal came from `food_deliveries_one_active_per_driver` firing
inside a raw `UPDATE`. The guarantee worked; the message was useless.
**Fix:** an explicit `isCourierFree` check inside the claim transaction returns
409 with "You are already on a job. Finish it before taking another." The index
remains the actual guarantee.

## 10. No way for a courier to release a job

**Symptom:** the concurrency scenario could not be re-run — a courier still held
a delivery from the previous run and no endpoint could free them.
**Cause:** genuinely missing functionality, not a test artefact. A courier who
breaks down or cannot reach a restaurant had no way to hand the job back.
**Fix:** `POST /food/deliveries/:id/release` and `POST /parcels/jobs/:id/release`,
permitted only before collection. Afterwards the honest outcome is a reported
failure, not a release. The order returns to waiting for a courier rather than
being cancelled, so the customer's food is unaffected.

## 11. A test asserted a transition the model did not allow

**Symptom:** a parcel test expected `FORBIDDEN` and got `ORDER_NOT_MODIFIABLE`.
**Cause:** `ASSIGNED → PICKED_UP` was not a legal parcel transition, so legality
failed before authority was ever considered.
**Fix:** made the transition legal. `HEADING_TO_PICKUP` is a courtesy status for
the sender's benefit, not a gate — a courier who simply arrives and collects must
not be blocked for skipping it. This matches how the food module already worked.

## Pre-existing finding, not fixed this phase

**Ride promotions are validated but never redeemed.** `RidesService` checked
`perUserLimit` and `usageLimit` but never wrote a `promotion_redemptions` row, so
neither limit could ever bite — a ride promotion is effectively unlimited per
user. The extracted `PromotionsService` provides `redeem`, and food and parcel
call it. Rides were **deliberately not changed**: wiring redemption into verified
settlement code is a behaviour change that deserves its own review. One-line fix
available; flagged for the Team Lead.
