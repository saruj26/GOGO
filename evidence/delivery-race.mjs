/**
 * §14 — concurrent acceptance must resolve to exactly one courier.
 *
 * Two couriers are shown the same food delivery and both press accept at the
 * same moment. The guarantee has two independent layers:
 *
 *   1. the claim is a single guarded UPDATE that only matches while the delivery
 *      is still unassigned, so the loser's statement affects zero rows;
 *   2. `food_deliveries_one_active_per_driver` — a partial unique index added in
 *      this phase — refuses a second live job for one courier outright.
 *
 * The second guarantee is demonstrated separately: the winner is then offered
 * another job and must be refused.
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

const DELIVERY_ADDRESS = { lat: 9.6720, lng: 80.0350, address: '18 Kandy Road, Jaffna' };

/** Places an order and gets it to the point a courier can claim it. */
async function orderReadyForCourier(customer, owner) {
  const restaurants = await call('/restaurants?openOnly=true', { token: customer });
  const restaurant = restaurants.payload.items.find((r) => r.slug === 'jaffna-kitchen');

  await call(`/food/carts/${restaurant.id}`, { method: 'DELETE', token: customer });

  const detail = await call(`/restaurants/${restaurant.id}`, { token: customer });
  const item = detail.payload.categories.flatMap((c) => c.items).find((i) => i.available);

  await call('/food/carts/items', {
    method: 'POST', token: customer, body: { menuItemId: item.id, quantity: 1 },
  });

  const order = await call(`/food/carts/${restaurant.id}/checkout`, {
    method: 'POST', token: customer,
    body: { deliveryAddress: DELIVERY_ADDRESS, paymentMethod: 'CASH' },
  });

  if (order.status !== 201) throw new Error(`checkout failed: ${JSON.stringify(order.payload)}`);

  await call(`/restaurant-portal/${restaurant.id}/orders/${order.payload.orderId}/accept`, {
    method: 'POST', token: owner, body: { prepMinutes: 15 },
  });

  return { restaurantId: restaurant.id, orderId: order.payload.orderId, reference: order.payload.reference };
}

