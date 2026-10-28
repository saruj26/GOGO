# Route-aware dynamic shared-ride matching

## The problem

Two passengers being near each other is not a reason to put them in the same
vehicle. What matters is whether one passenger's journey lies **along the road
the driver is already travelling**, in the **same direction**, at a **compatible
time**, with a **seat free**, within an **acceptable detour**, and without
violating anybody's **safety constraints**.

This engine answers that question, and records why it answered as it did.

## Where the work happens

| Concern | Location |
|---|---|
| Candidate shortlist and all geodesic measurement | PostgreSQL + PostGIS ([`matching.repository.ts`](../services/api/src/matching/matching.repository.ts)) |
| Hard constraints and soft scoring, as pure functions | [`matching.rules.ts`](../services/api/src/matching/matching.rules.ts) |
| Safety compatibility | [`gender-compatibility.ts`](../services/api/src/matching/gender-compatibility.ts) |
| Stop ordering | [`stop-sequencer.ts`](../services/api/src/matching/stop-sequencer.ts) |
| Orchestration | [`matching.service.ts`](../services/api/src/matching/matching.service.ts) |

Geodesic maths runs inside the database rather than in application code so that
the index used to *select* a candidate and the maths used to *measure* it are the
same. A candidate can never be chosen by the spatial index and then measured
differently in memory.

## The pipeline

### 1. Solo baseline

The passenger's own journey is routed once. It gives the journey's true road
length, the denominator for route coincidence, and the fare a solo ride would
cost — which is what the advertised saving is measured against. The baseline is
resolved per vehicle class, so a shared car fare is never compared against a
solo bike fare.

### 2. Spatial shortlist

```sql
WHERE r.joinable
  AND r.ride_type = 'SHARED'
  AND r.status IN ('SCHEDULED','ACCEPTED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS')
  AND vt.shared_ride_eligible
  AND d.approval_status = 'APPROVED'
  AND (r.seats_total - r.seats_occupied) >= :seats
  AND ST_DWithin(rr.geometry, :pickup,  :pickup_radius)
  AND ST_DWithin(rr.geometry, :dropoff, :dropoff_radius)
```

`ST_DWithin` against a GiST index on `ride_routes.geometry` eliminates almost
everything before any expensive work begins. **Both** endpoints must be in the
corridor — a passenger whose destination is nowhere near the driver's road is
not a candidate however close their pickup is.

For each survivor the database also computes:

- `ST_Distance` to the route — how far the passenger must walk;
- `ST_LineLocatePoint` for pickup, drop-off and the driver's own position — their
  positions along the route as fractions of its length;
- `ST_Length(ST_LineSubstring(...))` — the length of the driver's road between the
  two projections;
- `ST_Azimuth` across that segment — the direction the driver actually travels there.

### 3. Hard constraints

Evaluated first, in cheapest-and-most-decisive order. A candidate failing any one
is **discarded and never scored** — no soft preference can resurrect it.

| Constraint | Rejection reason |
|---|---|
| Already a passenger on this ride | `SELF_MATCH` |
| Vehicle class does not permit sharing | `VEHICLE_NOT_SHARED_ELIGIBLE` |
| No driver, or a live ride whose position is stale | `DRIVER_UNAVAILABLE` |
| Not enough free seats | `CAPACITY_FULL` |
| Safety preference conflict | `GENDER_PREFERENCE_CONFLICT` |
| Pickup outside the corridor | `PICKUP_OFF_ROUTE` |
| Drop-off outside the corridor | `DROPOFF_OFF_ROUTE` |
| Drop-off comes before pickup along the route | `INVALID_STOP_ORDER` |
| Driver has already passed the pickup | `WRONG_DIRECTION` |
| Heading differs by more than the configured maximum | `WRONG_DIRECTION` |
| Journey does not sufficiently coincide with the driver's road | `ROUTE_OVERLAP_TOO_LOW` |
| Detour exceeds distance, duration or percentage ceiling | `DETOUR_EXCEEDED` |
| Existing passengers would be delayed too much | `DETOUR_EXCEEDED` |
| Driver cannot reach the passenger near the requested time | `TIME_INCOMPATIBLE` |

**Direction and ordering** are decided by route fractions rather than by
heuristics. On a route A→B→C→D→E, pickup at B and drop-off at D gives
`f(B) < f(D)` and is valid; pickup at D and drop-off at B gives `f(D) > f(B)`
and is rejected as `INVALID_STOP_ORDER`. A pickup behind the driver's current
position is rejected as `WRONG_DIRECTION`.

