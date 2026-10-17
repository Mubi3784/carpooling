/**
 * P3 tests: passenger requests + offer/join matches. In-memory MongoDB only.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ADMIN_EMAIL = 'admin@carpool.test';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

let mongod;
let app;
let User;
let Ride;
let RideRequest;
let RideMatch;
let generateToken;
let chatHooks;
let counter = 0;

const dateOffset = (n) => {
  const ms = Date.now() + n * 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
};
const DAY = 24 * 60 * 60 * 1000;
const PHONE_BASE = '0300999';

const makeUser = async (name = 'Ali Khan') => {
  counter += 1;
  const email = `p3user${counter}@carpool.test`;
  const phone = `${PHONE_BASE}${String(1000 + counter)}`;
  const user = await User.create({ name, email, password: 'secret123', phone });
  return { user, email, phone, token: generateToken(user._id) };
};
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

const makeRide = async (driver, o = {}) => {
  const rideDate = o.rideDate || dateOffset(1);
  const departureDateTime = new Date(`${rideDate}T${o.time || '10:00'}:00+05:00`);
  const seats = o.seats ?? 3;
  return Ride.create({
    driver: driver.user._id,
    pickupLocation: 'DHA',
    destination: 'FAST',
    rideDate,
    departureTime: o.time || '10:00',
    departureDateTime,
    availableSeats: o.available ?? seats,
    totalSeats: seats,
    vehicleType: o.vehicleType || 'CAR',
    pricePerSeat: 100,
    whatsappNumber: '923001234567',
    status: o.status || 'ACTIVE',
    expiresAt: o.expiresAt || new Date(departureDateTime.getTime() + 15 * 60 * 1000),
    ...(o.seriesId ? { seriesId: o.seriesId } : {}),
  });
};

const reqBody = (o = {}) => ({
  pickupLocation: 'Gulshan',
  destination: 'University',
  departureTime: '09:00',
  vehiclePreference: 'CAR',
  passengerCount: 1,
  dates: [dateOffset(1)],
  clientRequestId: `rid-${Math.random().toString(36).slice(2, 12)}`,
  ...o,
});
const postRequest = (u, o) => request(app).post('/api/requests').set(auth(u)).send(reqBody(o));
const makeRequestDoc = (passenger, o = {}) => {
  const requestDate = o.requestDate || dateOffset(1);
  const departureDateTime = new Date(`${requestDate}T${o.time || '09:00'}:00+05:00`);
  const expiresAt = o.expiresAt || new Date(departureDateTime.getTime() + 15 * 60 * 1000);
  return RideRequest.create({
    passenger: passenger.user._id,
    pickupLocation: 'Gulshan',
    destination: 'University',
    requestDate,
    departureTime: o.time || '09:00',
    departureDateTime,
    expiresAt,
    purgeAt: o.purgeAt || new Date(expiresAt.getTime() + DAY),
    vehiclePreference: o.vehiclePreference || 'CAR',
    passengerCount: o.passengerCount ?? 1,
    status: o.status || 'ACTIVE',
  });
};
let matchSeq = 0;
const mid = () => `match-${Date.now()}-${(matchSeq += 1)}`;
const postMatch = (u, body) =>
  request(app)
    .post('/api/matches')
    .set(auth(u))
    .send({ clientMatchId: mid(), ...body });
const act = (u, id, action) => request(app).post(`/api/matches/${id}/${action}`).set(auth(u));

// Asserts no contact data leaks: no contact keys and none of the seeded values
const expectNoContact = (body, users) => {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/"(email|phone|whatsapp\w*|password)"/i);
  for (const u of users) {
    expect(text).not.toContain(u.email);
    expect(text).not.toContain(u.phone);
  }
  expect(text).not.toContain('923001234567');
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  if (!process.env.MONGO_URI.startsWith('mongodb://127.0.0.1')) {
    throw new Error('Refusing to run tests against non-local MongoDB');
  }
  app = require('../server');
  User = require('../models/User');
  Ride = require('../models/Ride');
  RideRequest = require('../models/RideRequest');
  RideMatch = require('../models/RideMatch');
  generateToken = require('../utils/generateToken');
  chatHooks = require('../utils/chatHooks');
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([Ride.init(), RideRequest.init(), RideMatch.init(), User.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([Ride.deleteMany({}), RideRequest.deleteMany({}), RideMatch.deleteMany({})]);
  jest.restoreAllMocks();
});

describe('Request creation and validation', () => {
  test('creates one request per date and returns whitelisted data', async () => {
    const p = await makeUser();
    const res = await postRequest(p, { dates: [dateOffset(1), dateOffset(2)] });
    expect(res.status).toBe(201);
    expect(res.body.data.count).toBe(2);
    expect(await RideRequest.countDocuments({ passenger: p.user._id })).toBe(2);
    const doc = await RideRequest.findOne({ passenger: p.user._id });
    expect(doc.purgeAt.getTime() - doc.expiresAt.getTime()).toBe(DAY);
    expect(doc.expiresAt.getTime() - doc.departureDateTime.getTime()).toBe(15 * 60 * 1000);
    expectNoContact(res.body, [p]);
  });

  test('rejects 7 dates, duplicates, past, beyond window, missing/Any vehicle', async () => {
    const p = await makeUser();
    const seven = Array.from({ length: 7 }, (_, i) => dateOffset(i + 1));
    expect((await postRequest(p, { dates: seven })).status).toBe(400);
    expect((await postRequest(p, { dates: [dateOffset(1), dateOffset(1)] })).status).toBe(400);
    expect((await postRequest(p, { dates: [dateOffset(-1)] })).status).toBe(400);
    expect((await postRequest(p, { dates: [dateOffset(14)] })).status).toBe(400);
    expect((await postRequest(p, { dates: [dateOffset(13)] })).status).toBe(201);
    expect((await postRequest(p, { dates: 'x' })).status).toBe(400);
    for (const v of ['ANY', 'Any', undefined, 5]) {
      expect((await postRequest(p, { vehiclePreference: v })).status).toBe(400);
    }
  });

  test('bike forces count 1 and rejects other counts; car range enforced', async () => {
    const p = await makeUser();
    expect((await postRequest(p, { vehiclePreference: 'BIKE', passengerCount: 3 })).status).toBe(400);
    const ok = await postRequest(p, { vehiclePreference: 'BIKE', passengerCount: undefined });
    expect(ok.status).toBe(201);
    expect((await RideRequest.findOne({ vehiclePreference: 'BIKE' })).passengerCount).toBe(1);
    for (const c of [0, 7, 2.5]) {
      expect((await postRequest(p, { passengerCount: c })).status).toBe(400);
    }
    expect((await postRequest(p, { pickupLocation: 'x'.repeat(101) })).status).toBe(400);
    expect((await postRequest(p, { notes: 'x'.repeat(301) })).status).toBe(400);
  });

  test('idempotent resubmit creates no new documents', async () => {
    const p = await makeUser();
    const body = reqBody({ dates: [dateOffset(1), dateOffset(2)] });
    const a = await request(app).post('/api/requests').set(auth(p)).send(body);
    const b = await request(app).post('/api/requests').set(auth(p)).send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.replayed).toBe(true);
    expect(await RideRequest.countDocuments({})).toBe(2);
    const body2 = reqBody({ dates: [dateOffset(3)] });
    const [c, d] = await Promise.all([
      request(app).post('/api/requests').set(auth(p)).send(body2),
      request(app).post('/api/requests').set(auth(p)).send(body2),
    ]);
    expect([c.status, d.status].sort()).toEqual([200, 201]);
    expect(await RideRequest.countDocuments({})).toBe(3);
  });

  test('cap of 7 counts rides and requests together; expired/cancelled do not count', async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i += 1) await makeRide(u, { rideDate: dateOffset(1) });
    await makeRide(u, { status: 'CANCELLED' });
    await makeRide(u, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await makeRequestDoc(u, { status: 'CANCELLED' });
    expect((await postRequest(u, { dates: [dateOffset(1), dateOffset(2)] })).status).toBe(201);
    const over = await postRequest(u, { dates: [dateOffset(3)] });
    expect(over.status).toBe(409);
    expect(over.body.message).toMatch(/at most 7/);
    // Rides count the other way too
    const ridePost = await request(app)
      .post('/api/rides')
      .set(auth(u))
      .send({
        pickupLocation: 'A',
        destination: 'B',
        rideDate: dateOffset(2),
        departureTime: '11:00',
        availableSeats: 2,
        pricePerSeat: 50,
        whatsappNumber: '03001234567',
      });
    expect(ridePost.status).toBe(409);
  });
});

describe('Request authorization, privacy and retention', () => {
  test('requires auth; malformed ids 404; non-owners get 404', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    expect((await request(app).get('/api/requests')).status).toBe(401);
    expect((await request(app).post('/api/matches')).status).toBe(401);
    const created = await postRequest(owner, { dates: [dateOffset(1)], clientRequestId: 'series-abc-123' });
    const id = created.body.data.id;
    expect((await request(app).get('/api/requests/not-an-id').set(auth(owner))).status).toBe(404);
    expect((await request(app).patch(`/api/requests/${id}`).set(auth(other)).send({ notes: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/requests/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).delete('/api/requests/series/series-abc-123').set(auth(other))).status).toBe(404);
    expect(await RideRequest.countDocuments({})).toBe(1);
  });

  test('PATCH edits fields, bike forced to 1, status edit rejected, matched/expired 409', async () => {
    const p = await makeUser();
    const d = await makeRequestDoc(p, { vehiclePreference: 'BIKE' });
    const r = await request(app)
      .patch(`/api/requests/${d._id}`)
      .set(auth(p))
      .send({ pickupLocation: 'New', time: undefined, departureTime: '11:30', notes: 'hi', passengerCount: 4 });
    expect(r.status).toBe(400); // bike with count 4
    const ok = await request(app)
      .patch(`/api/requests/${d._id}`)
      .set(auth(p))
      .send({ pickupLocation: 'New', departureTime: '11:30', notes: 'hi' });
    expect(ok.status).toBe(200);
    const fresh = await RideRequest.findById(d._id);
    expect(fresh.pickupLocation).toBe('New');
    expect(fresh.passengerCount).toBe(1);
    expect(fresh.purgeAt.getTime() - fresh.expiresAt.getTime()).toBe(DAY);
    expect(fresh.expiresAt.getTime() - fresh.departureDateTime.getTime()).toBe(15 * 60 * 1000);
    expect((await request(app).patch(`/api/requests/${d._id}`).set(auth(p)).send({ status: 'MATCHED' })).status).toBe(400);
    await RideRequest.updateOne({ _id: d._id }, { status: 'MATCHED' });
    expect((await request(app).patch(`/api/requests/${d._id}`).set(auth(p)).send({ notes: 'z' })).status).toBe(409);
    const exp = await makeRequestDoc(p, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).patch(`/api/requests/${exp._id}`).set(auth(p)).send({ notes: 'z' })).status).toBe(409);
  });

  test('driver browse: filters, first name only, no contact data, hides own/expired', async () => {
    const pax = await makeUser('Sara Ahmed Malik');
    const driver = await makeUser();
    await makeRequestDoc(pax, { requestDate: dateOffset(1), time: '09:00' });
    await makeRequestDoc(pax, { requestDate: dateOffset(2), time: '18:00', vehiclePreference: 'BIKE' });
    await makeRequestDoc(pax, { expiresAt: new Date(Date.now() - 1000) });
    await makeRequestDoc(driver);
    const all = await request(app).get('/api/requests').set(auth(driver));
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);
    expect(all.body.data[0].passenger).toEqual({ name: 'Sara' });
    expectNoContact(all.body, [pax, driver]);
    expect(JSON.stringify(all.body)).not.toContain(String(pax.user._id));
    const q = (s) => request(app).get(`/api/requests?${s}`).set(auth(driver));
    expect((await q(`date=${dateOffset(2)}`)).body.count).toBe(1);
    expect((await q('vehicleType=BIKE')).body.count).toBe(1);
    expect((await q('timeFrom=12:00&timeTo=20:00')).body.count).toBe(1);
    expect((await q('keyword=gulsh')).body.count).toBe(2);
    expect((await q('keyword=.*(')).status).toBe(200);
    expect((await q('date[$ne]=x')).status).toBe(400);
    expect((await q('keyword[$ne]=x')).status).toBe(400);
    expect((await q('vehicleType=ANY')).status).toBe(400);
    // owner does not see own in browse
    expect((await request(app).get('/api/requests').set(auth(pax))).body.count).toBe(1);
  });

  test('expired request stays visible to owner as EXPIRED for 24h, not after purgeAt; not offerable', async () => {
    const pax = await makeUser();
    const driver = await makeUser();
    const expired = await makeRequestDoc(pax, { expiresAt: new Date(Date.now() - 60000), requestDate: dateOffset(1) });
    await makeRequestDoc(pax, {
      expiresAt: new Date(Date.now() - 2 * DAY),
      purgeAt: new Date(Date.now() - DAY),
    });
    const mine = await request(app).get('/api/requests/mine').set(auth(pax));
    expect(mine.body.count).toBe(1);
    expect(mine.body.data[0].status).toBe('EXPIRED');
    expect((await request(app).get(`/api/requests/${expired._id}`).set(auth(driver))).status).toBe(404);
    const ride = await makeRide(driver);
    const offer = await postMatch(driver, { rideId: String(ride._id), requestId: String(expired._id) });
    expect(offer.status).toBe(404);
    expect((await request(app).get(`/api/requests/${expired._id}/rides-for-offer`).set(auth(driver))).status).toBe(404);
  });

  test('indexes: TTLs and unique partial indexes exist', async () => {
    const rr = await RideRequest.collection.indexes();
    const rm = await RideMatch.collection.indexes();
    expect(rr.find((i) => i.key.purgeAt === 1).expireAfterSeconds).toBe(0);
    expect(rr.find((i) => i.name === 'uniq_passenger_series_date').unique).toBe(true);
    expect(rm.find((i) => i.key.expiresAt === 1).expireAfterSeconds).toBe(0);
    const u = rm.find((i) => i.name === 'uniq_active_match_ride_passenger');
    expect(u.unique).toBe(true);
    expect(u.partialFilterExpression).toBeDefined();
  });
});

describe('Offer / join flows', () => {
  test('Flow A: driver offers, passenger accepts; seats decrement, request MATCHED', async () => {
    const driver = await makeUser('Dana Driver');
    const pax = await makeUser('Pat Pax');
    const ride = await makeRide(driver, { seats: 3 });
    const rq = await makeRequestDoc(pax, { passengerCount: 2 });

    // viewing never matches
    await request(app).get(`/api/requests/${rq._id}`).set(auth(driver));
    await request(app).get(`/api/requests/${rq._id}/rides-for-offer`).set(auth(driver));
    expect((await RideRequest.findById(rq._id)).status).toBe('ACTIVE');

    const rides = await request(app).get(`/api/requests/${rq._id}/rides-for-offer`).set(auth(driver));
    expect(rides.body.count).toBe(1);
    expectNoContact(rides.body, [driver, pax]);

    const offer = await postMatch(driver, { rideId: String(ride._id), requestId: String(rq._id) });
    expect(offer.status).toBe(201);
    expect(offer.body.data.status).toBe('PENDING');
    expect(offer.body.data.initiatedBy).toBe('DRIVER');
    expectNoContact(offer.body, [driver, pax]);
    expect((await RideRequest.findById(rq._id)).status).toBe('ACTIVE');

    const alerts = await request(app).get('/api/matches/alerts/count').set(auth(pax));
    expect(alerts.body.data.count).toBe(1);
    expect((await request(app).get('/api/matches/alerts/count').set(auth(driver))).body.data.count).toBe(0);

    // initiator cannot accept; outsider 404
    const outsider = await makeUser();
    expect((await act(driver, offer.body.data.id, 'accept')).status).toBe(403);
    expect((await act(outsider, offer.body.data.id, 'accept')).status).toBe(404);

    const accepted = await act(pax, offer.body.data.id, 'accept');
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('ACCEPTED');
    expectNoContact(accepted.body, [driver, pax]);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(1);
    const after = await RideRequest.findById(rq._id);
    expect(after.status).toBe('MATCHED');
    expect(String(after.matchedRide)).toBe(String(ride._id));

    // alerts: driver sees status change, then seen clears
    expect((await request(app).get('/api/matches/alerts/count').set(auth(driver))).body.data.count).toBe(1);
    await request(app).post(`/api/matches/${offer.body.data.id}/seen`).set(auth(driver));
    expect((await request(app).get('/api/matches/alerts/count').set(auth(driver))).body.data.count).toBe(0);

    const inbox = await request(app).get('/api/matches').set(auth(driver));
    expect(inbox.body.count).toBe(1);
    expectNoContact(inbox.body, [driver, pax]);
    expect((await request(app).get('/api/matches').set(auth(outsider))).body.count).toBe(0);
  });

  test('Flow B: passenger joins; driver accepts; ride becomes FULL at 0', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const ride = await makeRide(driver, { seats: 2 });
    const rq = await makeRequestDoc(pax, { passengerCount: 2 });
    const join = await postMatch(pax, { rideId: String(ride._id), requestId: String(rq._id) });
    expect(join.status).toBe(201);
    expect(join.body.data.initiatedBy).toBe('PASSENGER');
    expect((await act(pax, join.body.data.id, 'accept')).status).toBe(403);
    expect((await act(driver, join.body.data.id, 'accept')).status).toBe(200);
    const r = await Ride.findById(ride._id);
    expect(r.availableSeats).toBe(0);
    expect(r.status).toBe('FULL');
    expect((await RideRequest.findById(rq._id)).status).toBe('MATCHED');
    // no more joins on a full ride
    const late = await makeUser();
    expect((await postMatch(late, { rideId: String(ride._id) })).status).toBe(409);
  });

  test('decline blocks resend; initiator cancels pending; cancel allows resend; responder cannot cancel pending', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const ride = await makeRide(driver);
    const first = await postMatch(pax, { rideId: String(ride._id) });
    expect(first.status).toBe(201);
    const dup = await postMatch(pax, { rideId: String(ride._id) });
    expect(dup.status).toBe(409);
    expect((await act(driver, first.body.data.id, 'cancel')).status).toBe(403);
    expect((await act(pax, first.body.data.id, 'cancel')).status).toBe(200);
    const again = await postMatch(pax, { rideId: String(ride._id) });
    expect(again.status).toBe(201);
    expect((await act(driver, again.body.data.id, 'decline')).status).toBe(200);
    const resend = await postMatch(pax, { rideId: String(ride._id) });
    expect(resend.status).toBe(409);
    expect(resend.body.message).toMatch(/declined/i);
    // declining does not touch seats
    expect((await Ride.findById(ride._id)).availableSeats).toBe(3);
  });

  test('idempotent replay by clientMatchId and validation', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const ride = await makeRide(driver);
    const body = { rideId: String(ride._id), clientMatchId: 'client-match-1' };
    const a = await request(app).post('/api/matches').set(auth(pax)).send(body);
    const b = await request(app).post('/api/matches').set(auth(pax)).send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(await RideMatch.countDocuments({})).toBe(1);
    expect((await request(app).post('/api/matches').set(auth(pax)).send({ rideId: String(ride._id) })).status).toBe(400);
    expect((await postMatch(pax, { rideId: 'nope' })).status).toBe(400);
  });

  test('rules: own items, vehicle mismatch, seats, expired, different date', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const car = await makeRide(driver, { seats: 2 });
    const bike = await makeRide(driver, { vehicleType: 'BIKE', seats: 1 });
    // own ride join
    expect((await postMatch(driver, { rideId: String(car._id) })).status).toBe(400);
    // own request offered
    const ownReq = await makeRequestDoc(driver);
    const ownCar = await makeRide(driver);
    expect((await postMatch(driver, { rideId: String(ownCar._id), requestId: String(ownReq._id) })).status).toBe(400);
    // vehicle mismatch both ways
    const bikeReq = await makeRequestDoc(pax, { vehiclePreference: 'BIKE' });
    const carReq = await makeRequestDoc(pax, { vehiclePreference: 'CAR' });
    expect((await postMatch(driver, { rideId: String(car._id), requestId: String(bikeReq._id) })).status).toBe(400);
    expect((await postMatch(driver, { rideId: String(bike._id), requestId: String(carReq._id) })).status).toBe(400);
    expect((await postMatch(driver, { rideId: String(bike._id), requestId: String(bikeReq._id) })).status).toBe(201);
    // not enough seats
    const bigReq = await makeRequestDoc(pax, { passengerCount: 3 });
    expect((await postMatch(driver, { rideId: String(car._id), requestId: String(bigReq._id) })).status).toBe(409);
    expect((await postMatch(pax, { rideId: String(car._id), passengerCount: 3 })).status).toBe(409);
    // bike ride, count 2
    const pax2 = await makeUser();
    expect((await postMatch(pax2, { rideId: String(bike._id), passengerCount: 2 })).status).toBe(409);
    // different date
    const otherDay = await makeRequestDoc(pax, { requestDate: dateOffset(3) });
    expect((await postMatch(driver, { rideId: String(car._id), requestId: String(otherDay._id) })).status).toBe(400);
    // expired ride
    const old = await makeRide(driver, { expiresAt: new Date(Date.now() - 1000) });
    expect((await postMatch(pax, { rideId: String(old._id) })).status).toBe(404);
    // someone else's request cannot be linked
    expect((await postMatch(pax2, { rideId: String(car._id), requestId: String(carReq._id) })).status).toBe(404);
  });

  test('concurrent accepts on the last seat never oversell', async () => {
    const driver = await makeUser();
    const p1 = await makeUser();
    const p2 = await makeUser();
    const ride = await makeRide(driver, { seats: 1 });
    const m1 = await postMatch(p1, { rideId: String(ride._id) });
    const m2 = await postMatch(p2, { rideId: String(ride._id) });
    const [a, b] = await Promise.all([
      act(driver, m1.body.data.id, 'accept'),
      act(driver, m2.body.data.id, 'accept'),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const r = await Ride.findById(ride._id);
    expect(r.availableSeats).toBe(0);
    expect(r.status).toBe('FULL');
    expect(await RideMatch.countDocuments({ status: 'ACCEPTED' })).toBe(1);
    expect(await RideMatch.countDocuments({ status: 'PENDING' })).toBe(1);
  });

  test('double-accept of the same match decrements once', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const ride = await makeRide(driver, { seats: 3 });
    const m = await postMatch(pax, { rideId: String(ride._id) });
    const [a, b] = await Promise.all([
      act(driver, m.body.data.id, 'accept'),
      act(driver, m.body.data.id, 'accept'),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(2);
  });

  test('cancel after accept restores seats, FULL->ACTIVE, reopens request, calls purge hook', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const ride = await makeRide(driver, { seats: 1 });
    const rq = await makeRequestDoc(pax);
    const m = await postMatch(pax, { rideId: String(ride._id), requestId: String(rq._id) });
    await act(driver, m.body.data.id, 'accept');
    expect((await Ride.findById(ride._id)).status).toBe('FULL');
    const spy = jest.spyOn(chatHooks, 'purgeChatForMatch');
    const c = await act(pax, m.body.data.id, 'cancel');
    expect(c.status).toBe(200);
    expect(c.body.data.status).toBe('CANCELLED');
    expect(spy).toHaveBeenCalledTimes(1);
    const r = await Ride.findById(ride._id);
    expect(r.availableSeats).toBe(1);
    expect(r.status).toBe('ACTIVE');
    const reopened = await RideMatch.findById(m.body.data.id);
    expect(reopened.status).toBe('CANCELLED');
    const back = await RideRequest.findById(rq._id);
    expect(back.status).toBe('ACTIVE');
    expect(back.matchedRide).toBeNull();
    // cancelling again is a conflict, seats not double restored
    expect((await act(pax, m.body.data.id, 'cancel')).status).toBe(409);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(1);
    // driver sees an alert for the cancellation
    expect((await request(app).get('/api/matches/alerts/count').set(auth(driver))).body.data.count).toBe(1);
  });

  test('deleting a ride cancels matches and reopens requests; series delete too', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const pax2 = await makeUser();
    const ride = await makeRide(driver, { seats: 3 });
    const rq = await makeRequestDoc(pax);
    const acc = await postMatch(pax, { rideId: String(ride._id), requestId: String(rq._id) });
    await act(driver, acc.body.data.id, 'accept');
    const pend = await postMatch(pax2, { rideId: String(ride._id) });
    const spy = jest.spyOn(chatHooks, 'purgeChatForMatch');
    expect((await request(app).delete(`/api/rides/${ride._id}`).set(auth(driver))).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await RideMatch.findById(acc.body.data.id)).status).toBe('CANCELLED');
    expect((await RideMatch.findById(pend.body.data.id)).status).toBe('CANCELLED');
    expect((await RideRequest.findById(rq._id)).status).toBe('ACTIVE');

    const s1 = await makeRide(driver, { seriesId: 'ride-series-xyz1', rideDate: dateOffset(1) });
    const s2 = await makeRide(driver, { seriesId: 'ride-series-xyz1', rideDate: dateOffset(2) });
    const rq2 = await makeRequestDoc(pax, { requestDate: dateOffset(2) });
    const m2 = await postMatch(pax, { rideId: String(s2._id), requestId: String(rq2._id) });
    await act(driver, m2.body.data.id, 'accept');
    const del = await request(app).delete('/api/rides/series/ride-series-xyz1').set(auth(driver));
    expect(del.status).toBe(200);
    expect((await RideMatch.findById(m2.body.data.id)).status).toBe('CANCELLED');
    expect((await RideRequest.findById(rq2._id)).status).toBe('ACTIVE');
    expect(await Ride.countDocuments({ _id: { $in: [s1._id, s2._id] } })).toBe(0);
  });

  test('deleting a request with an accepted match restores seats', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const ride = await makeRide(driver, { seats: 2 });
    const created = await postRequest(pax, { dates: [dateOffset(1)], clientRequestId: 'del-series-0001' });
    const rq = await RideRequest.findOne({ passenger: pax.user._id });
    const m = await postMatch(driver, { rideId: String(ride._id), requestId: String(rq._id) });
    await act(pax, m.body.data.id, 'accept');
    expect((await Ride.findById(ride._id)).availableSeats).toBe(1);
    expect(created.status).toBe(201);
    const del = await request(app).delete('/api/requests/series/del-series-0001').set(auth(pax));
    expect(del.status).toBe(200);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(2);
    expect((await RideMatch.findById(m.body.data.id)).status).toBe('CANCELLED');
  });

  test('cannot act on an expired match', async () => {
    const driver = await makeUser();
    const pax = await makeUser();
    const ride = await makeRide(driver);
    const m = await postMatch(pax, { rideId: String(ride._id) });
    await RideMatch.updateOne({ _id: m.body.data.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await act(driver, m.body.data.id, 'accept')).status).toBe(409);
    expect((await act(driver, m.body.data.id, 'decline')).status).toBe(409);
    expect((await act(pax, m.body.data.id, 'cancel')).status).toBe(409);
  });
});
