# Rollback

## Application

The service is stateless. Roll back by deploying the previous build. No
application-side migration or data repair is required.

## Database

Both migrations are additive to an empty schema. Because the target database had
zero tables before this work, a complete rollback is a schema drop:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

**This destroys all data.** It is only appropriate while the deployment is still
pre-production, which it is.

Once real data exists, roll back the second migration alone with:

```sql
-- 20260907001000_add_overlap_rejection_reason
-- PostgreSQL cannot remove an enum value in place. Recreate the type:
ALTER TYPE "MatchRejectionReason" RENAME TO "MatchRejectionReason_old";
CREATE TYPE "MatchRejectionReason" AS ENUM (...values except ROUTE_OVERLAP_TOO_LOW...);
ALTER TABLE shared_ride_match_candidates
  ALTER COLUMN rejection_reason TYPE "MatchRejectionReason"
  USING rejection_reason::text::"MatchRejectionReason";
DROP TYPE "MatchRejectionReason_old";
```

Any row already carrying `ROUTE_OVERLAP_TOO_LOW` must be reassigned first. Take a
Neon branch or backup before attempting it.

The first migration has no safe partial rollback and should not be attempted
against populated data; restore from a Neon branch instead.

## Configuration

`admin_settings` rows are seeded only when absent, so a redeploy never reverts an
administrator's edits. Rolling back the application does not change them.

## Credential rotation

Rotating `DATABASE_URL`, `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` requires only
an environment change and a restart. Rotating a JWT secret invalidates every
outstanding token, which signs all users out — intended behaviour after a
suspected compromise.

---

# PHASE 2 — FOOD & PARCEL

Both migrations are additive: indexes, one nullable column and CHECK
constraints. Nothing is destructive, and both reverse cleanly.

## `20260907003000_scope_restaurant_split_check`

```sql
ALTER TABLE "food_orders" DROP CONSTRAINT IF EXISTS "food_orders_restaurant_split_reconciles";
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_restaurant_split_reconciles"
  CHECK ("restaurant_payout" = "items_subtotal" - "restaurant_commission");
```

Reverting this **re-introduces the defect it fixed** — every cart update will
fail. Roll back only together with the application.

## `20260907002000_food_parcel_service_layer`

```sql
DROP INDEX IF EXISTS "notifications_dedupe_key_per_user";
DROP INDEX IF EXISTS "food_deliveries_one_active_per_driver";
DROP INDEX IF EXISTS "food_orders_one_draft_per_user_restaurant";
DROP INDEX IF EXISTS "food_deliveries_awaiting_courier";
DROP INDEX IF EXISTS "parcel_orders_awaiting_courier";

ALTER TABLE "parcel_orders" DROP CONSTRAINT IF EXISTS "parcel_orders_weight_positive";
ALTER TABLE "parcel_orders" DROP CONSTRAINT IF EXISTS "parcel_orders_declared_value_non_negative";
ALTER TABLE "food_orders"   DROP CONSTRAINT IF EXISTS "food_orders_restaurant_split_reconciles";
ALTER TABLE "food_orders"   DROP CONSTRAINT IF EXISTS "food_orders_restaurant_split_non_negative";

-- Only if notification idempotency is also being abandoned:
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "dedupe_key";
```

Dropping `food_deliveries_one_active_per_driver` removes a **safety guarantee**:
a courier could then be handed two live deliveries. Prefer rolling the
application back and leaving the index in place.

## Application code

Rolling back to the phase-1 build is safe. The only shared code changed was:

- `PricingService` — `surcharges` is optional and defaults to none, so a
  phase-1 build ignores it and prices exactly as before;
- `RidesService` — delegates promotion validation to `PromotionsService`. A
  phase-1 build restores the inline copy with identical behaviour.

Neither requires data repair.