**Safety** is a hard constraint by construction. `ridersCompatible` is checked
pairwise against every rider already on board, and by default in **both**
directions: a woman who asked for women-only passengers is protected even when
the person joining expressed no preference. `UNDISCLOSED` and `OTHER`
deliberately fail `WOMEN_ONLY`, `MEN_ONLY` and `SAME_GENDER_ONLY` — a
restriction that cannot be positively verified is treated as unsatisfied.

Whether a gender restriction also constrains the **driver's** gender is a policy
decision, not a technical default. It is exposed as
`safety.apply_gender_preference_to_driver`, off by default, for the operator to
decide.

### 4. Re-planning and detour

Only candidates that survived every cheap constraint are re-planned, because
re-planning costs a routing call.

Stops are ordered by **position along the driver's route**, not by booking order.
A repair pass then guarantees every passenger is collected before being dropped
off; the repair can only move a drop-off later, so it cannot create a new
violation. The same invariant is enforced independently by a deferred constraint
trigger in the database.

The re-planned itinerary is routed from where the driver is now, and compared
against the same itinerary without the new passenger. The difference is the
detour. Arrival times come from the route legs, which also yields the delay
imposed on each passenger already on board.

### 5. Pricing

The joining passenger is charged for **the legs that carry them** — between their
own pickup and their own drop-off — not for the driver's whole itinerary. Their
saving is measured against the solo baseline in the same vehicle class. The
driver's additional earning is computed independently; see
[`PRICING.md`](PRICING.md).

### 6. Scoring

Only candidates that passed every hard constraint are scored. Each sub-score is
normalised to 0..100 and combined with admin-configured weights:

| Sub-score | Meaning |
|---|---|
| `routeOverlap` | How closely the driver's road between the two points matches the direct journey |
| `pickupDistance` | Walking distance to the pickup, against the corridor radius |
| `dropoffDistance` | Walking distance from the drop-off |
| `timeCompatibility` | Arrival time against the requested time, within tolerance |
| `detour` | Extra travel time, against the configured ceiling |

## Audit

Every evaluated candidate is written to `shared_ride_match_candidates`,
**including rejected ones**, with its reason, its measurements and its score. The
matching settings in force are snapshotted onto the request, so a later
configuration change cannot make a past decision unexplainable. This is what
allows the platform to demonstrate, after the fact, that a match was refused for
a stated safety reason rather than never considered.

## Booking is separate from offering

A search result is a quotation, not a reservation. `POST /rides/shared/join`
re-verifies everything under an exclusive row lock on the ride:

1. `SELECT … FOR UPDATE` serialises concurrent claims;
2. capacity is re-checked against the locked row;
3. safety is re-checked against whoever is on board *now*;
4. the seat claim re-asserts `seats_occupied + n <= seats_total` in its own
   `WHERE` clause, so it affects zero rows rather than overselling;
5. `rides_seats_within_capacity` — a CHECK constraint — rejects the write if all
   of the above were somehow bypassed.

Verified in [`evidence/seat-race.txt`](../evidence/seat-race.txt).

## Configuration

Every threshold is a row in `admin_settings`, editable at runtime, with declared
bounds. Nothing in the table below is a code constant.

| Setting | Default |
|---|---|
| `matching.pickup_corridor_radius_m` | 600 |
| `matching.dropoff_corridor_radius_m` | 600 |
| `matching.min_route_overlap_pct` | 30 |
| `matching.max_bearing_difference_deg` | 75 |
| `matching.driver_search_radius_m` | 20000 |
| `matching.max_detour_distance_pct` | 25 |
| `matching.max_detour_distance_m` | 6000 |
| `matching.max_detour_duration_s` | 900 |
| `matching.max_existing_passenger_delay_s` | 600 |
| `matching.pickup_tolerance_early_s` | 300 |
| `matching.pickup_tolerance_late_s` | 900 |
| `matching.max_candidates` | 20 |
| `matching.score_weights` | overlap 35, pickup 20, drop-off 15, time 20, detour 10 |
| `safety.enforce_gender_preferences` | true |
| `safety.require_mutual_gender_consent` | true |
| `safety.apply_gender_preference_to_driver` | false |

## Known limitations

- **Stop ordering is a corridor heuristic.** Ordering by route position is optimal
  for a driver running a line and collecting passengers along it. A ride whose
  passengers are spread across genuinely divergent branches would be better served
  by an insertion search over permutations. `sequenceStops` is a drop-in
  replacement point for that, at the cost of one routing call per permutation.
- **One routing call per surviving candidate.** Acceptable at the default
  shortlist size of 20, but a caching or batching layer will be needed at scale.
- **Re-planning happens inside the seat-claiming transaction**, so a routing call
  is made while a row lock is held. The lock is per ride and brief, and this
  serialises concurrent joins to the same ride — which is the desired behaviour —
  but it does couple lock duration to routing-provider latency.
