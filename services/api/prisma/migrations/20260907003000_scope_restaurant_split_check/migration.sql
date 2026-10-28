-- The restaurant split (commission and payout) is only established when an
-- order is placed. A DRAFT row is a cart: it has a running item subtotal but no
-- split yet, so the reconciliation constraint added in
-- 20260907002000_food_parcel_service_layer wrongly rejected every cart update.
--
-- The invariant still holds for every order that has actually been placed.
ALTER TABLE "food_orders" DROP CONSTRAINT IF EXISTS "food_orders_restaurant_split_reconciles";
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_restaurant_split_reconciles"
  CHECK (
    "status" = 'DRAFT'
    OR "restaurant_payout" = "items_subtotal" - "restaurant_commission"
  );
