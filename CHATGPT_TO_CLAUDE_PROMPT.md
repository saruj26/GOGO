# Upstream briefs

This file records the briefs this implementation was carried out against, so a
reviewer can judge the work against what was actually asked for.

## Phase 1 — Platform foundation

A 46-section specification for a multi-service transport platform: ride hailing,
route-aware dynamic shared rides, food delivery and parcel delivery, with the
shared-ride matching engine as the differentiating capability.

Delivered: database, auth, RBAC, routing abstraction, pricing engine, matching
engine, ride lifecycle, driver management. Stopped at a verified phase boundary.
See `EXECUTION_LOG.md` (phase 1) and `VALIDATION_RESULT.md` (phase 1).

Four decisions were referred back and answered by the user before implementation
began:

| Question | Answer |
|---|---|
| Where should the platform live? | Fresh monorepo in `/home/led-247/data`; leave the existing `rideon` app untouched |
| Mobile stack | Flutter, as specified |
| Map provider | Google Maps Platform as the configured default |
| Payments | Cash and wallet now, gateway later behind the same abstraction |

## Phase 2 — Food and parcel service layers

A 24-section continuation brief: build the food and parcel service layers onto
the existing schema, reuse the verified infrastructure, preserve the ride system,
and stop at the phase boundary.

Delivered in full. See `EXECUTION_LOG.md` (phase 2) and `VALIDATION_RESULT.md`
(phase 2).

No question needed to be referred back. One business rule was **flagged rather
than invented**: whether menu items should carry stock quantities. The schema
models availability as a boolean, and that is what was implemented.

## Status

**Pending Team Lead Review.** Nothing committed, pushed or deployed.
