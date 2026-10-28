/**
 * §36 — overbooking must be impossible.
 *
 * A journey is declared with exactly ONE seat. Two passengers search, are both
 * offered it, and then attempt to claim it at the same moment. Exactly one must
 * succeed; the other must be refused cleanly.
 *
 * The guarantee comes from three independent layers:
 *   1. `SELECT ... FOR UPDATE` on the ride row serialises the two transactions;
 *   2. the seat claim re-asserts `seats_occupied + n <= seats_total` in its own
 *      WHERE clause, so it affects zero rows rather than overselling;
 *   3. the `rides_seats_within_capacity` CHECK constraint rejects the write
 *      outright if both of the above were ever bypassed.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'DemoPassword123!';

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
  return { status: res.status, payload: text ? JSON.parse(text) : null };
}

const login = async (phone) => (await call('/auth/login', { method: 'POST', body: { phone, password: PASSWORD } })).payload.accessToken;
const place = (lat, lng, address) => ({ lat, lng, address });

const JAFFNA = place(9.6615, 80.0255, 'Jaffna Bus Stand');
const KOPAY = place(9.7167, 80.05, 'Kopay Junction');
const CHAVAKACHCHERI = place(9.7405, 80.115, 'Chavakachcheri Town');
const NELLIYADY = place(9.7833, 80.1833, 'Nelliyady Market');
const POINT_PEDRO = place(9.8167, 80.2333, 'Point Pedro');

async function main() {
  console.log('LAST-SEAT RACE — two passengers, one seat, simultaneous requests');
  console.log(`Started ${new Date().toISOString()}\n`);

  const driver = await login('+94770000099');
  const first = await login('+94770000003');   // Chandran
  const second = await login('+94770000004');  // Dilani

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
    await call(`/rides/${active.payload.id}/cancel`, { method: 'POST', token: driver, body: { reason: 'Race test reset' } });
  }

  await call('/drivers/me/availability', { method: 'PUT', token: driver, body: { presence: 'ONLINE', acceptsShared: true } });

  const journey = await call('/rides/driver/planned-journey', {
    method: 'POST', token: driver,
    body: { origin: JAFFNA, waypoints: [KOPAY, CHAVAKACHCHERI, NELLIYADY], destination: POINT_PEDRO, seatsOffered: 1 },
  });
  ok('journey declared with exactly one seat', journey.status === 201 && journey.payload.seatsOffered === 1,
     JSON.stringify(journey.payload));
  const rideId = journey.payload.rideId;

  const ping = () => call('/drivers/me/location', { method: 'POST', token: driver, body: { lat: JAFFNA.lat, lng: JAFFNA.lng } });
  await ping();

  // Both passengers search independently and are both offered the same seat.
  const [searchOne, searchTwo] = await Promise.all([
    call('/rides/shared/search', { method: 'POST', token: first, body: { pickup: KOPAY, dropoff: NELLIYADY, seats: 1 } }),
    call('/rides/shared/search', { method: 'POST', token: second, body: { pickup: CHAVAKACHCHERI, dropoff: POINT_PEDRO, seats: 1 } }),
  ]);

  ok('both passengers were offered the seat', 
     searchOne.payload.offers?.length === 1 && searchTwo.payload.offers?.length === 1,
     `first=${searchOne.payload.offers?.length} second=${searchTwo.payload.offers?.length}`);

  // The race: both claims dispatched without waiting for the other.
  const [claimOne, claimTwo] = await Promise.all([
    call('/rides/shared/join', { method: 'POST', token: first, body: { requestId: searchOne.payload.requestId, rideId } }),
    call('/rides/shared/join', { method: 'POST', token: second, body: { requestId: searchTwo.payload.requestId, rideId } }),
  ]);

  const statuses = [claimOne.status, claimTwo.status];
  const succeeded = statuses.filter((s) => s === 201).length;
  const refused = statuses.filter((s) => s === 409).length;

  console.log(`\n  passenger 1 → HTTP ${claimOne.status} ${claimOne.payload?.error?.code ?? 'booked'}`);
  console.log(`  passenger 2 → HTTP ${claimTwo.status} ${claimTwo.payload?.error?.code ?? 'booked'}\n`);

  ok('exactly one passenger got the seat', succeeded === 1, `${succeeded} succeeded`);
  ok('the other was refused with a clear conflict', refused === 1, `${refused} refused`);

  const loser = claimOne.status === 409 ? claimOne : claimTwo;
  ok('the refusal names the real reason', loser.payload?.error?.code === 'SEATS_UNAVAILABLE',
     loser.payload?.error?.code ?? 'none');

  // The database must agree.
  const ride = await call(`/rides/${rideId}`, { token: driver });
  ok('the vehicle is not oversold', ride.payload.seats.occupied <= ride.payload.seats.total,
     `occupied=${ride.payload.seats.occupied} of ${ride.payload.seats.total}`);
  ok('exactly one seat is taken', ride.payload.seats.occupied === 1,
     `occupied=${ride.payload.seats.occupied}`);

  // Tidy up so the next run starts clean.
  await call(`/rides/${rideId}/cancel`, { method: 'POST', token: driver, body: { reason: 'Race test complete' } });

  console.log(`\n${failures === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: FAILURES PRESENT'}`);
  console.log(`Finished ${new Date().toISOString()}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('Aborted:', e.message); process.exitCode = 1; });
