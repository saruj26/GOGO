-- ===========================================================================
-- Food and parcel service layer — supporting constraints.
--
-- Additive only. No table is created, altered destructively or dropped, and
-- nothing here touches the ride or shared-ride tables.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Notification idempotency
--    A retried request or a redelivered event must not notify somebody twice.
--    The key is scoped to the recipient, so the same event legitimately
--    notifies a customer, a restaurant and a driver.
-- ---------------------------------------------------------------------------
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_key_per_user"
  ON "notifications" ("user_id", "dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. A courier may hold at most one live food delivery
--    Rides (`rides_one_active_per_driver`) and parcels
--    (`parcel_orders_one_active_per_driver`) already carry this guarantee.
--    Food deliveries did not, which left driver assignment resting entirely on
--    application discipline. This closes that gap and makes two drivers racing
--    for the same delivery — or one driver being handed two — impossible at the
--    storage layer.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "food_deliveries_one_active_per_driver"
  ON "food_deliveries" ("driver_id")
  WHERE "driver_id" IS NOT NULL
    AND "status" IN ('ASSIGNED', 'HEADING_TO_PICKUP', 'AT_PICKUP', 'PICKED_UP', 'DELIVERING');

-- ---------------------------------------------------------------------------
-- 3. One open cart per customer per restaurant
--    A DRAFT food order IS the cart. Without this, a double-tapped "add to
--    cart" could leave a customer with two competing carts for one restaurant.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "food_orders_one_draft_per_user_restaurant"
  ON "food_orders" ("user_id", "restaurant_id")
  WHERE "status" = 'DRAFT';

-- ---------------------------------------------------------------------------
-- 4. Query support for the courier-facing offer feed
--    Deliveries awaiting a courier are read frequently and are a tiny fraction
--    of the table, so a partial index keeps that scan proportional to the work
--    outstanding rather than to history.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "food_deliveries_awaiting_courier"
  ON "food_deliveries" ("created_at")
  WHERE "status" = 'UNASSIGNED';

CREATE INDEX IF NOT EXISTS "parcel_orders_awaiting_courier"
  ON "parcel_orders" ("created_at")
  WHERE "status" IN ('PLACED', 'SEARCHING_DRIVER');

-- ---------------------------------------------------------------------------
-- 5. Financial invariants for parcel and food money
--    Mirrors the constraints already protecting fares and driver earnings.
-- ---------------------------------------------------------------------------
ALTER TABLE "parcel_orders" DROP CONSTRAINT IF EXISTS "parcel_orders_weight_positive";
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_weight_positive"
  CHECK ("weight_kg" IS NULL OR "weight_kg" > 0);

ALTER TABLE "parcel_orders" DROP CONSTRAINT IF EXISTS "parcel_orders_declared_value_non_negative";
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_declared_value_non_negative"
  CHECK ("declared_value" IS NULL OR "declared_value" >= 0);

ALTER TABLE "food_orders" DROP CONSTRAINT IF EXISTS "food_orders_restaurant_split_reconciles";
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_restaurant_split_reconciles"
  CHECK ("restaurant_payout" = "items_subtotal" - "restaurant_commission");

ALTER TABLE "food_orders" DROP CONSTRAINT IF EXISTS "food_orders_restaurant_split_non_negative";
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_restaurant_split_non_negative"
  CHECK ("restaurant_commission" >= 0 AND "restaurant_payout" >= 0);
