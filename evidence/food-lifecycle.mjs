/**
 * End-to-end verification of the food ordering and delivery module against a
 * running API and the real database.
 *
 * Covers the customer, restaurant and courier paths, plus the authorization and
 * price-integrity cases the brief calls out.
 *
 * Requires the API running and SEED_DEMO=true data.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'DemoPassword123!';

let failures = 0;
const log = (line) => console.log(line);
const ok = (label, condition, detail = '') => {
  log(`${condition ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, payload };
}

const login = async (phone) => {
  const r = await call('/auth/login', { method: 'POST', body: { phone, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${phone} failed: ${r.status}`);
  return r.payload.accessToken;
};

const DELIVERY_ADDRESS = {
  lat: 9.6720, lng: 80.0350, address: '18 Kandy Road, Jaffna',
};

async function main() {
  log('FOOD ORDERING AND DELIVERY — end to end');
  log(`Started ${new Date().toISOString()}`);
  log('');

  const customer = await login('+94770000002');   // Bavan
  const otherCustomer = await login('+94770000003'); // Chandran — for the IDOR check
  const owner = await login('+94770000200');      // Meena, restaurant owner
  const courier = await login('+94770000098');    // Vasanth, bike courier
  log('1. Authenticated a customer, a restaurant owner and a courier');

  // The courier may be holding work from another module's run. Release it the
  // way a real courier would, so this scenario starts from a clean slate.
  for (const token of [courier]) {
    const foodJob = await call('/food/deliveries/current', { token });
    if (foodJob.payload) {
      await call(`/food/deliveries/${foodJob.payload.deliveryId}/release`, {
        method: 'POST', token, body: { reason: 'Scenario reset' },
      });
    }
    const parcelJob = await call('/parcels/jobs/current', { token });
    if (parcelJob.payload) {
      await call(`/parcels/jobs/${parcelJob.payload.parcelId}/release`, {
        method: 'POST', token, body: { reason: 'Scenario reset' },
      });
    }
    const ride = await call('/rides/driver/active', { token });
    if (ride.payload) {
      await call(`/rides/${ride.payload.id}/cancel`, {
        method: 'POST', token, body: { reason: 'Scenario reset' },
      });
    }
  }


  // Clear anything a previous run left behind.
  const stale = await call('/food/carts', { token: customer });
  for (const cart of stale.payload ?? []) {
    await call(`/food/carts/${cart.restaurant.id}`, { method: 'DELETE', token: customer });
  }

  // ---- browse ------------------------------------------------------------
  const browse = await call(`/restaurants?lat=${DELIVERY_ADDRESS.lat}&lng=${DELIVERY_ADDRESS.lng}&openOnly=true`, { token: customer });
  ok('restaurants are listed with real distance', browse.status === 200 && browse.payload.items.length > 0,
     browse.status === 200 ? '' : JSON.stringify(browse.payload));

  const listed = browse.payload.items.find((r) => r.slug === 'jaffna-kitchen');
  ok('the demo restaurant is reachable from the delivery address', listed?.withinDeliveryRange === true,
     `distance ${listed?.distanceM} m`);
  log('');
  log(`2. Browsing from the delivery address: ${listed.name}, ${listed.distanceM} m away, rating ${listed.rating.average}`);

  const detail = await call(`/restaurants/${listed.slug}`, { token: customer });
  ok('the menu loads', detail.status === 200 && detail.payload.categories.length >= 2);

  const allItems = detail.payload.categories.flatMap((c) => c.items);
  const curry = allItems.find((i) => i.name.includes('crab'));
  const vadai = allItems.find((i) => i.name.includes('Vadai'));
  const soldOut = allItems.find((i) => i.available === false);

  ok('a sold-out dish is shown rather than hidden', soldOut !== undefined, soldOut?.name);
  log(`3. Menu has ${allItems.length} dishes; "${soldOut.name}" is marked unavailable`);

  // ---- cart --------------------------------------------------------------
  const restaurantId = detail.payload.id;

  const addSoldOut = await call('/food/carts/items', {
    method: 'POST', token: customer,
    body: { menuItemId: soldOut.id, quantity: 1 },
  });
  ok('an unavailable dish cannot be added to the cart',
     addSoldOut.status === 400 && addSoldOut.payload?.error?.code === 'MENU_ITEM_UNAVAILABLE',
     addSoldOut.payload?.error?.code ?? `HTTP ${addSoldOut.status}`);

  const badQuantity = await call('/food/carts/items', {
    method: 'POST', token: customer,
    body: { menuItemId: curry.id, quantity: 0 },
  });
  ok('a zero quantity is rejected by validation', badQuantity.status === 400);

  await call('/food/carts/items', { method: 'POST', token: customer, body: { menuItemId: curry.id, quantity: 2 } });
  const cart = await call('/food/carts/items', {
    method: 'POST', token: customer,
    body: { menuItemId: vadai.id, quantity: 3, notes: 'Extra crispy' },
  });

  ok('the cart totals the lines server-side', cart.status === 201 && cart.payload.itemsSubtotal === '3260.00',
     `subtotal ${cart.payload?.itemsSubtotal} (expected 2 × 1450 + 3 × 120)`);
  ok('the cart knows the minimum order is met', cart.payload.meetsMinimum === true);
  log('');
  log(`4. Cart: ${cart.payload.items.length} lines, subtotal LKR ${cart.payload.itemsSubtotal}`);

  const updated = await call(`/food/carts/items/${cart.payload.items.find((i) => i.name.includes('Vadai')).id}`, {
    method: 'PUT', token: customer, body: { quantity: 1 },
  });
  ok('changing a quantity re-totals the cart', updated.payload.itemsSubtotal === '3020.00',
     `subtotal ${updated.payload.itemsSubtotal}`);

  // ---- checkout ----------------------------------------------------------
  const foreignCart = await call(`/food/carts/${restaurantId}`, { token: otherCustomer });
  ok('another customer cannot read this cart', foreignCart.status === 404, `HTTP ${foreignCart.status}`);

  const checkout = await call(`/food/carts/${restaurantId}/checkout`, {
    method: 'POST', token: customer,
    body: {
      deliveryAddress: DELIVERY_ADDRESS,
      paymentMethod: 'CASH',
      deliveryNote: 'Blue gate, second floor',
      // A tampered total is sent deliberately. The DTO rejects unknown fields.
      total: '1.00',
    },
  });
  ok('a client-supplied total is refused outright', checkout.status === 400,
     checkout.payload?.error?.message ?? `HTTP ${checkout.status}`);

  const realCheckout = await call(`/food/carts/${restaurantId}/checkout`, {
    method: 'POST', token: customer,
    body: { deliveryAddress: DELIVERY_ADDRESS, paymentMethod: 'CASH', deliveryNote: 'Blue gate' },
  });
  ok('the order is placed', realCheckout.status === 201,
     realCheckout.status === 201 ? '' : JSON.stringify(realCheckout.payload));

  const orderId = realCheckout.payload.orderId;
  const charge = realCheckout.payload.charge;
  log('');
  log(`5. Order ${realCheckout.payload.reference} placed:`);
  log(`     food        LKR ${charge.itemsSubtotal}`);
  log(`     delivery    LKR ${charge.deliveryFee}`);
  log(`     total       LKR ${charge.total}`);
  log(`     ready in ~${realCheckout.payload.estimatedPrepMinutes} min, delivered in ~${realCheckout.payload.estimatedDeliveryMinutes} min`);

  ok('the charge is the server’s arithmetic, not the client’s',
     charge.itemsSubtotal === '3020.00' &&
     Number(charge.total) === Number(charge.itemsSubtotal) + Number(charge.deliveryFee) + Number(charge.serviceFee) + Number(charge.tax) - Number(charge.discount),
     `total ${charge.total}`);

  // ---- authorization on the order ----------------------------------------
  const foreignOrder = await call(`/food/orders/${orderId}`, { token: otherCustomer });
  ok('another customer cannot read the order', foreignOrder.status === 404, `HTTP ${foreignOrder.status}`);

  // ---- restaurant side ---------------------------------------------------
  const wrongActor = await call(`/restaurant-portal/${restaurantId}/orders/${orderId}/accept`, {
    method: 'POST', token: customer, body: {},
  });
  ok('a customer cannot accept their own order', wrongActor.status === 403,
     `HTTP ${wrongActor.status} ${wrongActor.payload?.error?.code ?? ''}`);

  const active = await call(`/restaurant-portal/${restaurantId}/orders/active`, { token: owner });
  ok('the restaurant sees the new order', active.status === 200 && active.payload.some((o) => o.id === orderId));
  ok('the restaurant is not shown the customer’s address or phone',
     !JSON.stringify(active.payload).includes('Kandy Road') && !JSON.stringify(active.payload).includes('+9477'));

  const accept = await call(`/restaurant-portal/${restaurantId}/orders/${orderId}/accept`, {
    method: 'POST', token: owner, body: { prepMinutes: 20 },
  });
  ok('the restaurant accepts the order', accept.status === 201 || accept.status === 200,
     JSON.stringify(accept.payload));
  log('');
  log(`6. Restaurant accepted, promising ${accept.payload.prepMinutes} minutes`);

  const outOfOrder = await call(`/restaurant-portal/${restaurantId}/orders/${orderId}/ready`, {
    method: 'POST', token: owner,
  });
  ok('the kitchen cannot skip straight from accepted to ready',
     outOfOrder.status === 400 && outOfOrder.payload?.error?.code === 'ORDER_NOT_MODIFIABLE',
     outOfOrder.payload?.error?.message ?? `HTTP ${outOfOrder.status}`);

  await call(`/restaurant-portal/${restaurantId}/orders/${orderId}/preparing`, { method: 'POST', token: owner });
  const lateCancel = await call(`/food/orders/${orderId}/cancel`, {
    method: 'POST', token: customer, body: { reason: 'Changed my mind' },
  });
  ok('a customer cannot cancel once the kitchen is cooking',
     lateCancel.status === 400 && lateCancel.payload?.error?.code === 'CANCELLATION_NOT_ALLOWED',
     lateCancel.payload?.error?.code ?? `HTTP ${lateCancel.status}`);
  log('7. Cooking started; the cancellation window has closed');

  // ---- courier side ------------------------------------------------------
  await call('/drivers/me/availability', {
    method: 'PUT', token: courier, body: { presence: 'ONLINE', acceptsFood: true },
  });
  await call('/drivers/me/location', { method: 'POST', token: courier, body: { lat: 9.6645, lng: 80.0295 } });

  const jobs = await call('/food/deliveries/available', { token: courier });
  ok('the courier is offered the job', jobs.status === 200 && jobs.payload.some((j) => j.orderId === orderId),
     jobs.status === 200 ? `${jobs.payload.length} job(s)` : JSON.stringify(jobs.payload));

  const job = jobs.payload.find((j) => j.orderId === orderId);
  ok('the offer shows what the courier will be paid, not what the customer pays',
     job.yourEarning !== null && Number(job.yourEarning) < Number(charge.total),
     `earning ${job.yourEarning} vs customer total ${charge.total}`);
  ok('the offer withholds the customer’s exact address until the job is taken',
     !JSON.stringify(job).includes('Blue gate'));

  const claim = await call(`/food/deliveries/${job.deliveryId}/accept`, { method: 'POST', token: courier });
  ok('the courier claims the job', claim.status === 200, JSON.stringify(claim.payload));
  log('');
  log(`8. Courier claimed the delivery; earning LKR ${job.yourEarning}`);

  const earlyPickup = await call(`/food/deliveries/${job.deliveryId}/pickup`, { method: 'POST', token: courier });
  ok('the courier cannot collect food that is not ready',
     earlyPickup.status === 400 && earlyPickup.payload?.error?.code === 'ORDER_NOT_MODIFIABLE',
     earlyPickup.payload?.error?.message ?? `HTTP ${earlyPickup.status}`);

  await call(`/restaurant-portal/${restaurantId}/orders/${orderId}/ready`, { method: 'POST', token: owner });
  log('9. Kitchen marked the order ready');

  const current = await call('/food/deliveries/current', { token: courier });
  ok('now the courier gets the delivery address and customer phone',
     current.payload?.deliverTo?.address?.includes('Kandy Road') && current.payload.deliverTo.phone !== null);
  ok('the courier is told how much cash to collect',
     current.payload.cashToCollect === charge.total, `${current.payload.cashToCollect}`);

  await call(`/food/deliveries/${job.deliveryId}/heading-to-pickup`, { method: 'POST', token: courier });
  await call(`/food/deliveries/${job.deliveryId}/arrived`, { method: 'POST', token: courier });
  await call(`/food/deliveries/${job.deliveryId}/pickup`, { method: 'POST', token: courier });
  await call(`/food/deliveries/${job.deliveryId}/delivering`, { method: 'POST', token: courier });

  const tracking = await call(`/food/orders/${orderId}/tracking`, { token: customer });
  ok('the customer can follow the progress', tracking.status === 200 && tracking.payload.steps.length >= 5,
     `${tracking.payload?.steps?.length} steps, now ${tracking.payload?.status}`);
  log(`10. Tracking shows ${tracking.payload.steps.length} steps; currently ${tracking.payload.status}`);

  const deliver = await call(`/food/deliveries/${job.deliveryId}/deliver`, { method: 'POST', token: courier });
  ok('the delivery completes', deliver.status === 200, JSON.stringify(deliver.payload));

  const final = await call(`/food/orders/${orderId}`, { token: customer });
  ok('the order is delivered', final.payload.status === 'DELIVERED');
  ok('the cash payment is settled at the door, not before',
     final.payload.payment.status === 'PAID', final.payload.payment?.status);
  log('');
  log(`11. Delivered. Courier earned LKR ${deliver.payload.yourEarning}; customer paid LKR ${final.payload.charge.total}`);

  ok('courier pay and customer charge are different numbers',
     deliver.payload.yourEarning !== final.payload.charge.total);

  // ---- restaurant takings -------------------------------------------------
  const takings = await call(`/restaurant-portal/${restaurantId}/earnings`, { token: owner });
  ok('the restaurant sees its own takings and commission', takings.status === 200 && Number(takings.payload.orders) >= 1,
     `${takings.payload?.orders} order(s), payout LKR ${takings.payload?.payout}`);
  log(`12. Restaurant takings: ${takings.payload.orders} order(s), food LKR ${takings.payload.foodSales}, ` +
      `commission LKR ${takings.payload.platformCommission}, payout LKR ${takings.payload.payout}`);

  const foreignPortal = await call(`/restaurant-portal/${restaurantId}/orders/active`, { token: courier });
  ok('a courier cannot open the restaurant portal', foreignPortal.status === 403 || foreignPortal.status === 404,
     `HTTP ${foreignPortal.status}`);

  // ---- notifications ------------------------------------------------------
  const notes = await call('/notifications', { token: customer });
  const forThisOrder = (notes.payload?.items ?? []).filter((n) => n.data?.orderId === orderId);
  ok('the customer was notified at each milestone', forThisOrder.length >= 4,
     `${forThisOrder.length} notifications`);

  const types = forThisOrder.map((n) => n.type);
  ok('no milestone was notified twice', new Set(types).size === types.length,
     types.join(', '));
  log(`13. ${forThisOrder.length} notifications, all distinct: ${types.join(', ')}`);

  log('');
  log(failures === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: FAILURES PRESENT');
  log(`Finished ${new Date().toISOString()}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('Aborted:', e.message); process.exitCode = 1; });
