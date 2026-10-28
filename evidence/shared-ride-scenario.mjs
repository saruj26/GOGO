/**
 * End-to-end verification of the specification's worked shared-ride scenario
 * (§33) against a running API and the real database.
 *
 * Run with the API on http://localhost:4000 and demo data seeded
 * (SEED_DEMO=true npm run db:seed -w @rideflow/api).
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'DemoPassword123!';

const out = [];
const log = (line) => { console.log(line); out.push(line); };
const ok = (label, condition, detail = '') => {
  log(`${condition ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, payload };
}

const login = async (phone) => {
  const r = await call('/auth/login', { method: 'POST', body: { phone, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${phone} failed: ${r.status} ${JSON.stringify(r.payload)}`);
  return r.payload.accessToken;
};

const place = (lat, lng, address) => ({ lat, lng, address });
const JAFFNA = place(9.6615, 80.0255, 'Jaffna Bus Stand');
const KOPAY = place(9.7167, 80.05, 'Kopay Junction');
const CHAVAKACHCHERI = place(9.7405, 80.115, 'Chavakachcheri Town');
const NELLIYADY = place(9.7833, 80.1833, 'Nelliyady Market');
const POINT_PEDRO = place(9.8167, 80.2333, 'Point Pedro');
const MANNAR = place(8.9772, 79.9047, 'Mannar');

async function main() {
  log('SHARED RIDE SCENARIO — Jaffna → Kopay → Chavakachcheri → Nelliyady → Point Pedro');
  log(`Started ${new Date().toISOString()}`);
  log('');

  const driver = await login('+94770000099');   // Kumar, approved, shared opt-in
  const ananthi = await login('+94770000001');  // female, WOMEN_ONLY
  const bavan = await login('+94770000002');    // male, ANY
  const chandran = await login('+94770000003'); // male, ANY
  log('1. Authenticated one driver and three passengers');

  // The scenario must be repeatable: clear any ride left running by a previous
  // run, using the same API a real driver would.
  // The driver may be holding delivery work from another module's run; release
  // it the way a real courier would, so this scenario starts from a clean slate.
  const foodJob = await call('/food/deliveries/current', { token: driver });
  if (foodJob.payload) {
    await call(`/food/deliveries/${foodJob.payload.deliveryId}/release`, {
      method: 'POST', token: driver, body: { reason: 'Scenario reset' },
    });
  }
  const parcelJob = await call('/parcels/jobs/current', { token: driver });
  if (parcelJob.payload) {
    await call(`/parcels/jobs/${parcelJob.payload.parcelId}/release`, {
      method: 'POST', token: driver, body: { reason: 'Scenario reset' },
    });
  }

  const active = await call('/rides/driver/active', { token: driver });
  if (active.payload) {
    await call(`/rides/${active.payload.id}/cancel`, {
      method: 'POST', token: driver, body: { reason: 'Scenario reset' },
    });
    log(`   (cleared a ride left active by a previous run: ${active.payload.reference})`);
  }

  // ---- vehicle catalogue via the estimate endpoint -----------------------
  const estimate = await call('/rides/estimate', {
    method: 'POST', token: bavan,
    body: { pickup: JAFFNA, dropoff: POINT_PEDRO },
  });
  ok('fare estimate returned for every vehicle class', estimate.status === 200 && estimate.payload.length >= 4);
  const car = estimate.payload.find((v) => v.code === 'CAR');
  log('');
  log('2. Solo fare estimates, Jaffna → Point Pedro:');
  for (const v of estimate.payload) {
    log(`     ${v.name.padEnd(9)} ${(v.distanceM / 1000).toFixed(1)} km  ${Math.round(v.durationS / 60)} min  ` +
        `solo LKR ${v.soloFare}` + (v.sharedFareFrom ? `  shared from LKR ${v.sharedFareFrom} (save ${v.sharedSaving})` : '  (no sharing)'));
  }

  // ---- the driver declares the journey they are making --------------------
  await call('/drivers/me/availability', {
    method: 'PUT', token: driver,
    body: { presence: 'ONLINE', acceptsShared: true },
  });

  const journey = await call('/rides/driver/planned-journey', {
    method: 'POST', token: driver,
    body: {
      origin: JAFFNA,
      waypoints: [KOPAY, CHAVAKACHCHERI, NELLIYADY],
      destination: POINT_PEDRO,
      seatsOffered: 4,
    },
  });
  ok('driver declared a planned journey along the corridor', journey.status === 201,
     journey.status === 201 ? '' : JSON.stringify(journey.payload));
  const rideId = journey.payload.rideId;
  log('');
  log(`3. Driver Kumar declared: Jaffna → Kopay → Chavakachcheri → Nelliyady → Point Pedro`);
  log(`     ride ${journey.payload.reference}, ${(journey.payload.route.distanceM / 1000).toFixed(1)} km, ` +
      `${Math.round(journey.payload.route.durationS / 60)} min, ${journey.payload.seatsOffered} seats offered`);

  // A live ride is only offered while the driver's position is fresh, so a
  // real driver app pings continuously. This helper stands in for that.
  const ping = () => call('/drivers/me/location', {
    method: 'POST', token: driver,
    body: { lat: JAFFNA.lat, lng: JAFFNA.lng, headingDeg: 45, speedKph: 30 },
  });
  await ping();

  // ---- passenger A joins for the full length -----------------------------
  const searchA = await call('/rides/shared/search', {
    method: 'POST', token: bavan,
    body: { pickup: JAFFNA, dropoff: POINT_PEDRO, seats: 1 },
  });
  ok('passenger A was offered the journey', searchA.status === 200 && searchA.payload.offers?.length === 1,
     searchA.status === 200 ? `offers=${searchA.payload.offers?.length} ${searchA.payload.noMatchReason ?? ''}`
                            : JSON.stringify(searchA.payload));

  const joinA = await call('/rides/shared/join', {
    method: 'POST', token: bavan,
    body: { requestId: searchA.payload.requestId, rideId },
  });
  ok('passenger A joined', joinA.status === 201, JSON.stringify(joinA.payload));
  log('');
  log(`4. Passenger A (Bavan) Jaffna → Point Pedro joined: LKR ${joinA.payload?.fare}`);

  // ---- passenger B searches: Kopay → Nelliyady ---------------------------
  await ping();
  const searchB = await call('/rides/shared/search', {
    method: 'POST', token: chandran,
    body: { pickup: KOPAY, dropoff: NELLIYADY, seats: 1 },
  });
  ok('passenger B was offered the ride', searchB.status === 200 && searchB.payload.offers.length === 1,
     searchB.status === 200 ? `offers=${searchB.payload?.offers?.length} reason=${searchB.payload?.noMatchReason ?? '-'}` : `HTTP ${searchB.status} ${JSON.stringify(searchB.payload)}`);

  const offerB = searchB.payload.offers?.[0];
  log('');
  log('5. Passenger B (Chandran) searched Kopay → Nelliyady:');
  if (offerB) {
    log(`     offered ride ${offerB.reference} with ${offerB.driver.firstName}` +
        `  walk ${offerB.pickupWalkMeters} m to pickup, ${offerB.dropoffWalkMeters} m from drop-off`);
    log(`     fare LKR ${offerB.fare.total}, saving LKR ${offerB.saving}, match quality ${offerB.matchQuality}/100`);
    log(`     co-passengers already aboard: ${offerB.coPassengerCount}, seats free: ${offerB.seatsAvailable}`);
    ok('the offer hides co-passenger identities', !JSON.stringify(offerB).includes('Bavan'));
    ok('the offer hides gender data', !/gender/i.test(JSON.stringify(offerB)));
  }

  const joinB = await call('/rides/shared/join', {
    method: 'POST', token: chandran,
    body: { requestId: searchB.payload.requestId, rideId },
  });
  ok('passenger B joined the ride', joinB.status === 201, JSON.stringify(joinB.payload));
  log(`6. Passenger B joined; charged LKR ${joinB.payload?.fare}`);

  // ---- passenger D: off-corridor ----------------------------------------
  await ping();
  const searchD = await call('/rides/shared/search', {
    method: 'POST', token: chandran,
    body: { pickup: MANNAR, dropoff: POINT_PEDRO, seats: 1 },
  });
  ok('an off-corridor journey is NOT offered a shared ride',
     searchD.status === 200 && searchD.payload.offers.length === 0,
     searchD.payload?.noMatchReason ?? '');
  log('');
  log(`7. Passenger D (Mannar → Point Pedro, far off route): no offer — "${searchD.payload?.noMatchReason}"`);

  // ---- reverse direction -------------------------------------------------
  await ping();
  const searchReverse = await call('/rides/shared/search', {
    method: 'POST', token: chandran,
    body: { pickup: NELLIYADY, dropoff: KOPAY, seats: 1 },
  });
  ok('a journey against the driver’s direction is NOT offered',
     searchReverse.status === 200 && searchReverse.payload.offers.length === 0,
     searchReverse.payload?.noMatchReason ?? '');
  log(`8. Reverse direction (Nelliyady → Kopay): no offer — "${searchReverse.payload?.noMatchReason}"`);

  // ---- gender safety -----------------------------------------------------
  await ping();
  const searchF = await call('/rides/shared/search', {
    method: 'POST', token: ananthi,
    body: { pickup: CHAVAKACHCHERI, dropoff: POINT_PEDRO, seats: 1, genderPreference: 'WOMEN_ONLY' },
  });
  ok('a women-only passenger is NOT offered a ride carrying men',
     searchF.status === 200 && searchF.payload.offers.length === 0,
     searchF.payload?.noMatchReason ?? '');
  log('');
  log(`9. Passenger (women-only preference), Chavakachcheri → Point Pedro: no offer — "${searchF.payload?.noMatchReason}"`);

  await ping();
  const searchFany = await call('/rides/shared/search', {
    method: 'POST', token: ananthi,
    body: { pickup: CHAVAKACHCHERI, dropoff: POINT_PEDRO, seats: 1, genderPreference: 'ANY' },
  });
  ok('the same passenger IS offered the same ride once the restriction is lifted',
     searchFany.status === 200 && searchFany.payload.offers.length === 1,
     `offers=${searchFany.payload?.offers?.length}`);
  log('10. Same passenger, same journey, preference "any": offered — the safety rule was the only difference');

  // ---- complete and settle ----------------------------------------------
  await call(`/rides/${rideId}/arriving`, { method: 'POST', token: driver });
  await call(`/rides/${rideId}/arrived`, { method: 'POST', token: driver });
  const start = await call(`/rides/${rideId}/start`, { method: 'POST', token: driver });
  ok('trip started', start.status === 200);

  const complete = await call(`/rides/${rideId}/complete`, { method: 'POST', token: driver });
  ok('trip completed and every passenger settled separately',
     complete.status === 200 && complete.payload.passengersSettled >= 2,
     JSON.stringify(complete.payload));

  const earnings = await call('/drivers/me/earnings/summary', { token: driver });
  log('');
  log('11. Driver settlement:');
  log(`     trips settled          ${earnings.payload.trips}`);
  log(`     gross                  LKR ${earnings.payload.gross}`);
  log(`     platform commission    LKR ${earnings.payload.commission}`);
  log(`     driver net             LKR ${earnings.payload.net}`);
  log(`     of which from sharing  LKR ${earnings.payload.fromSharedPassengers.net} ` +
      `(${earnings.payload.fromSharedPassengers.count} additional passenger)`);

  ok('the driver earned an uplift from the additional passengers',
     Number(earnings.payload.fromSharedPassengers.net) > 0);
  ok('driver net differs from what passengers paid',
     earnings.payload.net !== earnings.payload.gross);

  log('');
  log(process.exitCode ? 'RESULT: FAILURES PRESENT' : 'RESULT: ALL CHECKS PASSED');
  log(`Finished ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error('Scenario aborted:', error.message);
  process.exitCode = 1;
});
