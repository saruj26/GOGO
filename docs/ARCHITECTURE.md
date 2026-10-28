# Architecture

## Shape

```
Flutter app        Next.js web        Admin console          (not yet built)
      │                  │                   │
      └──────────────────┴───────────────────┘
                         │ HTTPS, JWT bearer
                  ┌──────▼───────┐
                  │  NestJS API  │  ← the only thing that touches PostgreSQL
                  └──────┬───────┘
                         │
        ┌────────────────┼──────────────────┐
        │                │                  │
  PostgreSQL 18      Map provider      Payment adapters
  + PostGIS 3.6      (google/osrm/     (cash, wallet)
  on Neon            haversine)
```

The frontend never connects to PostgreSQL. No credential reaches a client
bundle, a log line, a documentation file or an API response.

## Decisions and why

### PostGIS rather than latitude/longitude arithmetic

Corridor containment, position along a route, segment length and travel bearing
are all computed by PostGIS on `geography` columns, indexed with GiST. The
alternative — pulling routes into the application and measuring them in
JavaScript — would use different maths from the index that selected them, and
would not scale.

Point geometry is a **generated column**: the application writes `latitude` and
`longitude`, and PostgreSQL maintains
`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` from them. The geometry can
never drift out of step with the coordinates, and Prisma can still write the row.

### Hand-authored migrations

`prisma migrate dev` is not used. The schema relies on generated columns, CHECK
constraints, partial and conditional unique indexes, deferred constraint
triggers and GiST indexes — none of which Prisma's schema language can express.
Base SQL is generated with `prisma migrate diff` and then extended by hand;
`prisma migrate deploy` applies it.

### Invariants in the database, not only in code

52 tables, 44 CHECK constraints, 12 partial or conditional unique indexes,
11 GiST indexes, 30 triggers. Notable:

| Invariant | Mechanism |
|---|---|
| A vehicle is never oversold | `rides_seats_within_capacity` CHECK + row lock + guarded UPDATE |
| A driver never holds two live rides | `rides_one_active_per_driver` partial unique index |
| A passenger is never aboard two vehicles | `ride_passengers_one_onboard_per_user` partial unique index |
| A passenger is collected before being dropped off | deferred constraint trigger `ride_stops_order_check` |
| Fares reconcile | `fare_quotes_passenger_total_reconciles`, `fare_quotes_driver_net_reconciles` |
| Driver earnings reconcile | `driver_earnings_net_reconciles` |
| Exactly one open pricing rule per service and vehicle | `pricing_rules_one_active` partial unique, `NULLS NOT DISTINCT` |
| A soft-deleted account frees its phone number | partial unique indexes on `deleted_at IS NULL` |

These are not belt-and-braces. Each one has already caught a defect during
development — the stop-sequence CHECK rejected an incorrect renumbering scheme,
and the capacity CHECK backs a concurrency guarantee that would otherwise rest
entirely on application discipline.

### Live location: two tables

`driver_locations_current` holds exactly one row per driver and is UPSERTed on
every ping. Dispatch and matching read only this, so live queries never scan a
growing history. `driver_location_history` is append-only, thinned to at most one
row per configured interval, and pruned on a retention schedule
(`prune_driver_location_history`).

### Provider abstraction

Nothing outside `src/routing/` references a map vendor. Three adapters implement
one interface: Google (Routes + Geocoding APIs), OSRM, and a straight-line
estimator for development. Swapping providers is a configuration change.

The estimator is explicitly rejected at boot when `NODE_ENV=production`, because
a fare quoted from a straight line is not a real fare.

### Configuration over constants

Everything an operator might reasonably want to change lives in `admin_settings`
with declared bounds and a human label: corridor radii, detour ceilings, time
tolerances, score weights, safety policy, scheduling limits, retention windows.
The admin UI can be generated from the registry rather than maintained alongside
it.

### Security posture

- Argon2id password hashing at OWASP-recommended parameters.
- Refresh tokens stored only as SHA-256 digests, rotated on use, revoked on
  replay. A database disclosure yields no usable session.
- `JwtAuthGuard` applied globally: routes are closed unless marked `@Public()`,
  so a new controller cannot ship unauthenticated by accident.
- Roles re-read from the database on every request, not trusted from the token,
  so a revocation takes effect immediately.
- Sign-in verifies against a dummy hash when the account does not exist, so
  response time does not reveal who has registered; registration returns the same
  message either way.
- `forbidNonWhitelisted` validation rejects unknown properties outright rather
  than dropping them silently.
- One exception filter is the sole exit for errors. Clients get a stable code, an
  actionable sentence and a correlation reference — never a stack trace, a SQL
  fragment, a constraint name or a provider response.
- Prisma query logging is off: ride and payment queries carry coordinates, phone
  numbers and fare data.

### Personal data

Read models are projected per viewer. A passenger sees a **count** of
co-passengers, never their identities. A driver sees each passenger's first name,
phone and stops — what is needed to find and carry them — and never their gender
or safety preference. Gender is read by the matching engine and never leaves it;
a passenger's snapshot is stored on their own leg so a later profile edit cannot
retroactively invalidate an audited decision. The driver's phone number is
released to a passenger only once the driver is en route.

### Auditability

`audit_logs` records actor, action, entity, previous state and new state for
every ride creation, acceptance, shared-ride join, cancellation and settlement.
Audit writes never fail the operation they describe — a lost audit line is bad,
refusing a completed payment because its audit row would not insert is worse.

## Transactions

No external call is made while a database lock is held, with one deliberate
exception: re-planning a route during a shared-ride join. That lock is on a
single ride row and serialising concurrent joins to the same ride is the intended
behaviour.

Interactive transactions use a 30-second budget rather than Prisma's 5-second
default, because a dozen round trips to a managed database in another region
routinely exceed it. A transaction timeout is mapped to HTTP 503, not 400 — it is
a capacity problem, and telling a client its request was invalid sends it off
debugging the wrong thing.
