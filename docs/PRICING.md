# Pricing, driver earnings and commission

## Two calculations, not one

The **passenger charge** and the **driver earning** are computed independently
from the same rule version. Neither is derived from the other.

This is the whole design. It means a promotional discount given to a passenger
cannot silently reduce a driver's pay, a driver bonus cannot silently inflate a
passenger's bill, and the two can be reconciled separately when either is
disputed.

```
PASSENGER                                DRIVER
  gross fare                               driver gross (= the metered fare)
− discounts                              − platform commission
+ service fee                            + additional-stop payments
+ tax                                    + minimum-earning top-up
= what the passenger pays                = what the driver is paid
```

## Rounding

Every component is rounded to two decimal places **as it is produced**, and
totals are the sum of already-rounded components. Rounding a total independently
would break the reconciliation, which the database enforces:

```sql
CHECK (passenger_total = gross_fare - discount_total + service_fee + tax_total)
CHECK (driver_net = driver_gross - platform_commission + driver_stop_fees + driver_bonus)
CHECK (net_amount = gross_amount - commission_amount + stop_fee_amount + bonus_amount + adjustment_amount)
```

All money is `NUMERIC(14,2)` and all arithmetic uses exact decimals. No monetary
value ever touches floating point.

## Passenger charge

| Component | Source |
|---|---|
| `BASE_FARE` | `pricing_rules.base_fare` |
| `DISTANCE_FARE` | `per_km_fare` × route kilometres |
| `TIME_FARE` | `per_minute_fare` × route minutes |
| `WAITING_FEE` | `waiting_per_minute_fee` × minutes beyond `free_waiting_minutes` |
| `ADDITIONAL_STOP_FEE` | `additional_stop_fee` × extra stops |
| `SURGE_ADJUSTMENT` | applied to the metered subtotal only, never to fixed fees |
| `MINIMUM_FARE_TOP_UP` | brings the total up to `minimum_fare` if short |
| `BOOKING_FEE` | flat, not multiplied by surge |
| `SHARED_RIDE_DISCOUNT` | `shared_discount_pct` of the gross fare |
| `PROMOTION_DISCOUNT` | percentage or fixed, honouring the promotion's own cap |
| `DISCOUNT_CAP_ADJUSTMENT` | claws back anything beyond `max_passenger_discount_pct` |
| `SERVICE_FEE` | `service_fee_pct` of the discounted fare |
| `TAX` | `tax_pct` of fare plus service fee |

Demand pricing is off by default and, when enabled, is clamped to
`pricing.surge_max_multiplier`.

## Driver earning

The driver earns on the **metered fare**, not on what the passenger finally pays.
Promotional discounts are a platform marketing cost; the service fee and tax are
never the driver's revenue.

```
driver_gross        = gross fare
platform_commission = commission_pct × driver_gross
driver_net          = driver_gross − platform_commission
                      + additional-stop payments
                      + minimum-earning top-up
```

### The shared-passenger split

A passenger who **joins an already-planned route** is treated differently,
because the driver was making that journey anyway. For them,
`sharedPassengerDriverSharePct` replaces the standard commission:

```
commission_pct = 100 − shared_passenger_driver_share_pct
```

So with a 10% share on a LKR 2,000 shared fare, the driver receives LKR 200 and
the platform LKR 1,800 — the economics §6 of the specification describes. **The
share is a configuration value, not a constant**: raising it to 40% pays the
driver LKR 800 from the same fare, with no code change.

The original passenger on a ride is priced normally, so a driver's base earning
is unaffected by whom they later pick up.

### Minimum earning

If `driver_net` would fall below `minimum_driver_earning`, the platform adds a
`DRIVER_MINIMUM_TOP_UP` bonus. The top-up is a separate, visible component — the
commission is never quietly reduced to hide it.

## Worked example, from the running system

Northern-province corridor, 38.7 km, car:

| | |
|---|---|
| Passenger A, Jaffna → Point Pedro | pays **LKR 2,162.08** |
| Passenger B, Kopay → Nelliyady | pays **LKR 1,254.83**, saving **LKR 489.03** vs a solo car |
| Driver net for the trip | **LKR 1,056.26** |

Passenger B is charged only for the legs between their own pickup and their own
drop-off, not for the driver's whole itinerary. Recorded in
[`evidence/shared-ride-scenario.txt`](../evidence/shared-ride-scenario.txt).

## Rules are versioned, never edited in place

A pricing change closes the current row (`effective_to`) and inserts a new
version. `pricing_rules_one_active` — a partial unique index — guarantees exactly
one open rule per (service type, vehicle type). Every `fare_quotes` row records
the rule id and version that produced it, alongside the full ordered component
breakdown and the raw inputs, so any historical fare can be recomputed exactly.

## Rule resolution

Most specific first: service + vehicle type → service (any vehicle) →
`RIDE` + vehicle type → `RIDE` (any vehicle). The `RIDE` fallbacks let an
operator run shared rides without maintaining a separate rule set until they
want one.

## Trust boundary

Fares are computed server-side and persisted as an immutable `fare_quotes` row.
A client cannot supply a fare; a fare sent in a request body is rejected by the
validation pipe. What a passenger is charged comes from the persisted quote, and
settlement at trip completion reads that quote rather than recomputing — so a
pricing change mid-trip cannot alter what somebody was quoted.
