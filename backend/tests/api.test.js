/**
 * Integration tests for the Carpool & Road Status API.
 *
 * Runs against an in-memory MongoDB instance (mongodb-memory-server-core),
 * so the production MongoDB Atlas database is never touched.
 * Env vars are set BEFORE server.js is required; dotenv never overrides
 * variables that are already set, so backend/.env is not used for these values.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ADMIN_EMAIL = 'admin@carpool.test';

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

let mongod;
let app;
let User;
let Ride;
let dateHelpers;

// Local YYYY-MM-DD string for today + offsetDays (matches frontend date tabs)
// YYYY-MM-DD in Asia/Karachi for today + offsetDays (the app's single time zone)
const formatLocalDate = (offsetDays) => {
  const ms = Date.now() + offsetDays * 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const registerUser = (overrides = {}) =>
  request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test User',
      email: 'user@carpool.test',
      password: 'secret123',
      phone: '03001234567',
      ...overrides,
    });

beforeAll(async () => {
  // First run may download the MongoDB binary (cached afterwards)
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  // Safety guard: never run against a remote/Atlas database
  if (!process.env.MONGO_URI.startsWith('mongodb://127.0.0.1')) {
    throw new Error(`Refusing to run tests against non-local MongoDB: ${process.env.MONGO_URI}`);
  }

  app = require('../server');
  User = require('../models/User');
  Ride = require('../models/Ride');
  dateHelpers = require('../utils/dateHelpers');
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

describe('Authentication (custom JWT)', () => {
  let token;

  test('registers a new user and returns a token with role "user"', async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toEqual({ id: expect.any(String), name: expect.any(String), role: 'user' });
    expect(res.body.data.user.role).toBe('user');
    token = res.body.data.token;
  });

  test('rejects duplicate email registration with 409', async () => {
    const res = await registerUser();
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('stores the password as a bcrypt hash with 10 salt rounds', async () => {
    const user = await User.findOne({ email: 'user@carpool.test' }).select('+password');
    expect(user.password).not.toBe('secret123');
    expect(bcrypt.getRounds(user.password)).toBe(10);
  });

  test('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@carpool.test', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toEqual({ id: expect.any(String), name: expect.any(String), role: 'user' });
  });

  test('rejects login with a wrong password (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@carpool.test', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('issues tokens valid for 30 days', () => {
    const decoded = jwt.decode(token);
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 60 * 60);
  });

  test('GET /api/auth/me accepts a valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({ id: expect.any(String), name: expect.any(String), role: 'user' });
  });

  test('GET /api/auth/me rejects requests without a token (401)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no token provided/i);
  });

  test('GET /api/auth/me rejects a malformed token (401)', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('Ride feed & guest phone masking', () => {
  const rideDate = formatLocalDate(1);
  let driverToken;
  let rideId;

  beforeAll(async () => {
    const res = await registerUser({ name: 'Driver One', email: 'driver@carpool.test' });
    driverToken = res.body.data.token;
  });

  test('rejects ride creation without a token (401)', async () => {
    const res = await request(app).post('/api/rides').send({ pickupLocation: 'Saddar' });
    expect(res.status).toBe(401);
  });

  test('creates a ride for an authenticated driver', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        pickupLocation: 'Saddar, Rawalpindi',
        destination: 'Blue Area, Islamabad',
        rideDate,
        departureTime: '08:30',
        availableSeats: 3,
        pricePerSeat: 200,
        whatsappNumber: '0310-5517386',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    rideId = res.body.data.id;
  });

  test('public feed returns the ride without any contact number for guests', async () => {
    const res = await request(app).get(`/api/rides?date=${rideDate}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    const ride = res.body.data[0];
    expect(ride.id).toBe(rideId);
    expect(ride.pickupLocation).toBe('Saddar, Rawalpindi');
    expect(ride.pricePerSeat).toBe(200);
    res.body.data.forEach((item) => {
      expect(item).not.toHaveProperty('whatsappNumber');
      expect(item).not.toHaveProperty('whatsappLink');
    });
  });

  test('ride details never include the WhatsApp number or link (guests)', async () => {
    const res = await request(app).get(`/api/rides/${rideId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canContact).toBe(false);
    expect(res.body.data).not.toHaveProperty('whatsappNumber');
    expect(res.body.data).not.toHaveProperty('whatsappLink');
  });

  test('ride details stay masked when an invalid token is supplied', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', 'Bearer invalid.token.value');
    expect(res.status).toBe(200);
    expect(res.body.data.canContact).toBe(false);
    expect(res.body.data).not.toHaveProperty('whatsappNumber');
    expect(res.body.data).not.toHaveProperty('whatsappLink');
  });

  test('logged-in users (even the driver) also never receive the number or a wa.me link', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canContact).toBe(true);
    expect(res.body.data).not.toHaveProperty('whatsappNumber');
    expect(res.body.data).not.toHaveProperty('whatsappLink');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('923105517386');
    expect(text).not.toContain('wa.me');
  });
  describe('Ride TTL expiration', () => {
    test('calculateExpiration adds a 15-minute grace period to departure', () => {
      const departure = dateHelpers.createDepartureDateTime(rideDate, '08:30');
      const expiresAt = dateHelpers.calculateExpiration(departure);
      expect(expiresAt.getTime() - departure.getTime()).toBe(15 * 60 * 1000);
    });

    test('stored ride has expiresAt = departureDateTime + 15 minutes', async () => {
      const ride = await Ride.findById(rideId).lean();
      expect(ride.departureDateTime.getTime()).toBe(new Date(`${rideDate}T08:30:00+05:00`).getTime());
      expect(ride.expiresAt.getTime() - ride.departureDateTime.getTime()).toBe(15 * 60 * 1000);
    });

    test('rides collection has a TTL index on expiresAt with expireAfterSeconds 0', async () => {
      await Ride.init();
      const indexes = await Ride.collection.indexes();
      const ttlIndex = indexes.find(
        (idx) => Object.keys(idx.key).length === 1 && idx.key.expiresAt === 1
      );
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex.expireAfterSeconds).toBe(0);
    });
  });
});

describe('P0 hardening', () => {
  let token;
  let ownerId;
  const rideDate = formatLocalDate(2);

  const baseRide = {
    pickupLocation: 'F-10, Islamabad',
    destination: 'Saddar, Rawalpindi',
    rideDate,
    departureTime: '08:30',
    availableSeats: 3,
    pricePerSeat: 100,
    whatsappNumber: '0310-5517386',
  };

  const makeExpiredRide = (overrides = {}) =>
    Ride.create({
      driver: ownerId,
      pickupLocation: 'Old A',
      destination: 'Old B',
      rideDate: '2020-01-01',
      departureTime: '08:00',
      departureDateTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      availableSeats: 2,
      totalSeats: 2,
      pricePerSeat: 50,
      whatsappNumber: '923001112222',
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      ...overrides,
    });

  beforeAll(async () => {
    const res = await registerUser({ name: 'P0 Driver', email: 'p0@carpool.test' });
    token = res.body.data.token;
    ownerId = res.body.data.user.id;
  });

  test('08:30 PKT is stored as 03:30Z', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${token}`)
      .send(baseRide);
    expect(res.status).toBe(201);
    const ride = await Ride.findById(res.body.data.id).lean();
    expect(ride.departureDateTime.toISOString()).toBe(`${rideDate}T03:30:00.000Z`);
    expect(ride.expiresAt.toISOString()).toBe(`${rideDate}T03:45:00.000Z`);
  });

  test('rejects a ride dated in the past (PKT) with 400', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseRide, rideDate: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  test('rejects array/object date query with 400', async () => {
    const obj = await request(app).get('/api/rides?date[$ne]=x');
    expect(obj.status).toBe(400);
    const arr = await request(app).get('/api/rides?date=2026-01-01&date=2026-01-02');
    expect(arr.status).toBe(400);
    const bad = await request(app).get('/api/rides?date=2026-02-31');
    expect(bad.status).toBe(400);
  });

  test('regex keyword is escaped and non-string keywords are ignored', async () => {
    const special = await request(app).get('/api/rides').query({ keyword: '.*' });
    expect(special.status).toBe(200);
    expect(special.body.count).toBe(0); // literal ".*" matches nothing

    const arr = await request(app).get('/api/rides?keyword[$ne]=x');
    expect(arr.status).toBe(200);

    const literal = await request(app).get('/api/rides').query({ keyword: 'f-10' });
    expect(literal.status).toBe(200);
    expect(literal.body.count).toBeGreaterThanOrEqual(1);

    const long = await request(app).get('/api/rides').query({ keyword: 'a'.repeat(5000) });
    expect(long.status).toBe(200);
  });

  test('getRideById returns 404 for an expired ride, even for its owner', async () => {
    const expired = await makeExpiredRide();
    const res = await request(app)
      .get(`/api/rides/${expired._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('updateSeats rejects values above totalSeats, non-integers and expired rides', async () => {
    const created = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseRide, availableSeats: 2 });
    const id = created.body.data.id;
    const patch = (body) =>
      request(app)
        .patch(`/api/rides/${id}/seats`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    expect((await patch({ availableSeats: 3 })).status).toBe(400);
    expect((await patch({ availableSeats: 1.5 })).status).toBe(400);
    expect((await patch({ availableSeats: { $gt: 0 } })).status).toBe(400);

    const zero = await patch({ availableSeats: 0 });
    expect(zero.status).toBe(200);
    expect(zero.body.data.status).toBe('FULL');
    const back = await patch({ availableSeats: 2 });
    expect(back.status).toBe(200);
    expect(back.body.data.status).toBe('ACTIVE');

    const expired = await makeExpiredRide();
    const res = await request(app)
      .patch(`/api/rides/${expired._id}/seats`)
      .set('Authorization', `Bearer ${token}`)
      .send({ availableSeats: 1 });
    expect(res.status).toBe(404);
  });

  test('login is rate limited per IP (429 after 10 attempts)', async () => {
    const prevVercel = process.env.VERCEL;
    process.env.VERCEL = '1'; // x-forwarded-for is only trusted on Vercel
    try {
      const ip = '203.0.113.9';
      let last;
      for (let i = 0; i < 11; i += 1) {
        last = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: 'nobody@carpool.test', password: 'wrong-password' });
      }
      expect(last.status).toBe(429);
      expect(last.body.success).toBe(false);
      expect(last.body.message).toMatch(/too many/i);

      // A different client IP is unaffected
      const other = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ email: 'nobody@carpool.test', password: 'wrong-password' });
      expect(other.status).toBe(401);
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }
  });

  test('server errors do not leak raw internal messages', async () => {
    const spy = jest.spyOn(Ride, 'find').mockImplementationOnce(() => {
      throw new Error('SECRET-INTERNAL mongodb://user:pass@host');
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/api/rides');
    spy.mockRestore();
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET-INTERNAL|mongodb:/);
  });
});

describe('P0 follow-up: rate limiter client IP', () => {
  const prevVercel = process.env.VERCEL;
  afterEach(() => {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  });

  const fakeRes = () => ({
    set: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  test('ignores x-forwarded-for when VERCEL is not set', () => {
    delete process.env.VERCEL;
    const { getClientIp } = require('../middleware/rateLimiter');
    const req = { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '10.0.0.5' } };
    expect(getClientIp(req)).toBe('10.0.0.5');
  });

  test('uses the first x-forwarded-for entry when VERCEL is set', () => {
    process.env.VERCEL = '1';
    const { getClientIp } = require('../middleware/rateLimiter');
    const socket = { remoteAddress: '10.0.0.5' };
    expect(getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket })).toBe('1.2.3.4');
    expect(getClientIp({ headers: { 'x-forwarded-for': 'a'.repeat(100) }, socket })).toHaveLength(64);
  });

  test("falls back to req.ip then 'unknown'", () => {
    delete process.env.VERCEL;
    const { getClientIp } = require('../middleware/rateLimiter');
    expect(getClientIp({ headers: {}, ip: '::1' })).toBe('::1');
    expect(getClientIp({ headers: {} })).toBe('unknown');
  });

  test('rotating x-forwarded-for does not bypass the limiter off Vercel', () => {
    delete process.env.VERCEL;
    const { createRateLimiter } = require('../middleware/rateLimiter');
    const mw = createRateLimiter({ windowMs: 60000, max: 2, message: 'Too many attempts.' });
    const next = jest.fn();
    const res = fakeRes();
    ['1.1.1.1', '2.2.2.2', '3.3.3.3'].forEach((xff) => {
      mw({ headers: { 'x-forwarded-for': xff }, socket: { remoteAddress: '10.0.0.5' } }, res, next);
    });
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  test('separate clients are counted separately on Vercel', () => {
    process.env.VERCEL = '1';
    const { createRateLimiter } = require('../middleware/rateLimiter');
    const mw = createRateLimiter({ windowMs: 60000, max: 2, message: 'Too many attempts.' });
    const next = jest.fn();
    const mk = (xff) => ({ headers: { 'x-forwarded-for': xff }, socket: { remoteAddress: '10.0.0.5' } });
    for (let i = 0; i < 3; i += 1) mw(mk('9.9.9.1'), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
    mw(mk('9.9.9.2'), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(3);
  });
});

describe('P0 follow-up: migration safety', () => {
  const migrate = () => require('../scripts/migrate-shift-times');
  const OK = '--before=2026-05-20T10:00:00Z';

  test('parseArgs refuses --apply without --before', () => {
    expect(() => migrate().parseArgs(['--apply'])).toThrow(/--before/);
  });

  test('parseArgs rejects invalid or future --before', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    [
      '--before=yesterday',
      '--before=2026-02-31T00:00:00Z',
      '--before=2026-05-20T10:00:00+05:00',
      `--before=${future}`,
    ].forEach((arg) => {
      expect(() => migrate().parseArgs([arg])).toThrow(/--before/);
    });
  });

  test('parseArgs defaults to dry run', () => {
    const { parseArgs } = migrate();
    expect(parseArgs([])).toEqual({ apply: false, before: null });
    const dry = parseArgs([OK]);
    expect(dry.apply).toBe(false);
    expect(dry.before.getTime()).toBe(new Date('2026-05-20T10:00:00Z').getTime());
    expect(parseArgs(['--apply', OK]).apply).toBe(true);
  });

  test('buildFilter adds the createdAt cutoff only when before is set', () => {
    const { buildFilter } = migrate();
    expect(buildFilter(null)).toEqual({ timeShiftedAt: { $exists: false } });
    const before = new Date();
    expect(buildFilter(before)).toEqual({
      timeShiftedAt: { $exists: false },
      createdAt: { $lt: before },
    });
  });

  test('createRide stamps timeShiftedAt and the filter protects new and post-fix rides', async () => {
    const reg = await registerUser({ name: 'Mig Driver', email: 'mig@carpool.test' });
    const token = reg.body.data.token;
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pickupLocation: 'MIGRATION-TEST',
        destination: 'Somewhere',
        rideDate: formatLocalDate(4),
        departureTime: '09:00',
        availableSeats: 2,
        pricePerSeat: 10,
        whatsappNumber: '0310-5517386',
      });
    expect(res.status).toBe(201);
    const created = await Ride.findById(res.body.data.id).lean();
    expect(created.timeShiftedAt).toBeInstanceOf(Date);

    const mk = (createdAt) => ({
      driver: new mongoose.Types.ObjectId(reg.body.data.user.id),
      pickupLocation: 'MIGRATION-TEST',
      destination: 'Legacy',
      rideDate: formatLocalDate(4),
      departureTime: '09:00',
      departureDateTime: new Date(Date.now() + 86400000),
      availableSeats: 1,
      totalSeats: 1,
      pricePerSeat: 1,
      whatsappNumber: '923001112222',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt,
    });
    const old = await Ride.collection.insertOne(mk(new Date(Date.now() - 2 * 3600 * 1000)));
    const recent = await Ride.collection.insertOne(mk(new Date(Date.now() - 10 * 60 * 1000)));
    try {
      const before = new Date(Date.now() - 60 * 60 * 1000);
      const matched = await Ride.collection
        .find({ ...migrate().buildFilter(before), pickupLocation: 'MIGRATION-TEST' })
        .toArray();
      expect(matched.map((d) => String(d._id))).toEqual([String(old.insertedId)]);
    } finally {
      await Ride.collection.deleteMany({ _id: { $in: [old.insertedId, recent.insertedId] } });
    }
  });
});

describe('P1 vehicle type', () => {
  let token;
  let ownerId;
  const date = formatLocalDate(3);
  const baseRide = {
    pickupLocation: 'P1 Pickup',
    destination: 'P1 Dest',
    rideDate: date,
    departureTime: '09:00',
    availableSeats: 3,
    pricePerSeat: 100,
    whatsappNumber: '0310-5517386',
  };
  const post = (body) =>
    request(app).post('/api/rides').set('Authorization', `Bearer ${token}`).send(body);
  const patch = (id, body) =>
    request(app).patch(`/api/rides/${id}/seats`).set('Authorization', `Bearer ${token}`).send(body);
  const rawRide = (overrides = {}) => ({
    driver: new mongoose.Types.ObjectId(ownerId),
    pickupLocation: 'LEGACY-CAR',
    destination: 'Legacy Dest',
    rideDate: date,
    departureTime: '10:00',
    departureDateTime: new Date(Date.now() + 2 * 86400000),
    availableSeats: 2,
    totalSeats: 2,
    pricePerSeat: 50,
    whatsappNumber: '923001112222',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3 * 86400000),
    ...overrides,
  });

  let legacyId;
  let bikeId;

  beforeAll(async () => {
    const res = await registerUser({ name: 'P1 Driver', email: 'p1@carpool.test' });
    token = res.body.data.token;
    ownerId = res.body.data.user.id;
  });

  test('rides collection has the vehicle compound index plus the original and TTL indexes', async () => {
    await Ride.init();
    const idx = await Ride.collection.indexes();
    const keyOf = (i) => JSON.stringify(i.key);
    expect(idx.map(keyOf)).toContain(
      JSON.stringify({ status: 1, vehicleType: 1, rideDate: 1, departureDateTime: 1 })
    );
    expect(idx.map(keyOf)).toContain(
      JSON.stringify({ rideDate: 1, status: 1, departureDateTime: 1 })
    );
    const ttl = idx.find((i) => keyOf(i) === JSON.stringify({ expiresAt: 1 }));
    expect(ttl.expireAfterSeconds).toBe(0);
  });

  test('model rejects a bike with 2 seats and availableSeats above totalSeats; defaults to CAR', async () => {
    const doc = rawRide();
    delete doc.status;
    await expect(
      Ride.create({ ...doc, vehicleType: 'BIKE', totalSeats: 2, availableSeats: 2 })
    ).rejects.toThrow();
    await expect(Ride.create({ ...doc, totalSeats: 2, availableSeats: 3 })).rejects.toThrow();
    const ok = await Ride.create(doc);
    expect(ok.vehicleType).toBe('CAR');
    await Ride.findByIdAndDelete(ok._id);
  });

  test('creates a ride without vehicleType as CAR', async () => {
    const res = await post(baseRide);
    expect(res.status).toBe(201);
    const ride = await Ride.findById(res.body.data.id).lean();
    expect(ride.vehicleType).toBe('CAR');
    expect(ride.totalSeats).toBe(3);
  });

  test('creates an explicit CAR ride and a BIKE ride', async () => {
    const car = await post({ ...baseRide, vehicleType: 'CAR' });
    expect(car.status).toBe(201);
    const res = await post({
      ...baseRide,
      pickupLocation: 'BIKE-ONLY-ROUTE',
      vehicleType: 'BIKE',
      availableSeats: 1,
    });
    expect(res.status).toBe(201);
    bikeId = res.body.data.id;
    const ride = await Ride.findById(bikeId).lean();
    expect(ride).toMatchObject({ vehicleType: 'BIKE', totalSeats: 1, availableSeats: 1 });
  });

  test('bike create without seats stores 1', async () => {
    const body = { ...baseRide, vehicleType: 'BIKE' };
    delete body.availableSeats;
    const res = await post(body);
    expect(res.status).toBe(201);
    const ride = await Ride.findById(res.body.data.id).lean();
    expect(ride).toMatchObject({ totalSeats: 1, availableSeats: 1 });
  });

  test('rejects a bike with more than 1 seat', async () => {
    const bike = { ...baseRide, vehicleType: 'BIKE' };
    expect((await post({ ...bike, availableSeats: 2 })).status).toBe(400);
    expect((await post({ ...bike, availableSeats: 1, totalSeats: 2 })).status).toBe(400);
    expect((await post({ ...bike, availableSeats: '3' })).status).toBe(400);
    expect((await post({ ...bike, availableSeats: 0 })).status).toBe(400);
  });

  test('rejects invalid vehicleType values on create', async () => {
    for (const v of ['TRUCK', 'car', '', null, 123, ['CAR'], { $ne: 'x' }]) {
      const res = await post({ ...baseRide, vehicleType: v });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }
  });

  test('car seats keep 1..6 and per-ride capacity', async () => {
    expect((await post({ ...baseRide, availableSeats: 7 })).status).toBe(400);
    expect((await post({ ...baseRide, availableSeats: 0 })).status).toBe(400);
    const two = await post({ ...baseRide, availableSeats: 2 });
    const five = await post({ ...baseRide, availableSeats: 5 });
    expect((await patch(two.body.data.id, { availableSeats: 3 })).status).toBe(400);
    expect((await patch(five.body.data.id, { availableSeats: 5 })).status).toBe(200);
  });

  test('bike seats can never exceed 1 via updateSeats', async () => {
    const created = await post({ ...baseRide, vehicleType: 'BIKE', availableSeats: 1 });
    const id = created.body.data.id;
    const zero = await patch(id, { availableSeats: 0 });
    expect(zero.status).toBe(200);
    expect(zero.body.data.status).toBe('FULL');
    const one = await patch(id, { availableSeats: 1 });
    expect(one.status).toBe(200);
    expect(one.body.data.status).toBe('ACTIVE');
    expect((await patch(id, { availableSeats: 2 })).status).toBe(400);
    expect((await patch(id, { availableSeats: 6 })).status).toBe(400);

    const corrupt = await Ride.collection.insertOne(
      rawRide({ vehicleType: 'BIKE', totalSeats: 3, availableSeats: 0, pickupLocation: 'CORRUPT-BIKE' })
    );
    try {
      expect((await patch(String(corrupt.insertedId), { availableSeats: 2 })).status).toBe(400);
    } finally {
      await Ride.collection.deleteOne({ _id: corrupt.insertedId });
    }
  });

  test('legacy rides without vehicleType are treated as CAR', async () => {
    const ins = await Ride.collection.insertOne(rawRide());
    legacyId = String(ins.insertedId);
    const all = await request(app).get(`/api/rides?date=${date}`);
    expect(all.body.data.find((r) => r.id === legacyId).vehicleType).toBe('CAR');
    const cars = await request(app).get(`/api/rides?date=${date}&vehicleType=CAR`);
    expect(cars.body.data.map((r) => r.id)).toContain(legacyId);
    const bikes = await request(app).get(`/api/rides?date=${date}&vehicleType=BIKE`);
    expect(bikes.body.data.map((r) => r.id)).not.toContain(legacyId);

    const one = await request(app).get(`/api/rides/${legacyId}`);
    expect(one.body.data.vehicleType).toBe('CAR');
    const mine = await request(app).get('/api/rides/my-rides').set('Authorization', `Bearer ${token}`);
    expect(mine.body.data.find((r) => r.id === legacyId).vehicleType).toBe('CAR');
  });

  test('feed vehicleType filter works with date and keyword', async () => {
    const get = (qs) => request(app).get(`/api/rides?date=${date}${qs}`);
    const bikes = await get('&vehicleType=BIKE');
    expect(bikes.status).toBe(200);
    expect(bikes.body.data.length).toBeGreaterThan(0);
    bikes.body.data.forEach((r) => expect(r.vehicleType).toBe('BIKE'));
    expect(bikes.body.data.map((r) => r.id)).toContain(bikeId);

    const cars = await get('&vehicleType=CAR');
    cars.body.data.forEach((r) => expect(r.vehicleType).toBe('CAR'));
    expect(cars.body.data.map((r) => r.id)).toContain(legacyId);

    const both = await get('');
    expect(both.body.data.some((r) => r.vehicleType === 'BIKE')).toBe(true);
    expect(both.body.data.some((r) => r.vehicleType === 'CAR')).toBe(true);

    const kwBike = await get('&vehicleType=BIKE&keyword=BIKE-ONLY');
    expect(kwBike.body.data.map((r) => r.id)).toEqual([bikeId]);
    const kwCar = await get('&vehicleType=CAR&keyword=BIKE-ONLY');
    expect(kwCar.body.count).toBe(0);
    const empty = await get('&vehicleType=');
    expect(empty.status).toBe(200);
    expect(empty.body.count).toBe(both.body.count);
  });

  test('rejects invalid vehicleType query values', async () => {
    for (const qs of [
      'vehicleType=TRUCK',
      'vehicleType=car',
      'vehicleType=CAR&vehicleType=BIKE',
      'vehicleType[$ne]=BIKE',
    ]) {
      expect((await request(app).get(`/api/rides?${qs}`)).status).toBe(400);
    }
  });

  test('every ride output includes vehicleType', async () => {
    const one = await request(app).get(`/api/rides/${bikeId}`);
    expect(one.body.data.vehicleType).toBe('BIKE');
    const mine = await request(app).get('/api/rides/my-rides').set('Authorization', `Bearer ${token}`);
    expect(mine.body.data.find((r) => r.id === bikeId).vehicleType).toBe('BIKE');
    const list = await request(app).get('/api/rides');
    list.body.data.forEach((r) => expect(['CAR', 'BIKE']).toContain(r.vehicleType));
  });

  test('WhatsApp behavior is unchanged for bikes', async () => {
    const one = await request(app).get(`/api/rides/${bikeId}`);
    expect(one.body.data.canContact).toBe(false);
    expect(one.body.data).not.toHaveProperty('whatsappNumber');
    const list = await request(app).get('/api/rides');
    list.body.data.forEach((r) => expect(r).not.toHaveProperty('whatsappNumber'));
  });
});

describe('P2 multi-day scheduling', () => {
  const crypto = require('crypto');
  const uuid = () => crypto.randomUUID();
  let tokenA;
  let idA;
  let tokenB;
  let idB;
  const base = {
    pickupLocation: 'P2 Pickup',
    destination: 'P2 Dest',
    departureTime: '09:00',
    availableSeats: 3,
    pricePerSeat: 100,
    whatsappNumber: '0310-5517386',
  };
  const postAs = (token, body) =>
    request(app).post('/api/rides').set('Authorization', `Bearer ${token}`).send(body);
  const postA = (body) => postAs(tokenA, { ...base, ...body });
  const raw = (driver, overrides = {}) => ({
    driver: new mongoose.Types.ObjectId(driver),
    pickupLocation: 'RAW',
    destination: 'RAW Dest',
    rideDate: formatLocalDate(2),
    departureTime: '10:00',
    departureDateTime: new Date(Date.now() + 2 * 86400000),
    availableSeats: 2,
    totalSeats: 2,
    pricePerSeat: 50,
    whatsappNumber: '923001112222',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3 * 86400000),
    ...overrides,
  });
  const countA = () => Ride.countDocuments({ driver: idA });
  const dates = (...offsets) => offsets.map(formatLocalDate);

  beforeAll(async () => {
    const a = await registerUser({ name: 'P2 A', email: 'p2a@carpool.test' });
    tokenA = a.body.data.token;
    idA = a.body.data.user.id;
    const b = await registerUser({ name: 'P2 B', email: 'p2b@carpool.test' });
    tokenB = b.body.data.token;
    idB = b.body.data.user.id;
  });

  beforeEach(async () => {
    await Ride.deleteMany({ driver: { $in: [idA, idB] } });
  });

  test('rejects 7 dates, empty dates, duplicates, past, beyond window; accepts today+13', async () => {
    let res = await postA({ dates: dates(1, 2, 3, 4, 5, 6, 7) });
    expect(res.status).toBe(400);
    res = await postA({ dates: [] });
    expect(res.status).toBe(400);
    res = await postA({ dates: [formatLocalDate(2), formatLocalDate(2)] });
    expect(res.status).toBe(400);
    res = await postA({ dates: dates(-1) });
    expect(res.status).toBe(400);
    res = await postA({ dates: dates(14) });
    expect(res.status).toBe(400);
    expect(await countA()).toBe(0);
    res = await postA({ dates: dates(13) });
    expect(res.status).toBe(201);
  });

  test('rejects non-array dates, impossible calendar dates and bad clientRequestId', async () => {
    expect((await postA({ dates: '2030-01-01' })).status).toBe(400);
    expect((await postA({ dates: ['2026-02-30'] })).status).toBe(400);
    expect((await postA({ dates: dates(2), clientRequestId: 'x' })).status).toBe(400);
    expect((await postA({ dates: dates(2), clientRequestId: { $ne: 1 } })).status).toBe(400);
    expect(await countA()).toBe(0);
  });

  test('rejects a same-day departure under 5 minutes away', async () => {
    const soon = new Date(Date.now() + 2 * 60 * 1000 + 5 * 3600 * 1000);
    const hhmm = soon.toISOString().slice(11, 16);
    const res = await postA({ dates: dates(0), departureTime: hhmm });
    expect(res.status).toBe(400);
  });

  test('6 dates create 6 docs with one seriesId and correct PKT departure times', async () => {
    const id = uuid();
    const ds = dates(1, 2, 3, 4, 5, 6);
    const res = await postA({ dates: ds, clientRequestId: id });
    expect(res.status).toBe(201);
    expect(res.body.data.count).toBe(6);
    expect(res.body.data.seriesId).toBe(id);
    const docs = await Ride.find({ driver: idA }).sort({ rideDate: 1 });
    expect(docs).toHaveLength(6);
    docs.forEach((d, i) => {
      expect(d.seriesId).toBe(id);
      expect(d.rideDate).toBe(ds[i]);
      expect(d.departureDateTime.toISOString()).toBe(`${ds[i]}T04:00:00.000Z`);
      expect(d.expiresAt.getTime()).toBe(d.departureDateTime.getTime() + 15 * 60 * 1000);
      expect(d.totalSeats).toBe(3);
      expect(d.availableSeats).toBe(3);
    });
  });

  test('resubmitting the same clientRequestId creates nothing new; parallel posts do not duplicate', async () => {
    const id = uuid();
    const body = { dates: dates(1, 2, 3), clientRequestId: id };
    expect((await postA(body)).status).toBe(201);
    const again = await postA(body);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(again.body.data.count).toBe(3);
    expect(await countA()).toBe(3);

    const id2 = uuid();
    const results = await Promise.all([
      postA({ dates: dates(4, 5), clientRequestId: id2 }),
      postA({ dates: dates(4, 5), clientRequestId: id2 }),
    ]);
    results.forEach((r) => expect([200, 201]).toContain(r.status));
    expect(await Ride.countDocuments({ driver: idA, seriesId: id2 })).toBe(2);
  });

  test('partial earlier insert is completed on retry', async () => {
    const id = uuid();
    const ds = dates(1, 2, 3);
    await Ride.collection.insertOne(
      raw(idA, {
        seriesId: id,
        rideDate: ds[0],
        departureDateTime: dateHelpers.createDepartureDateTime(ds[0], '09:00'),
        expiresAt: new Date(Date.now() + 5 * 86400000),
      })
    );
    const res = await postA({ dates: ds, clientRequestId: id });
    expect(res.status).toBe(201);
    expect(await Ride.countDocuments({ driver: idA, seriesId: id })).toBe(3);
  });

  test('same clientRequestId from another driver does not collide', async () => {
    const id = uuid();
    expect((await postA({ dates: dates(1), clientRequestId: id })).status).toBe(201);
    const b = await postAs(tokenB, { ...base, dates: dates(1), clientRequestId: id });
    expect(b.status).toBe(201);
    expect(await Ride.countDocuments({ driver: idB, seriesId: id })).toBe(1);
  });

  test('cap of 7 is enforced across submissions; expired, cancelled and others do not count', async () => {
    await Ride.collection.insertMany([
      raw(idA, { expiresAt: new Date(Date.now() - 60000) }),
      raw(idA, { status: 'CANCELLED' }),
      raw(idB),
      raw(idB),
    ]);
    expect((await postA({ dates: dates(1, 2, 3, 4) })).status).toBe(201);
    const over = await postA({ dates: dates(5, 6, 7, 8) });
    expect(over.status).toBe(409);
    expect(over.body.message).toMatch(/at most 7/);
    expect((await postA({ dates: dates(5, 6, 7) })).status).toBe(201);
    expect((await postA({ dates: dates(8) })).status).toBe(409);
  });

  test('FULL rides count toward the cap', async () => {
    await Ride.collection.insertMany([
      raw(idA, { status: 'FULL', availableSeats: 0 }),
      raw(idA, { status: 'FULL', availableSeats: 0 }),
    ]);
    expect((await postA({ dates: dates(1, 2, 3, 4, 5) })).status).toBe(201);
    expect((await postA({ dates: dates(6) })).status).toBe(409);
  });

  test('unique partial index exists and legacy docs without seriesId can repeat', async () => {
    await Ride.init();
    const idx = await Ride.collection.indexes();
    const u = idx.find((i) => JSON.stringify(i.key) === JSON.stringify({ driver: 1, seriesId: 1, rideDate: 1 }));
    expect(u.unique).toBe(true);
    expect(u.partialFilterExpression).toBeDefined();
    expect(idx.map((i) => JSON.stringify(i.key))).toContain(
      JSON.stringify({ driver: 1, status: 1, expiresAt: 1 })
    );
    await Ride.collection.insertMany([raw(idA), raw(idA)]);
    expect(await countA()).toBe(2);
  });

  test('deleting one date leaves the others; non-owner gets 403', async () => {
    const res = await postA({ dates: dates(1, 2, 3), clientRequestId: uuid() });
    const [first] = res.body.data.rides;
    const forbidden = await request(app)
      .delete(`/api/rides/${first.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(forbidden.status).toBe(403);
    const del = await request(app)
      .delete(`/api/rides/${first.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(200);
    expect(await countA()).toBe(2);
  });

  test('series delete is owner-only and affects only that series', async () => {
    const s1 = uuid();
    const s2 = uuid();
    await postA({ dates: dates(1, 2), clientRequestId: s1 });
    await postA({ dates: dates(3), clientRequestId: s2 });
    await Ride.collection.insertOne(raw(idA)); // legacy
    await Ride.collection.insertOne(
      raw(idA, { seriesId: s1, rideDate: formatLocalDate(9), expiresAt: new Date(Date.now() - 1000) })
    );
    await postAs(tokenB, { ...base, dates: dates(1), clientRequestId: s1 });

    const other = await request(app)
      .delete(`/api/rides/series/${s1}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(other.status).toBe(200); // B's own s1 series only
    expect(await Ride.countDocuments({ driver: idA, seriesId: s1 })).toBe(3);

    const nonOwner = await request(app)
      .delete(`/api/rides/series/${s2}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(nonOwner.status).toBe(404);
    expect(await Ride.countDocuments({ driver: idA, seriesId: s2 })).toBe(1);

    const own = await request(app)
      .delete(`/api/rides/series/${s1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(own.status).toBe(200);
    expect(own.body.data.deletedCount).toBe(2);
    expect(await Ride.countDocuments({ driver: idA, seriesId: s1 })).toBe(1); // expired one kept
    expect(await Ride.countDocuments({ driver: idA, seriesId: s2 })).toBe(1);
    expect(await Ride.countDocuments({ driver: idA, seriesId: { $exists: false } })).toBe(1);
    expect(await Ride.countDocuments({ driver: idB })).toBe(0);

    const unknown = await request(app)
      .delete(`/api/rides/series/${uuid()}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(unknown.status).toBe(404);
    const bad = await request(app)
      .delete('/api/rides/series/bad!id')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(bad.status).toBe(400);
  });

  test('legacy rideDate payload still works, with and without clientRequestId', async () => {
    const res = await postA({ rideDate: formatLocalDate(2) });
    expect(res.status).toBe(201);
    expect(res.body.data.seriesId).toBeNull();
    const doc = await Ride.findById(res.body.data.id);
    expect(doc.seriesId).toBeUndefined();

    const id = uuid();
    expect((await postA({ rideDate: formatLocalDate(3), clientRequestId: id })).status).toBe(201);
    expect((await postA({ rideDate: formatLocalDate(3), clientRequestId: id })).status).toBe(200);
    expect(await countA()).toBe(2);
  });

  test('vehicle rules apply per instance', async () => {
    const bike = await postA({ dates: dates(1, 2, 3), vehicleType: 'BIKE', availableSeats: undefined });
    expect(bike.status).toBe(201);
    const docs = await Ride.find({ driver: idA });
    expect(docs).toHaveLength(3);
    docs.forEach((d) => {
      expect(d.vehicleType).toBe('BIKE');
      expect(d.totalSeats).toBe(1);
      expect(d.availableSeats).toBe(1);
    });
    expect((await postA({ dates: dates(4), vehicleType: 'BIKE', availableSeats: 3 })).status).toBe(400);
    expect((await postA({ dates: dates(4), vehicleType: 'TRUCK' })).status).toBe(400);
    const car = await postA({ dates: dates(4, 5), availableSeats: 4 });
    expect(car.status).toBe(201);
    expect(await Ride.countDocuments({ driver: idA, vehicleType: 'CAR', totalSeats: 4 })).toBe(2);
  });

  test('date search returns only that date instance; my-rides exposes seriesId; seats edit one date', async () => {
    const id = uuid();
    const [d1, d2] = dates(1, 2);
    const res = await postA({ dates: [d1, d2], clientRequestId: id, pickupLocation: 'SeriesSearch' });
    await Ride.collection.insertOne(raw(idA, { pickupLocation: 'LegacySearch', rideDate: d1 }));

    const f1 = await request(app).get(`/api/rides?date=${d1}`);
    const mine1 = f1.body.data.filter((r) => ['SeriesSearch', 'LegacySearch'].includes(r.pickupLocation));
    expect(mine1.map((r) => r.pickupLocation).sort()).toEqual(['LegacySearch', 'SeriesSearch']);
    const s1 = mine1.find((r) => r.pickupLocation === 'SeriesSearch');
    expect(s1.rideDate).toBe(d1);
    expect(s1.departureDateTime).toBe(`${d1}T04:00:00.000Z`);

    const f2 = await request(app).get(`/api/rides?date=${d2}`);
    const s2 = f2.body.data.filter((r) => r.pickupLocation === 'SeriesSearch');
    expect(s2).toHaveLength(1);
    expect(s2[0].rideDate).toBe(d2);

    const my = await request(app).get('/api/rides/my-rides').set('Authorization', `Bearer ${tokenA}`);
    const mySeries = my.body.data.filter((r) => r.pickupLocation === 'SeriesSearch');
    expect(mySeries.every((r) => r.seriesId === id)).toBe(true);
    expect(my.body.data.find((r) => r.pickupLocation === 'LegacySearch').seriesId).toBeNull();

    const target = res.body.data.rides[0];
    const upd = await request(app)
      .patch(`/api/rides/${target.id}/seats`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ availableSeats: 1 });
    expect(upd.status).toBe(200);
    const after = await Ride.find({ driver: idA, seriesId: id }).sort({ rideDate: 1 });
    expect(after.map((r) => r.availableSeats)).toEqual([1, 3]);
  });
});

describe('Road status priority sorting & admin gatekeeping', () => {
  let adminToken;
  let userToken;

  beforeAll(async () => {
    const adminRes = await registerUser({ name: 'Admin', email: 'admin@carpool.test' });
    adminToken = adminRes.body.data.token;
    const userRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@carpool.test', password: 'secret123' });
    userToken = userRes.body.data.token;
  });

  const createRoad = (token, body) =>
    request(app)
      .post('/api/road-status')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  test('admin is resolved through ADMIN_EMAIL', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.user.role).toBe('admin');
  });

  test('rejects road updates without a token (401)', async () => {
    const res = await request(app)
      .post('/api/road-status')
      .send({ roadName: 'Murree Road', status: 'CLOSED' });
    expect(res.status).toBe(401);
  });

  test('rejects road updates from non-admin users (403)', async () => {
    const res = await createRoad(userToken, { roadName: 'Murree Road', status: 'CLOSED' });
    expect(res.status).toBe(403);
  });

  test('returns roads sorted CLOSED -> RESTRICTED -> OPEN, newest first within a status', async () => {
    const created = [];
    const payloads = [
      { roadName: 'Kashmir Highway', status: 'OPEN', category: 'Twin Cities' },
      { roadName: 'Faizabad Interchange', status: 'CLOSED', category: 'Twin Cities' },
      { roadName: 'M-2 Motorway', status: 'RESTRICTED', category: 'Motorways & Highways' },
      { roadName: 'Expressway', status: 'OPEN', category: 'Twin Cities' },
    ];

    for (const payload of payloads) {
      const res = await createRoad(adminToken, payload);
      expect(res.status).toBe(201);
      created.push(res.body.data);
      await sleep(25);
    }

    const res = await request(app).get('/api/road-status');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.status)).toEqual(['CLOSED', 'RESTRICTED', 'OPEN', 'OPEN']);
    // Newer OPEN entry ("Expressway") comes before the older one
    expect(res.body.data[2].roadName).toBe('Expressway');
    expect(res.body.data[3].roadName).toBe('Kashmir Highway');
    expect(created).toHaveLength(4);
  });

  test('marks admin-authored updates as verified without exposing author details', async () => {
    const res = await request(app).get('/api/road-status');
    res.body.data.forEach((road) => {
      expect(road.verified).toBe(true);
      expect(road).not.toHaveProperty('updatedBy');
      expect(typeof road.updatedAt).toBe('string');
    });
  });

  test('category filter still works', async () => {
    const res = await request(app)
      .get('/api/road-status')
      .query({ category: 'Motorways & Highways' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].roadName).toBe('M-2 Motorway');
  });
});
