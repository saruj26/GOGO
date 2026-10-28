# Food ordering and parcel delivery

Both modules were built onto the schema that already existed. No food or parcel
table was recreated, and no ride table was touched.

## What is shared, and why

Neither vertical owns its own copy of anything the platform already had:

| Concern | Shared component | Note |
|---|---|---|
| Fares, commission, courier pay | `PricingService` | Extended with **surcharges** rather than duplicated — see below |
| Promotions | `PromotionsService` | Extracted from the ride module, which now delegates to it |
| Payments | `PaymentsService`, `WalletService` | New, and used by food and parcel; rides still create payment rows inline |
| Courier eligibility | `DeliveryAssignmentService` | One query answers "who can do this job" for both verticals |
| Notifications | `NotificationsService` | New; idempotent by construction |
| Routing | `RoutingService` | Unchanged |
| Audit | `AuditService` | Unchanged |

### The pricing extension

Parcel pricing needs charges the ride model has no concept of — weight, a
required signature. Rather than a second pricing engine, `FareInput` gained an
optional `surcharges` array. Surcharges are added to the gross fare **after**
demand pricing and **after** the minimum-fare floor, so a surcharge is never
multiplied by surge and never swallowed by the minimum.

A quote with no surcharges is byte-identical to one computed before the change;
the ride and pricing test suites confirm it.

## Food

### A cart is a DRAFT order

There is no separate cart table. A cart is a `food_orders` row in `DRAFT` with
its lines in `food_order_items`. Checkout is a status transition, not a
translation between two models, and a half-built cart is already subject to
every constraint the schema enforces on a real order.

`food_orders_one_draft_per_user_restaurant` guarantees at most one open cart per
customer per restaurant.

### Checkout recalculates everything

The checkout DTO has **no total field**, and `forbidNonWhitelisted` rejects one
if sent. At checkout the server:

1. re-reads every line's price and availability from the live menu;
2. refuses the order naming the dishes that have sold out;
3. checks the restaurant is open and the address is inside its delivery radius,
   measured with PostGIS;
4. routes restaurant → address and prices the courier leg from the versioned
   `PARCEL`/`FOOD_DELIVERY` rule;
5. applies any promotion, capped;
6. computes the restaurant's commission and payout;
7. opens a payment, debiting a wallet immediately or leaving cash pending.

`food_orders_total_reconciles` and `food_orders_restaurant_split_reconciles`
reject the write if any of that arithmetic disagrees with itself.

### Two state machines, not one

`food_orders.status` tracks the **order**; `food_deliveries.status` tracks the
**courier**. They answer different questions and move independently: a courier
can claim a job while the kitchen is still cooking, and the order only becomes
`ASSIGNED` once the food is actually ready.

Legality and authority are checked separately
([`food-order.state.ts`](../services/api/src/food/food-order.state.ts)):
`FOOD_ORDER_TRANSITIONS` says what may follow what, `FOOD_ORDER_TRANSITION_ACTORS`
says who may cause it. That is why a restaurant cannot mark an order delivered
and a customer cannot mark one picked up — neither appears under those statuses —
and why calling endpoints out of order fails even for the right role.

## Parcel

Booking validates compatibility server-side: a parcel heavier than its class is
refused, and only vehicle classes at or above the class's minimum — ordered by
the same `sortOrder` customers see — are quoted. A 120 kg parcel is simply never
offered a bike, whatever the request asks for.

Every state change writes a `parcel_tracking` row. That trail is what the
sender's progress view reads.

## Courier assignment

`DeliveryAssignmentService` is a **candidate query, not an auto-dispatcher**. It
answers "who is genuinely able to do this job right now", nearest first, using
the same eligibility the ride dispatcher requires: approved, online, fresh
position, an active vehicle of a permitted class, and no other live job.

Jobs are offered to that shortlist and the first courier to accept wins.
Choosing *how* to allocate — broadcast, sequential offer, forced assignment,
batching — is a business decision the operator has not made, so the boundary is
drawn where a strategy can be swapped without rewriting eligibility.

## Concurrency

| Race | Resolution |
|---|---|
| Two couriers accept one food delivery | Guarded `UPDATE … WHERE driver_id IS NULL AND status = 'UNASSIGNED'`; the loser's statement affects zero rows |
| Two couriers accept one parcel | Same pattern, `WHERE driver_id IS NULL AND status IN ('PLACED','SEARCHING_DRIVER')` |
| One courier holds two jobs | `food_deliveries_one_active_per_driver` and `parcel_orders_one_active_per_driver` partial unique indexes, plus an explicit pre-check for a legible message |
| Two checkouts of one cart | The cart is re-read as `DRAFT` inside the transaction; the second finds nothing |
| Restaurant edits an order while a courier claims it | Both take a `FOR UPDATE` lock on their own row and validate the previous status |
| A promotion at its usage limit | `UPDATE … WHERE used_count < usage_limit` is atomic; `promotion_redemptions` is uniquely constrained per reference |

Demonstrated in [`evidence/delivery-race.txt`](../evidence/delivery-race.txt).

## Privacy

| Who | Sees |
|---|---|
| Customer | Their order, its progress, the courier's first name and rating. The courier's **phone only while the food is in transit** |
| Restaurant | The dishes, quantities and a customer first name. **Never** the delivery address or the customer's phone — the courier carries the food |
| Courier, before claiming | Collection point, distance and their own pay. **Not** the customer's exact address or phone |
| Courier, after claiming | Everything needed to deliver, and nothing else |
| Parcel sender | Full booking, and the tracking trail including recorded coordinates |
| Parcel courier | The trail **without** coordinates, and the receiver's details only once the job is theirs |

Verified in [`evidence/food-lifecycle.txt`](../evidence/food-lifecycle.txt) and
[`evidence/parcel-lifecycle.txt`](../evidence/parcel-lifecycle.txt).

## Notifications

`notifications.dedupe_key`, with a per-recipient partial unique index, makes a
repeat a silent no-op rather than a second buzz. Keys are derived from the event
(`food.order.accepted:<orderId>`), never from the request, so a retry, a
double-tap or a redelivered event all collapse to one.

Only the in-app channel is implemented. Rows carry the channel they are meant
for; a transport worker can pick up unsent rows later. That is recorded as a
limitation rather than mocked.

## Known limitations

- **No stock model.** `menu_items.available` is a boolean the kitchen toggles;
  there is no per-item quantity. Availability is re-checked inside the checkout
  transaction, so a sold-out dish cannot be ordered — but "the last two portions"
  is not a concept the schema has. Adding one is a product decision.
- **Push, SMS and email are not delivered**, only recorded.
- **Card and online payments are refused at booking** rather than accepted and
  never charged. Cash and wallet work end to end.
- **Rides still create payment rows inline** rather than through
  `PaymentsService`. Unifying them is a small, separate change that would touch
  verified settlement code, so it was left for its own review.
- **An admin who is not a member of a restaurant cannot open its portal.** Safe,
  but admin oversight of a specific restaurant needs its own endpoint.
