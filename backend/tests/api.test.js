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
const formatLocalDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
    expect(res.body.data.user.email).toBe('user@carpool.test');
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
    expect(res.body.data.user.email).toBe('user@carpool.test');
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
    expect(res.body.data.user.email).toBe('user@carpool.test');
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

  test('ride details mask the WhatsApp number for guests', async () => {
    const res = await request(app).get(`/api/rides/${rideId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.canContact).toBe(false);
    expect(res.body.data.whatsappNumber).toBeNull();
    expect(res.body.data.whatsappLink).toBeNull();
  });

  test('ride details stay masked when an invalid token is supplied', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', 'Bearer invalid.token.value');

    expect(res.status).toBe(200);
    expect(res.body.data.canContact).toBe(false);
    expect(res.body.data.whatsappNumber).toBeNull();
    expect(res.body.data.whatsappLink).toBeNull();
  });

  test('authenticated users receive the sanitized number and a wa.me deep link', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.canContact).toBe(true);
    expect(res.body.data.whatsappNumber).toBe('923105517386');
    expect(res.body.data.whatsappLink.startsWith('https://wa.me/923105517386?text=')).toBe(true);
  });

  describe('Ride TTL expiration', () => {
    test('calculateExpiration adds a 15-minute grace period to departure', () => {
      const departure = dateHelpers.createDepartureDateTime(rideDate, '08:30');
      const expiresAt = dateHelpers.calculateExpiration(departure);
      expect(expiresAt.getTime() - departure.getTime()).toBe(15 * 60 * 1000);
    });

    test('stored ride has expiresAt = departureDateTime + 15 minutes', async () => {
      const ride = await Ride.findById(rideId).lean();
      expect(ride.departureDateTime.getTime()).toBe(new Date(`${rideDate}T08:30:00`).getTime());
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