async function main() {
  log('CONCURRENT DELIVERY ACCEPTANCE — two couriers, one job');
  log(`Started ${new Date().toISOString()}`);
  log('');

  const customer = await login('+94770000002');
  const owner = await login('+94770000200');
  const courierOne = await login('+94770000099'); // Kumar, car
  const courierTwo = await login('+94770000098'); // Vasanth, bike

  // Both couriers must be free and online for the race to be meaningful.
  for (const [token, lat, lng] of [
    [courierOne, 9.6642, 80.0292],
    [courierTwo, 9.6648, 80.0298],
  ]) {
    const active = await call('/rides/driver/active', { token });
    if (active.payload) {
      await call(`/rides/${active.payload.id}/cancel`, {
        method: 'POST', token, body: { reason: 'Race test reset' },
      });
    }

    // A courier still holding a delivery from a previous run releases it, using
    // the same endpoint a real courier would.
    const job = await call('/food/deliveries/current', { token });
    if (job.payload) {
      await call(`/food/deliveries/${job.payload.deliveryId}/release`, {
        method: 'POST', token, body: { reason: 'Race test reset' },
      });
    }
    const parcelJob = await call('/parcels/jobs/current', { token });
    if (parcelJob.payload) {
      await call(`/parcels/jobs/${parcelJob.payload.parcelId}/release`, {
        method: 'POST', token, body: { reason: 'Race test reset' },
      });
    }
    await call('/drivers/me/availability', {
      method: 'PUT', token, body: { presence: 'ONLINE', acceptsFood: true },
    });
    await call('/drivers/me/location', { method: 'POST', token, body: { lat, lng } });
  }
  log('1. Two couriers online near the restaurant, both free');

  const order = await orderReadyForCourier(customer, owner);
  log(`2. Order ${order.reference} placed and accepted by the kitchen`);

  const [offersOne, offersTwo] = await Promise.all([
    call('/food/deliveries/available', { token: courierOne }),
    call('/food/deliveries/available', { token: courierTwo }),
  ]);

  const jobOne = offersOne.payload?.find?.((j) => j.orderId === order.orderId);
  const jobTwo = offersTwo.payload?.find?.((j) => j.orderId === order.orderId);

  ok('both couriers are offered the same job', jobOne !== undefined && jobTwo !== undefined,
     `one=${jobOne?.deliveryId} two=${jobTwo?.deliveryId}`);
  ok('it is genuinely the same delivery', jobOne?.deliveryId === jobTwo?.deliveryId);

  const deliveryId = jobOne.deliveryId;
  log(`3. Both couriers see delivery ${deliveryId}`);

  // The race: dispatched together, neither waiting for the other.
  const [claimOne, claimTwo] = await Promise.all([
    call(`/food/deliveries/${deliveryId}/accept`, { method: 'POST', token: courierOne }),
    call(`/food/deliveries/${deliveryId}/accept`, { method: 'POST', token: courierTwo }),
  ]);

  log('');
  log(`  courier 1 (Kumar)   → HTTP ${claimOne.status} ${claimOne.payload?.error?.code ?? 'claimed'}`);
  log(`  courier 2 (Vasanth) → HTTP ${claimTwo.status} ${claimTwo.payload?.error?.code ?? 'claimed'}`);
  log('');

  const statuses = [claimOne.status, claimTwo.status];
  ok('exactly one courier got the job', statuses.filter((s) => s === 200).length === 1,
     `${statuses.filter((s) => s === 200).length} succeeded`);
  ok('the other was refused with a conflict', statuses.filter((s) => s === 409).length === 1,
     `${statuses.filter((s) => s === 409).length} refused`);

  const loser = claimOne.status === 409 ? claimOne : claimTwo;
  ok('the refusal explains why', loser.payload?.error?.code === 'CONFLICT',
     loser.payload?.error?.message ?? 'none');

  // The database must agree with the API.
  const winnerToken = claimOne.status === 200 ? courierOne : courierTwo;
  const loserToken = claimOne.status === 200 ? courierTwo : courierOne;

  const winnerJob = await call('/food/deliveries/current', { token: winnerToken });
  const loserJob = await call('/food/deliveries/current', { token: loserToken });

  ok('the winner is carrying the delivery', winnerJob.payload?.deliveryId === deliveryId);
  ok('the loser is carrying nothing', loserJob.payload === null, JSON.stringify(loserJob.payload));

  // ---- one live job per courier -------------------------------------------
  log('4. Now offering the winner a second job while they are still working');

  const second = await orderReadyForCourier(customer, owner);
  const winnerOffers = await call('/food/deliveries/available', { token: winnerToken });

  ok('a courier already on a job is not offered another',
     winnerOffers.status === 400 && winnerOffers.payload?.error?.code === 'DRIVER_UNAVAILABLE',
     winnerOffers.payload?.error?.message ?? `HTTP ${winnerOffers.status}`);

  // And if they try to claim one directly anyway, the storage layer refuses.
  const loserOffers = await call('/food/deliveries/available', { token: loserToken });
  const secondJob = loserOffers.payload?.find?.((j) => j.orderId === second.orderId);

  if (secondJob) {
    const sneak = await call(`/food/deliveries/${secondJob.deliveryId}/accept`, {
      method: 'POST', token: winnerToken,
    });
    ok('claiming a second job directly is refused with a clear reason',
       sneak.status === 409 && sneak.payload?.error?.code === 'CONFLICT',
       `HTTP ${sneak.status} ${sneak.payload?.error?.message ?? ''}`);
  }

  log('');
  log(failures === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: FAILURES PRESENT');
  log(`Finished ${new Date().toISOString()}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('Aborted:', e.message); process.exitCode = 1; });
