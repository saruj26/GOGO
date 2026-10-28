/**
 * End-to-end verification of the parcel delivery module against a running API
 * and the real database.
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

const PICKUP = {
  lat: 9.6615, lng: 80.0255, address: 'Jaffna Bus Stand',
  contactName: 'Bavan', contactPhone: '+94770000002',
};
const DROPOFF = {
  lat: 9.7167, lng: 80.05, address: 'Kopay Junction',
  contactName: 'Nirmala', contactPhone: '+94771119999',
};

async function main() {
  log('PARCEL DELIVERY — end to end');
  log(`Started ${new Date().toISOString()}`);
  log('');

  const sender = await login('+94770000002');    // Bavan
  const stranger = await login('+94770000004');  // Dilani — for the IDOR check
  const courier = await login('+94770000098');   // Vasanth, bike
  log('1. Authenticated a sender and a courier');

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


  // ---- parcel classes -----------------------------------------------------
  const types = await call('/parcels/types', { token: sender });
  ok('parcel classes are listed', types.status === 200 && types.payload.length >= 4);

  const documents = types.payload.find((t) => t.code === 'DOCUMENT');
  const large = types.payload.find((t) => t.code === 'LARGE');
  log('');
  log('2. Parcel classes:');
  for (const t of types.payload) {
    log(`     ${t.name.padEnd(16)} up to ${t.maxWeightKg} kg, minimum vehicle ${t.minVehicleTypeCode}` +
        (t.requiresSignature ? ', signature required' : ''));
  }

  // ---- vehicle compatibility ---------------------------------------------
  const tooHeavy = await call('/parcels/estimate', {
    method: 'POST', token: sender,
    body: { pickup: PICKUP, dropoff: DROPOFF, parcelTypeId: documents.id, weightKg: 25 },
  });
  ok('a parcel too heavy for its class is refused',
     tooHeavy.status === 400 && tooHeavy.payload?.error?.code === 'VALIDATION_FAILED',
     tooHeavy.payload?.error?.message ?? `HTTP ${tooHeavy.status}`);

  const lightQuotes = await call('/parcels/estimate', {
    method: 'POST', token: sender,
    body: { pickup: PICKUP, dropoff: DROPOFF, parcelTypeId: documents.id, weightKg: 1.5 },
  });
  ok('a light document is quoted for every vehicle class', lightQuotes.status === 200 && lightQuotes.payload.length >= 3,
     `${lightQuotes.payload?.length} quote(s)`);
  ok('a bike is offered for a document', lightQuotes.payload.some((q) => q.vehicleTypeCode === 'BIKE'));

  const largeQuotes = await call('/parcels/estimate', {
    method: 'POST', token: sender,
    body: { pickup: PICKUP, dropoff: DROPOFF, parcelTypeId: large.id, weightKg: 120 },
  });
  ok('a bike is NOT offered for a large parcel',
     largeQuotes.status === 200 && !largeQuotes.payload.some((q) => q.vehicleTypeCode === 'BIKE'),
     largeQuotes.payload?.map((q) => q.vehicleTypeCode).join(', '));
  log('');
  log('3. Compatibility:');
  log(`     document 1.5 kg → ${lightQuotes.payload.map((q) => q.vehicleTypeCode).join(', ')}`);
  log(`     large 120 kg    → ${largeQuotes.payload.map((q) => q.vehicleTypeCode).join(', ')}`);

  const bikeQuote = lightQuotes.payload.find((q) => q.vehicleTypeCode === 'BIKE');
  log('');
  log(`4. Bike quote: ${(bikeQuote.distanceM / 1000).toFixed(1)} km, ${bikeQuote.etaMinutes} min, LKR ${bikeQuote.total}`);
  for (const line of bikeQuote.breakdown) {
    log(`     ${line.label.padEnd(24)} ${line.amount}`);
  }

  // ---- booking ------------------------------------------------------------
  const mismatched = await call('/parcels', {
    method: 'POST', token: sender,
    body: {
      pickup: PICKUP, dropoff: DROPOFF, parcelTypeId: large.id, weightKg: 120,
      vehicleTypeId: bikeQuote.vehicleTypeId, paymentMethod: 'CASH',
    },
  });
  ok('booking a large parcel on a bike is refused',
     mismatched.status === 400 && mismatched.payload?.error?.code === 'PARCEL_VEHICLE_UNAVAILABLE',
     mismatched.payload?.error?.code ?? `HTTP ${mismatched.status}`);

  const booking = await call('/parcels', {
    method: 'POST', token: sender,
    body: {
      pickup: PICKUP, dropoff: DROPOFF, parcelTypeId: documents.id, weightKg: 1.5,
      vehicleTypeId: bikeQuote.vehicleTypeId, paymentMethod: 'CASH',
      notes: 'Ring the bell twice', declaredValue: 5000,
    },
  });
  ok('the parcel is booked', booking.status === 201,
     booking.status === 201 ? '' : JSON.stringify(booking.payload));

  const parcelId = booking.payload.parcelId;
  ok('the booked price matches the quote', booking.payload.charge.total === bikeQuote.total,
     `${booking.payload.charge.total} vs ${bikeQuote.total}`);
  log('');
  log(`5. Booked ${booking.payload.reference} for LKR ${booking.payload.charge.total}`);

  // ---- authorization ------------------------------------------------------
  const foreign = await call(`/parcels/${parcelId}`, { token: stranger });
  ok('another customer cannot read the parcel', foreign.status === 404, `HTTP ${foreign.status}`);

  const foreignTracking = await call(`/parcels/${parcelId}/tracking`, { token: stranger });
  ok('another customer cannot read the tracking', foreignTracking.status === 404, `HTTP ${foreignTracking.status}`);

  // ---- courier ------------------------------------------------------------
  await call('/drivers/me/availability', {
    method: 'PUT', token: courier, body: { presence: 'ONLINE', acceptsParcel: true },
  });
  await call('/drivers/me/location', { method: 'POST', token: courier, body: { lat: 9.6620, lng: 80.0260 } });

  const jobs = await call('/parcels/jobs/available', { token: courier });
  ok('the courier is offered the parcel', jobs.status === 200 && jobs.payload.some((j) => j.parcelId === parcelId),
     jobs.status === 200 ? `${jobs.payload.length} job(s)` : JSON.stringify(jobs.payload));

  const job = jobs.payload.find((j) => j.parcelId === parcelId);
  ok('the offer withholds the receiver’s name and phone until claimed',
     !JSON.stringify(job).includes('Nirmala') && !JSON.stringify(job).includes('+94771119999'));
  ok('the offer shows the courier’s own pay', Number(job.yourEarning) < Number(booking.payload.charge.total),
     `earning ${job.yourEarning} vs customer ${booking.payload.charge.total}`);

  const claim = await call(`/parcels/jobs/${parcelId}/accept`, { method: 'POST', token: courier });
  ok('the courier claims the parcel', claim.status === 200, JSON.stringify(claim.payload));
  log('');
  log(`6. Courier claimed it; earning LKR ${job.yourEarning}`);

  const current = await call('/parcels/jobs/current', { token: courier });
  ok('now the courier gets the receiver’s details',
     current.payload?.deliverTo?.name === 'Nirmala' && current.payload.deliverTo.phone !== null);
  ok('the courier is told how much cash to collect',
     current.payload.cashToCollect === booking.payload.charge.total, `${current.payload.cashToCollect}`);

  // ---- lifecycle ----------------------------------------------------------
  const senderCannotPickup = await call(`/parcels/jobs/${parcelId}/pickup`, { method: 'POST', token: sender });
  ok('the sender cannot mark their own parcel collected',
     senderCannotPickup.status === 403 || senderCannotPickup.status === 404,
     `HTTP ${senderCannotPickup.status}`);

  await call(`/parcels/jobs/${parcelId}/heading-to-pickup`, {
    method: 'POST', token: courier, body: { lat: 9.6618, lng: 80.0258 },
  });
  await call(`/parcels/jobs/${parcelId}/pickup`, {
    method: 'POST', token: courier, body: { lat: 9.6615, lng: 80.0255 },
  });

  const lateCancel = await call(`/parcels/${parcelId}/cancel`, {
    method: 'POST', token: sender, body: { reason: 'Changed my mind' },
  });
  ok('a collected parcel cannot be cancelled',
     lateCancel.status === 400 && lateCancel.payload?.error?.code === 'ORDER_NOT_MODIFIABLE',
     lateCancel.payload?.error?.message ?? `HTTP ${lateCancel.status}`);
  log('7. Parcel collected; cancellation is no longer possible');

  await call(`/parcels/jobs/${parcelId}/in-transit`, {
    method: 'POST', token: courier, body: { lat: 9.69, lng: 80.04 },
  });

  const tracking = await call(`/parcels/${parcelId}/tracking`, { token: sender });
  ok('the sender sees the tracking trail', tracking.status === 200 && tracking.payload.items.length >= 4,
     `${tracking.payload?.items?.length} entries`);
  ok('the sender sees recorded coordinates', tracking.payload.items.some((e) => e.latitude !== null));
  log('');
  log('8. Tracking trail:');
  for (const entry of tracking.payload.items) {
    log(`     ${new Date(entry.createdAt).toISOString().slice(11, 19)}  ${String(entry.status).padEnd(18)} ${entry.note ?? ''}`);
  }

  const courierTracking = await call(`/parcels/${parcelId}/tracking`, { token: courier });
  ok('the courier sees the trail without the recorded coordinates',
     courierTracking.status === 200 && courierTracking.payload.items.every((e) => e.latitude === undefined),
     'coordinates withheld from the courier view');

  const deliver = await call(`/parcels/jobs/${parcelId}/deliver`, {
    method: 'POST', token: courier, body: { lat: DROPOFF.lat, lng: DROPOFF.lng },
  });
  ok('the delivery completes', deliver.status === 200, JSON.stringify(deliver.payload));

  const final = await call(`/parcels/${parcelId}`, { token: sender });
  ok('the parcel is delivered', final.payload.status === 'DELIVERED');
  ok('the cash payment is settled on delivery', final.payload.payment.status === 'PAID',
     final.payload.payment?.status);
  ok('the courier’s phone number is withdrawn after delivery', final.payload.courier?.phone === null);
  log('');
  log(`9. Delivered. Courier earned LKR ${deliver.payload.yourEarning}; sender paid LKR ${final.payload.payment.amount}`);

  ok('courier pay and sender charge are different numbers',
     deliver.payload.yourEarning !== final.payload.payment.amount);

  const earnings = await call('/drivers/me/earnings/summary', { token: courier });
  ok('the courier’s earnings include the parcel', earnings.status === 200 && Number(earnings.payload.net) > 0,
     `net LKR ${earnings.payload?.net} over ${earnings.payload?.trips} job(s)`);
  log(`10. Courier lifetime: ${earnings.payload.trips} job(s), gross LKR ${earnings.payload.gross}, ` +
      `commission LKR ${earnings.payload.commission}, net LKR ${earnings.payload.net}`);

  log('');
  log(failures === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: FAILURES PRESENT');
  log(`Finished ${new Date().toISOString()}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('Aborted:', e.message); process.exitCode = 1; });
