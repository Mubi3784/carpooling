/**
 * P5 endpoint tests: matches, matching-requests, counts, filters. In-memory MongoDB only.
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
let counter = 0;

const dateOffset = (n) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + n * 24 * 60 * 60 * 1000));
const DAY = 24 * 60 * 60 * 1000;

const makeUser = async (name = 'Ali Khan') => {
  counter += 1;
  const email = `p5user${counter}@carpool.test`;
  const phone = `0300888${String(1000 + counter)}`;
  const user = await User.create({ name, email, password: 'secret123', phone });
  return { user, email, phone, token: generateToken(user._id) };
};
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

const rideDoc = (driver, o = {}) => {
  const rideDate = o.rideDate || dateOffset(1);
  const departureDateTime = new Date(`${rideDate}T${o.time || '09:00'}:00+05:00`);
  const seats = o.seats ?? 3;
  const doc = {
    driver: driver.user._id,
    pickupLocation: o.pickup || 'Gulshan',
    destination: o.destination || 'University',
    rideDate,
    departureTime: o.time || '09:00',
    departureDateTime,
    availableSeats: o.available ?? seats,
    totalSeats: seats,
    pricePerSeat: 100,
    whatsappNumber: '923001234567',
    status: o.status || 'ACTIVE',
    expiresAt: o.expiresAt || new Date(departureDateTime.getTime() + 15 * 60 * 1000),
  };
  if (o.vehicleType !== null) doc.vehicleType = o.vehicleType || 'CAR';
  return doc;
};
const makeRide = (driver, o) => Ride.create(rideDoc(driver, o));
const makeRequestDoc = (passenger, o = {}) => {
  const requestDate = o.requestDate || dateOffset(1);
  const departureDateTime = new Date(`${requestDate}T${o.time || '09:00'}:00+05:00`);
  const expiresAt = o.expiresAt || new Date(departureDateTime.getTime() + 15 * 60 * 1000);
  return RideRequest.create({
    passenger: passenger.user._id,
    pickupLocation: o.pickup || 'Gulshan',
    destination: o.destination || 'University',
    requestDate,
    departureTime: o.time || '09:00',
    departureDateTime,
    expiresAt,
    purgeAt: new Date(expiresAt.getTime() + DAY),
    vehiclePreference: o.vehiclePreference || 'CAR',
    passengerCount: o.passengerCount ?? 1,
    status: o.status || 'ACTIVE',
  });
};
let matchSeq = 0;
const postMatch = (u, body) =>
  request(app)
    .post('/api/matches')
    .set(auth(u))
    .send({ clientMatchId: `m5-${Date.now()}-${(matchSeq += 1)}`, ...body });

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

describe('GET /api/requests/:id/matches', () => {
  test('owner gets ranked matches with levels and reasons, no contact data', async () => {
    const p = await makeUser('Sara Ahmed');
    const d = await makeUser('Bilal Raza');
    const req = await makeRequestDoc(p);
    await makeRide(d, { time: '10:30' }); // 90 min -> CLOSE
    await makeRide(d, { time: '09:10' }); // EXACT
    await makeRide(d, { time: '10:50', pickup: 'Saddar' }); // 110 min, other pickup -> ALTERNATIVE
    await makeRide(d, { vehicleType: 'BIKE', seats: 1 }); // bike instead of car
    const res = await request(app).get(`/api/requests/${req._id}/matches`).set(auth(p));
    expect(res.status).toBe(200);
    expect(res.body.data.map((m) => m.matchLevel)).toEqual([
      'EXACT',
      'CLOSE',
      'ALTERNATIVE',
      'ALTERNATIVE',
    ]);
    expect(res.body.data[0].reasons.length).toBeGreaterThan(0);
    expect(res.body.data[0].ride.driver).toEqual({ name: 'Bilal' });
    expect(res.body.data[0].canLinkRequest).toBe(true);
    expect(res.body.data.find((m) => m.ride.vehicleType === 'BIKE').canLinkRequest).toBe(false);
    expectNoContact(res.body, [p, d]);
    expect(JSON.stringify(res.body)).not.toContain(String(d.user._id));
  });

  test('non-owner and malformed id get 404, guest gets 401', async () => {
    const p = await makeUser();
    const other = await makeUser();
    const req = await makeRequestDoc(p);
    expect((await request(app).get(`/api/requests/${req._id}/matches`).set(auth(other))).status).toBe(404);
    expect((await request(app).get('/api/requests/not-an-id/matches').set(auth(p))).status).toBe(404);
    expect((await request(app).get(`/api/requests/${req._id}/matches`)).status).toBe(401);
  });

  test('excludes own, expired, full, zero-seat and other-date rides', async () => {
    const p = await makeUser();
    const d = await makeUser();
    const req = await makeRequestDoc(p);
    await makeRide(p); // own ride
    await makeRide(d, { expiresAt: new Date(Date.now() - 1000) });
    await makeRide(d, { status: 'FULL', available: 0 });
    await makeRide(d, { available: 0 });
    await makeRide(d, { rideDate: dateOffset(2) });
    await makeRide(d, { status: 'CANCELLED' });
    const res = await request(app).get(`/api/requests/${req._id}/matches`).set(auth(p));
    expect(res.body.data).toEqual([]);
  });

  test('legacy ride without vehicleType is treated as CAR', async () => {
    const p = await makeUser();
    const d = await makeUser();
    const req = await makeRequestDoc(p);
    const legacy = rideDoc(d, { vehicleType: null });
    delete legacy.vehicleType;
    await Ride.collection.insertOne({ ...legacy, createdAt: new Date(), updatedAt: new Date() });
    const res = await request(app).get(`/api/requests/${req._id}/matches`).set(auth(p));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].matchLevel).toBe('EXACT');
    expect(res.body.data[0].ride.vehicleType).toBe('CAR');
  });

  test('reports existingMatch PENDING then ACCEPTED, and does not mutate anything', async () => {
    const p = await makeUser();
    const d = await makeUser();
    const req = await makeRequestDoc(p);
    const ride = await makeRide(d);
    const none = await request(app).get(`/api/requests/${req._id}/matches`).set(auth(p));
    expect(none.body.data[0].existingMatch).toBeNull();

    const created = await postMatch(p, { rideId: String(ride._id), requestId: String(req._id), passengerCount: 1 });
    expect(created.status).toBe(201);

    const snap = async () => ({
      ride: await Ride.findById(ride._id).lean(),
      req: await RideRequest.findById(req._id).lean(),
    });
    const before = await snap();
    const res = await request(app).get(`/api/requests/${req._id}/matches`).set(auth(p));
    expect(res.body.data[0].existingMatch).toBe('PENDING');
    const after = await snap();
    expect(after).toEqual(before);

    await RideMatch.updateOne({ _id: created.body.data.id || created.body.data._id }, { status: 'ACCEPTED' });
    const res2 = await request(app).get(`/api/requests/${req._id}/matches`).set(auth(p));
    expect(res2.body.data[0].existingMatch).toBe('ACCEPTED');
  });

  test('inactive owner request returns an empty list with a reason', async () => {
    const p = await makeUser();
    const req = await makeRequestDoc(p, { status: 'MATCHED' });
    const res = await request(app).get(`/api/requests/${req._id}/matches`).set(auth(p));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.reason).toBeTruthy();
  });
});

describe('GET /api/rides/:id/matching-requests', () => {
  test('owner driver gets ranked requests, first name only, no contact data', async () => {
    const d = await makeUser('Bilal Raza');
    const p = await makeUser('Sara Ahmed');
    const ride = await makeRide(d);
    await makeRequestDoc(p, { time: '10:30' });
    const p2 = await makeUser('Zain Malik');
    await makeRequestDoc(p2, { time: '09:05' });
    const res = await request(app).get(`/api/rides/${ride._id}/matching-requests`).set(auth(d));
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.matchLevel)).toEqual(['EXACT', 'CLOSE']);
    expect(res.body.data[0].passenger).toEqual({ name: 'Zain' });
    expect(res.body.data[0].canOffer).toBe(true);
    expectNoContact(res.body, [d, p, p2]);
    expect(JSON.stringify(res.body)).not.toContain(String(p.user._id));
  });

  test('non-owner is 404, guest is 401, malformed id is 404', async () => {
    const d = await makeUser();
    const other = await makeUser();
    const ride = await makeRide(d);
    expect((await request(app).get(`/api/rides/${ride._id}/matching-requests`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(`/api/rides/${ride._id}/matching-requests`)).status).toBe(401);
    expect((await request(app).get('/api/rides/xyz/matching-requests').set(auth(d))).status).toBe(404);
  });

  test('bike ride only sees single-passenger requests; own requests excluded', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { vehicleType: 'BIKE', seats: 1 });
    await makeRequestDoc(p, { passengerCount: 2 });
    await makeRequestDoc(p, { passengerCount: 1 });
    await makeRequestDoc(d); // driver's own request
    const res = await request(app).get(`/api/rides/${ride._id}/matching-requests`).set(auth(d));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].passengerCount).toBe(1);
    expect(res.body.data[0].matchLevel).toBe('ALTERNATIVE');
    expect(res.body.data[0].canOffer).toBe(false);
  });

  test('expired requests excluded and matching does not mutate the ride', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d);
    await makeRequestDoc(p, { expiresAt: new Date(Date.now() - 1000) });
    const before = await Ride.findById(ride._id).lean();
    const res = await request(app).get(`/api/rides/${ride._id}/matching-requests`).set(auth(d));
    expect(res.body.data).toEqual([]);
    expect(await Ride.findById(ride._id).lean()).toEqual(before);
  });

  test('existingMatch is reported after an offer', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d);
    const req = await makeRequestDoc(p);
    const offered = await postMatch(d, { rideId: String(ride._id), requestId: String(req._id), passengerCount: 1 });
    expect(offered.status).toBe(201);
    const res = await request(app).get(`/api/rides/${ride._id}/matching-requests`).set(auth(d));
    expect(res.body.data[0].existingMatch).toBe('PENDING');
  });
});

describe('GET /api/requests/matches/counts', () => {
  test('returns total and exact per request using one ride query', async () => {
    const p = await makeUser();
    const d = await makeUser();
    const r1 = await makeRequestDoc(p, { requestDate: dateOffset(1) });
    const r2 = await makeRequestDoc(p, { requestDate: dateOffset(2) });
    const r3 = await makeRequestDoc(p, { requestDate: dateOffset(3) });
    await makeRide(d, { rideDate: dateOffset(1) });
    await makeRide(d, { rideDate: dateOffset(1), time: '10:15' });
    await makeRide(d, { rideDate: dateOffset(2), vehicleType: 'BIKE', seats: 1 });
    const spy = jest.spyOn(Ride, 'find');
    const res = await request(app).get('/api/requests/matches/counts').set(auth(p));
    expect(res.status).toBe(200);
    expect(res.body.data[String(r1._id)]).toEqual({ total: 2, exact: 1 });
    expect(res.body.data[String(r2._id)]).toEqual({ total: 1, exact: 0 });
    expect(res.body.data[String(r3._id)]).toEqual({ total: 0, exact: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    expectNoContact(res.body, [p, d]);
  });

  test('no requests gives empty data; guest gets 401', async () => {
    const p = await makeUser();
    const res = await request(app).get('/api/requests/matches/counts').set(auth(p));
    expect(res.body.data).toEqual({});
    expect((await request(app).get('/api/requests/matches/counts')).status).toBe(401);
  });
});

describe('GET /api/rides filters', () => {
  const list = (q) => request(app).get('/api/rides').query(q);

  test('timeFrom/timeTo, minSeats, pickup, destination filter correctly', async () => {
    const d = await makeUser();
    await makeRide(d, { time: '08:00', pickup: 'Gulshan', destination: 'FAST', seats: 2 });
    await makeRide(d, { time: '12:00', pickup: 'Saddar', destination: 'Airport', seats: 4 });
    const date = dateOffset(1);
    expect((await list({ date, timeFrom: '07:00', timeTo: '09:00' })).body.count).toBe(1);
    expect((await list({ date, timeFrom: '09:00' })).body.count).toBe(1);
    expect((await list({ date, minSeats: '3' })).body.data[0].destination).toBe('Airport');
    expect((await list({ date, pickup: 'gul' })).body.count).toBe(1);
    expect((await list({ date, destination: 'air' })).body.count).toBe(1);
    expect((await list({ date, pickup: 'gul', destination: 'air' })).body.count).toBe(0);
    expect((await list({ date, keyword: 'fast', minSeats: '1' })).body.count).toBe(1);
  });

  test('invalid or injected params give 400', async () => {
    const bad = [
      '?minSeats[$gt]=1',
      '?pickup[$ne]=x',
      '?destination[]=a&destination[]=b',
      '?timeFrom=25:00',
      '?timeTo[]=09:00',
      '?minSeats=0',
      '?minSeats=7',
      '?minSeats=abc',
      `?pickup=${'a'.repeat(51)}`,
      '?timeFrom=10:00&timeTo=09:00',
    ];
    for (const q of bad) {
      const res = await request(app).get(`/api/rides${q}`);
      expect([q, res.status]).toEqual([q, 400]);
    }
  });

  test('regex metacharacters are matched literally', async () => {
    const d = await makeUser();
    await makeRide(d, { pickup: 'Gulshan (Block 5)' });
    expect((await list({ pickup: '(' })).status).toBe(200);
    expect((await list({ pickup: '.*' })).body.count).toBe(0);
    expect((await list({ pickup: '(Block 5)' })).body.count).toBe(1);
  });

  test('date behaviour still works alongside the new params', async () => {
    const d = await makeUser();
    await makeRide(d, { rideDate: dateOffset(0), time: '23:50' });
    await makeRide(d, { rideDate: dateOffset(1) });
    expect((await list({ date: dateOffset(1), minSeats: '1' })).body.count).toBe(1);
    expect((await list({ date: dateOffset(2), minSeats: '1' })).body.count).toBe(0);
    expect((await list({ minSeats: '1' })).body.count).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/requests filters', () => {
  test('vehicle, passengers, time range filter correctly', async () => {
    const d = await makeUser();
    const p = await makeUser();
    await makeRequestDoc(p, { time: '08:00', passengerCount: 1 });
    await makeRequestDoc(p, { time: '12:00', passengerCount: 3 });
    await makeRequestDoc(p, { time: '12:30', vehiclePreference: 'BIKE' });
    const get = (q) => request(app).get('/api/requests').query(q).set(auth(d));
    expect((await get({ vehicle: 'BIKE' })).body.count).toBe(1);
    expect((await get({ vehicle: 'CAR', vehicleType: 'CAR' })).body.count).toBe(2);
    expect((await get({ passengers: '2' })).body.count).toBe(2);
    expect((await get({ timeFrom: '11:00', timeTo: '13:00' })).body.count).toBe(2);
    expect((await get({ vehicle: 'CAR', passengers: '1', timeTo: '09:00' })).body.count).toBe(1);
  });

  test('invalid or injected params give 400', async () => {
    const d = await makeUser();
    const bad = [
      '?vehicle[$ne]=CAR',
      '?vehicle=TRUCK',
      '?vehicle=CAR&vehicleType=BIKE',
      '?passengers=0',
      '?passengers=7',
      '?passengers[$gt]=1',
      '?passengers[]=1&passengers[]=2',
      '?timeFrom=99:00',
      '?timeFrom[]=09:00',
      '?timeFrom=10:00&timeTo=09:00',
      '?date[$ne]=x',
    ];
    for (const q of bad) {
      const res = await request(app).get(`/api/requests${q}`).set(auth(d));
      expect([q, res.status]).toEqual([q, 400]);
    }
  });
});
