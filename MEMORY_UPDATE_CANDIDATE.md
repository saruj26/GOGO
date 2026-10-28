# Memory update candidates

Facts from this work worth carrying forward. Nothing here contains a credential.

## Environment

- Target database is Neon, PostgreSQL 18.6, with PostGIS 3.6, pgcrypto, citext,
  pg_trgm, btree_gist and timescaledb available. PostGIS availability is what
  makes route-aware matching practical in SQL.
- The pooled Neon endpoint is transaction-pooled and unsuitable for DDL and row
  locking. The direct endpoint is the same host without `-pooler`. Both are
  configured (`DATABASE_URL`, `DIRECT_DATABASE_URL`).
- Flutter and Dart are not installed on this machine. Redis is not installed;
  Docker is available.
- `download.geofabrik.de` is unreachable from this environment (HTTP 502), so
  self-hosting OSRM from an OSM extract is not currently possible here.
- Round-trip latency to Neon makes Prisma's 5-second default transaction budget
  too tight for multi-step transactions.

## Project conventions established

- Prisma migrations are **authored by hand**; `prisma migrate dev` is not used.
  Base SQL comes from `prisma migrate diff`, then is extended for PostGIS,
  generated columns, CHECK constraints, partial indexes and triggers.
- Point geometry is always a STORED generated column derived from `latitude` and
  `longitude`, so Prisma can write the row and PostGIS maintains the geometry.
- Money is `NUMERIC(14,2)` with exact decimal arithmetic. Components are rounded
  as produced; totals are sums of rounded components, enforced by CHECK
  constraints.
- Business rules that an operator might change live in `admin_settings`, never as
  code constants.

## Existing related work

- `/home/led-247/rideon` is an Expo/React Native Uber-clone tutorial app. Useful
  only as a UX reference; deliberately untouched.

## From the food and parcel phase

- The food and parcel **schema was already complete**, including every status
  the lifecycles need. Reading the existing enums before designing saved adding
  redundant states.
- **A cart is a `food_orders` row in DRAFT.** There is no separate cart table,
  and checkout is a status transition.
- **`menu_items` has no stock quantity** — availability is a boolean the kitchen
  toggles. "Two customers race for the last portion" is not a scenario this
  schema can express; adding stock is a product decision, not a bug fix.
- Every interactive `$transaction` in this codebase needs an explicit
  `{ maxWait, timeout }`. Prisma's 5-second default is too tight for the latency
  to this database and fails intermittently.
- `notifications.dedupe_key` is scoped **per recipient**, so one event can
  legitimately notify a customer, a restaurant and a courier while still being
  idempotent for each.
- **No ESLint configuration has ever existed** in this repository, despite the
  `lint` script in `package.json`.
- Two demo couriers exist: Kumar (car) and Vasanth (bike). A parcel is bound to
  its booked vehicle class, so they cannot contend for the same parcel — a
  same-class third courier is needed to demonstrate parcel claim contention live.
