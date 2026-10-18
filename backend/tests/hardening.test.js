/**
 * Hardening tests: malformed ObjectIds return 404, Ride.whatsappNumber is select:false.
 * Uses an in-memory MongoDB, same pattern as api.test.js.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ADMIN_EMAIL = 'admin@carpool.test';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

let mongod;
let app;
let Ride;
let token;
let rideId;

const formatDate = (offsetDays) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  if (!process.env.MONGO_URI.startsWith('mongodb://127.0.0.1')) {
    throw new Error('Refusing to run tests against non-local MongoDB');
  }
  app = require('../server');
  Ride = require('../models/Ride');

  const reg = await request(app).post('/api/auth/register').send({
    name: 'Hardening User',
    email: 'hardening@carpool.test',
    password: 'secret123',
    phone: '03001234567',
  });
  token = reg.body.data.token;

  const created = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pickupLocation: 'Saddar, Rawalpindi',
      destination: 'Blue Area, Islamabad',
      rideDate: formatDate(1),
      departureTime: '08:30',
      availableSeats: 3,
      pricePerSeat: 200,
      whatsappNumber: '0310-5517386',
    });
  rideId = created.body.data.id;
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('malformed ObjectId handling', () => {
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  test('GET /api/rides/not-an-id -> 404', async () => {
    const res = await request(app).get('/api/rides/not-an-id');
    expect(res.status).toBe(404);
  });

  test('PATCH /api/rides/not-an-id/seats -> 404', async () => {
    const res = await auth(request(app).patch('/api/rides/not-an-id/seats')).send({ availableSeats: 1 });
    expect(res.status).toBe(404);
  });

  test('DELETE /api/rides/not-an-id -> 404', async () => {
    const res = await auth(request(app).delete('/api/rides/not-an-id'));
    expect(res.status).toBe(404);
  });

  test('GET /api/requests/not-an-id -> 404', async () => {
    const res = await auth(request(app).get('/api/requests/not-an-id'));
    expect(res.status).toBe(404);
  });
});

describe('Ride.whatsappNumber select:false', () => {
  test('stored, but only returned with an explicit +whatsappNumber select', async () => {
    const withPhone = await Ride.findById(rideId).select('+whatsappNumber').lean();
    expect(withPhone.whatsappNumber).toBeTruthy();
    const plain = await Ride.findById(rideId).lean();
    expect(plain).not.toHaveProperty('whatsappNumber');
  });

  test('API responses contain no phone', async () => {
    const one = await request(app).get(`/api/rides/${rideId}`);
    const list = await request(app).get(`/api/rides?date=${formatDate(1)}`);
    const mine = await request(app).get('/api/rides/my-rides').set('Authorization', `Bearer ${token}`);
    for (const res of [one, list, mine]) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/5517386|whatsappNumber/);
    }
  });
});
