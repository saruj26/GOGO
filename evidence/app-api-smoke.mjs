/**
 * Verifies that the endpoints the two applications depend on actually work,
 * including the new ones added for this phase.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';

// Supplied by the environment so no credential lives in this file.
// Set it to the password used when seeding the administrator.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('Set ADMIN_PASSWORD to the seeded administrator password before running this.');
  process.exit(1);
}

let failures = 0;
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
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

const login = async (phone, password) => {
  const r = await call('/auth/login', { method: 'POST', body: { phone, password } });
  if (r.status !== 200) throw new Error(`login ${phone} failed: ${r.status} ${JSON.stringify(r.payload)}`);
  return r.payload.accessToken;
};

async function main() {
  console.log('APPLICATION API SMOKE TEST');
  console.log(`Started ${new Date().toISOString()}\n`);

  const customer = await login('+94770000002', 'DemoPassword123!');
  const admin = await login('+94770000500', ADMIN_PASSWORD);
  console.log('1. Signed in as a customer and an administrator\n');

  // ---- endpoints added for the customer application -----------------------
  console.log('2. Customer application endpoints:');

  const search = await call('/places/search?q=Jaffna&lat=9.66&lng=80.02', { token: customer });
  ok('address search returns results', search.status === 200 && search.payload.results.length > 0,
     `${search.payload?.results?.length} results, attribution "${search.payload?.attribution}"`);

  const reverse = await call('/places/reverse?lat=9.6615&lng=80.0255', { token: customer });
  ok('reverse lookup names a point', reverse.status === 200 && Boolean(reverse.payload.address),
     reverse.payload?.address?.slice(0, 60));

  const saved = await call('/places/saved', { method: 'POST', token: customer,
    body: { label: `Smoke ${Date.now()}`, address: '18 Kandy Road, Jaffna', lat: 9.672, lng: 80.035 } });
  ok('a place can be saved', saved.status === 201, JSON.stringify(saved.payload).slice(0, 80));
  if (saved.status === 201) {
    await call(`/places/saved/${saved.payload.id}`, { method: 'DELETE', token: customer });
  }

  const summary = await call('/account/summary', { token: customer });
  ok('account summary loads', summary.status === 200 && typeof summary.payload.rides === 'number',
     `${summary.payload?.rides} rides, wallet ${summary.payload?.wallet?.balance}`);

  const wallet = await call('/account/wallet', { token: customer });
  ok('wallet and ledger load', wallet.status === 200 && typeof wallet.payload.balance === 'string');

  const payments = await call('/account/payments', { token: customer });
  ok('payment history loads', payments.status === 200 && Array.isArray(payments.payload.items),
     `${payments.payload?.items?.length} payments`);

  const promotions = await call('/account/promotions', { token: customer });
  ok('available promotions load', promotions.status === 200 && Array.isArray(promotions.payload));

  const pendingRatings = await call('/ratings/pending', { token: customer });
  ok('pending ratings load', pendingRatings.status === 200 && Array.isArray(pendingRatings.payload.rides),
     `${pendingRatings.payload?.rides?.length} rides awaiting a rating`);

  const notifications = await call('/notifications?limit=5', { token: customer });
  ok('notifications load', notifications.status === 200 && Array.isArray(notifications.payload.items));

  // ---- admin application --------------------------------------------------
  console.log('\n3. Admin application endpoints:');

  const forbidden = await call('/admin/metrics/dashboard', { token: customer });
  ok('a customer cannot reach the admin API', forbidden.status === 403,
     `HTTP ${forbidden.status} ${forbidden.payload?.error?.code ?? ''}`);

  const dashboard = await call('/admin/metrics/dashboard', { token: admin });
  ok('dashboard metrics load', dashboard.status === 200 && typeof dashboard.payload.users.total === 'number');

  if (dashboard.status === 200) {
    const m = dashboard.payload;
    console.log(`     users ${m.users.total} · drivers ${m.drivers.total} (${m.drivers.onlineNow} online)`);
    console.log(`     rides today ${m.rides.today} (${m.rides.sharedToday} shared) · food ${m.food.today} · parcels ${m.parcels.today}`);
    console.log(`     commission this month LKR ${m.money.commissionThisMonth} · driver earnings to pay out LKR ${m.money.driverEarningsAwaitingPayout}`);
  }

  const trend = await call('/admin/metrics/revenue-trend?days=14', { token: admin });
  ok('revenue trend is gap-filled to 14 points', trend.status === 200 && trend.payload.length === 14);

  for (const [label, path] of [
    ['users', '/admin/users?page=1&limit=5'],
    ['drivers', '/admin/drivers?page=1&limit=5'],
    ['rides', '/admin/rides?page=1&limit=5'],
    ['restaurants', '/admin/restaurants?page=1&limit=5'],
    ['food orders', '/admin/food-orders?page=1&limit=5'],
    ['parcels', '/admin/parcels?page=1&limit=5'],
    ['payments', '/admin/payments?page=1&limit=5'],
    ['promotions', '/admin/promotions?page=1&limit=5'],
    ['audit logs', '/admin/audit-logs?page=1&limit=5'],
  ]) {
    const res = await call(path, { token: admin });
    const paginated = res.status === 200 && typeof res.payload.total === 'number' && Array.isArray(res.payload.items);
    ok(`${label} list is paginated`, paginated,
       paginated ? `${res.payload.items.length} of ${res.payload.total}` : `HTTP ${res.status}`);
  }

  const rules = await call('/admin/pricing-rules', { token: admin });
  ok('pricing rules load', rules.status === 200 && rules.payload.length > 0,
     `${rules.payload?.length} rules in force`);

  const settings = await call('/admin/settings', { token: admin });
  ok('settings load with their bounds', settings.status === 200 && settings.payload.length > 30,
     `${settings.payload?.length} runtime rules`);

  const withBounds = settings.payload?.find((s) => s.min !== null);
  ok('settings carry the range the UI should enforce', Boolean(withBounds),
     withBounds ? `${withBounds.key}: ${withBounds.min}–${withBounds.max}` : '');

  // ---- pricing is versioned, not edited in place ---------------------------
  console.log('\n4. Pricing change creates a new version:');

  const car = rules.payload?.find((r) => r.vehicleType?.code === 'CAR' && r.serviceType === 'RIDE');
  if (car) {
    const before = Number(car.passenger.baseFare);
    const updated = await call(`/admin/pricing-rules/${car.id}`, {
      method: 'PUT', token: admin, body: { baseFare: before + 1 },
    });
    ok('a pricing change is accepted', updated.status === 200, JSON.stringify(updated.payload));
    ok('it produces a new version', updated.payload?.version === car.version + 1,
       `version ${car.version} → ${updated.payload?.version}`);

    // Put it back so the environment is left as it was found.
    const after = await call('/admin/pricing-rules', { token: admin });
    const current = after.payload?.find((r) => r.vehicleType?.code === 'CAR' && r.serviceType === 'RIDE');
    if (current) {
      await call(`/admin/pricing-rules/${current.id}`, {
        method: 'PUT', token: admin, body: { baseFare: before },
      });
    }
  }

  // ---- the audit trail recorded it ---------------------------------------
  const audit = await call('/admin/audit-logs?action=admin.pricing.update&limit=3', { token: admin });
  ok('the pricing change was audited', audit.status === 200 && audit.payload.items.length > 0,
     `${audit.payload?.items?.length} entries`);

  const entry = audit.payload?.items?.[0];
  ok('the audit entry names the administrator', Boolean(entry?.actor?.name),
     entry?.actor?.name);
  ok('the audit entry contains no credential', 
     !JSON.stringify(entry ?? {}).match(/password|token|secret|DATABASE_URL/i));

  console.log(`\n${failures === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: FAILURES PRESENT'}`);
  console.log(`Finished ${new Date().toISOString()}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('Aborted:', e.message); process.exitCode = 1; });
