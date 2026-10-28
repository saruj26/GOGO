# Requirement

Source: the platform specification supplied in the task prompt (46 sections).

## Objective

A production-ready multi-service transport platform — ride hailing, food delivery
and parcel delivery — whose differentiating capability is **route-aware dynamic
shared riding**: adding passengers to a journey a driver is already making, based
on route geometry rather than mere proximity.

## Non-negotiable constraints taken from the specification

- Database credentials come from the environment. Never committed, logged,
  printed, or returned in a response. The frontend never connects to PostgreSQL.
- Safety constraints (gender preference, capacity, direction, driver
  availability) are **hard** and are never traded against price, distance or ETA.
- Passenger charge and driver earning are computed separately and never confused.
- Business rules that an operator might change are configuration, not code.
- Overbooking must be impossible under concurrency.
- No fabricated driver, payment, location or fare in production logic. Mock data
  is isolated and gated.
- Every financial and matching decision is auditable.
- Errors return useful messages and never expose stack traces or internals.

## Decisions taken with the user

| | |
|---|---|
| Location | Fresh monorepo in `/home/led-247/data`; the existing `rideon` app untouched |
| Mobile | Flutter, per the specification |
| Map provider | Google Maps Platform as the configured default |
| Payments | Cash and wallet now, gateway later behind the same abstraction |

## Governance

Mini-AIOS operating model. This work is **not** production approved, **not**
Team Lead approved, and has **not** been committed or pushed. Final status:
**Pending Team Lead Review.**

---

# PHASE 2 — FOOD & PARCEL SERVICE LAYERS

Source: the continuation brief supplied in the task prompt (24 sections).

## Objective

Build the food ordering and parcel delivery **service layers** onto the schema
that already existed, reusing the verified ride platform's infrastructure rather
than duplicating it, and without disturbing the verified ride and shared-ride
system.

## Constraints taken from the brief

- Inspect before changing. Do not restart the project, recreate the database or
  rebuild the ride system.
- Reuse the existing pricing, payment, routing, driver and audit architecture.
  Do not create a second payment architecture or a second driver system.
- Do not add statuses where the existing enums already express the lifecycle.
- Never trust a client-supplied total, driver id, role or payment state.
- Concurrent acceptance must resolve to exactly one winner.
- Do not send duplicate notifications on retries.
- Migrations must be explicit, reviewable and reversible; nothing destructive.
- Do not expand scope into Flutter, web, admin, realtime or payment gateways.
- Where a business rule is genuinely undefined, ask rather than invent.

## Rule left to the business, not invented

**Menu item stock.** The schema has a boolean `available`, not a quantity. The
brief's "two users order the last available item" case has no oversell risk under
that model, and availability is re-checked transactionally. Whether the platform
should track stock is a product decision and is flagged rather than assumed.

## Governance

Mini-AIOS operating model. Not production approved, not Team Lead approved, not
committed or pushed. Final status: **Pending Team Lead Review.**
