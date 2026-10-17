/**
 * P4-A tests: seat reservation race. Reserve first, then claim; seats credited once.
 * In-memory MongoDB only.
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
let matchService;
let counter = 0;

const DAY = 24 * 60 * 60 * 1000;

const makeUser = async () => {
  counter += 1;
  const user = await User.create({
    name: 'Race User',
    email: `race${counter}@carpool.test`,
    password: 'secret123',
    phone: `0300888${String(1000 + counter)}`,
  });
  return { user, token: generateToken(user._id) };
};
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

const makeRide = (driver, { seats = 3, available = seats } = {}) => {
  const departureDateTime = new Date(Date.now() + DAY);
  return Ride.create({
    driver: driver.user._id,
    pickupLocation: 'DHA',
    destination: 'FAST',
    rideDate: '2099-01-01',
    departureTime: '10:00',
    departureDateTime,
    availableSeats: available,
    totalSeats: seats,
    vehicleType: 'CAR',
    pricePerSeat: 100,
    whatsappNumber: '923001234567',
    status: available === 0 ? 'FULL' : 'ACTIVE',
    expiresAt: new Date(departureDateTime.getTime() + 15 * 60 * 1000),
  });
};

let seq = 0;
// Passenger-initiated PENDING match (driver is the responder)
const makePending = async (ride, passenger, { count = 1, request: reqDoc = null } = {}) =>
  RideMatch.create({
    ride: ride._id,
    request: reqDoc ? reqDoc._id : null,
    passenger: passenger.user._id,
    driver: ride.driver,
    initiatedBy: 'PASSENGER',
    passengerCount: count,
    status: 'PENDING',
    clientMatchId: `race-${Date.now()}-${(seq += 1)}`,
    expiresAt: ride.expiresAt,
  });

const act = (u, id, action) => request(app).post(`/api/matches/${id}/${action}`).set(auth(u));

// 0 <= available <= total and available === total - sum(reserved ACCEPTED counts)
const expectInvariant = async (rideId) => {
  const ride = await Ride.findById(rideId);
  const held = await RideMatch.find({ ride: rideId, seatsReserved: true });
  const sum = held.reduce((s, m) => s + m.passengerCount, 0);
  expect(ride.availableSeats).toBeGreaterThanOrEqual(0);
  expect(ride.availableSeats).toBeLessThanOrEqual(ride.totalSeats);
  expect(ride.availableSeats).toBe(ride.totalSeats - sum);
  for (const m of held) expect(m.status).toBe('ACCEPTED');
  return ride;
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
  matchService = require('../utils/matchService');
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

describe('Seat reservation race', () => {
  test('accept sets seatsReserved and reduces seats', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { seats: 3 });
    const m = await makePending(ride, p, { count: 2 });
    const res = await act(d, m._id, 'accept');
    expect(res.status).toBe(200);
    const after = await RideMatch.findById(m._id);
    expect(after.status).toBe('ACCEPTED');
    expect(after.seatsReserved).toBe(true);
    expect((await expectInvariant(ride._id)).availableSeats).toBe(1);
  });

  test('concurrent accept vs cancel stays consistent', async () => {
    const d = await makeUser();
    const p = await makeUser();
    for (let i = 0; i < 10; i += 1) {
      await Promise.all([Ride.deleteMany({}), RideMatch.deleteMany({})]);
      const ride = await makeRide(d, { seats: 3 });
      const m = await makePending(ride, p, { count: 1 });
      await Promise.all([act(d, m._id, 'accept'), act(p, m._id, 'cancel')]);
      const after = await RideMatch.findById(m._id);
      const r = await expectInvariant(ride._id);
      if (after.status === 'CANCELLED') {
        expect(after.seatsReserved).toBe(false);
        expect(r.availableSeats).toBe(3);
      } else {
        expect(after.status).toBe('ACCEPTED');
        expect(after.seatsReserved).toBe(true);
        expect(r.availableSeats).toBe(2);
      }
    }
  });

  test('double cancel (sequential and concurrent) credits once', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { seats: 3 });
    const m = await makePending(ride, p, { count: 2 });
    expect((await act(d, m._id, 'accept')).status).toBe(200);
    expect((await act(p, m._id, 'cancel')).status).toBe(200);
    expect((await act(p, m._id, 'cancel')).status).toBe(409);
    expect((await expectInvariant(ride._id)).availableSeats).toBe(3);

    const m2 = await makePending(ride, p, { count: 2 });
    await act(d, m2._id, 'accept');
    await Promise.all([act(p, m2._id, 'cancel'), act(d, m2._id, 'cancel')]);
    expect((await expectInvariant(ride._id)).availableSeats).toBe(3);
    // direct double release is also a single credit
    await matchService.releaseSeatsForMatch(m2._id);
    await matchService.releaseSeatsForMatch(m2._id);
    expect((await expectInvariant(ride._id)).availableSeats).toBe(3);
  });

  test('failed reserve never exposes ACCEPTED', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { seats: 2, available: 1 });
    const m = await makePending(ride, p, { count: 2 });
    const res = await act(d, m._id, 'accept');
    expect(res.status).toBe(409);
    const after = await RideMatch.findById(m._id);
    expect(after.status).toBe('PENDING');
    expect(after.seatsReserved).toBe(false);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(1);
  });

  test('last-seat race with two accepts', async () => {
    const d = await makeUser();
    const p1 = await makeUser();
    const p2 = await makeUser();
    const ride = await makeRide(d, { seats: 1 });
    const m1 = await makePending(ride, p1);
    const m2 = await makePending(ride, p2);
    const results = await Promise.all([act(d, m1._id, 'accept'), act(d, m2._id, 'accept')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const r = await expectInvariant(ride._id);
    expect(r.availableSeats).toBe(0);
    expect(r.status).toBe('FULL');
    expect(await RideMatch.countDocuments({ status: 'ACCEPTED' })).toBe(1);
  });

  test('claim failure restores reserved seats (capped, FULL -> ACTIVE)', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { seats: 1 });
    const m = await makePending(ride, p);
    jest.spyOn(matchService, 'claimMatch').mockResolvedValueOnce(null);
    const res = await act(d, m._id, 'accept');
    expect(res.status).toBe(409);
    const r = await Ride.findById(ride._id);
    expect(r.availableSeats).toBe(1);
    expect(r.status).toBe('ACTIVE');
    expect((await RideMatch.findById(m._id)).status).toBe('PENDING');
    // restore can never exceed totalSeats
    await matchService.restoreSeats(ride._id, 5);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(1);
  });

  test('claim throwing restores seats', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { seats: 2 });
    const m = await makePending(ride, p);
    jest.spyOn(matchService, 'claimMatch').mockRejectedValueOnce(new Error('boom'));
    const res = await act(d, m._id, 'accept');
    expect(res.status).toBe(500);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(2);
  });

  test('linked request failure compensates (match back to PENDING, seats restored)', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { seats: 2 });
    const reqDoc = await RideRequest.create({
      passenger: p.user._id,
      pickupLocation: 'Gulshan',
      destination: 'University',
      requestDate: '2099-01-01',
      departureTime: '09:00',
      departureDateTime: ride.departureDateTime,
      expiresAt: ride.expiresAt,
      purgeAt: new Date(ride.expiresAt.getTime() + DAY),
      vehiclePreference: 'CAR',
      passengerCount: 1,
      status: 'ACTIVE',
    });
    const m = await makePending(ride, p, { request: reqDoc });
    // request becomes non-ACTIVE after the pre-check but before the final update
    const realClaim = matchService.claimMatch;
    jest.spyOn(matchService, 'claimMatch').mockImplementationOnce(async (...a) => {
      const out = await realClaim(...a);
      await RideRequest.updateOne({ _id: reqDoc._id }, { $set: { status: 'CANCELLED' } });
      return out;
    });
    const res = await act(d, m._id, 'accept');
    expect(res.status).toBe(409);
    const after = await RideMatch.findById(m._id);
    expect(after.status).toBe('PENDING');
    expect(after.seatsReserved).toBe(false);
    expect((await expectInvariant(ride._id)).availableSeats).toBe(2);
  });

  test('reconcileSeats credits stuck cancelled matches once', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d, { seats: 3, available: 1 });
    await RideMatch.create({
      ride: ride._id,
      passenger: p.user._id,
      driver: d.user._id,
      initiatedBy: 'PASSENGER',
      passengerCount: 2,
      status: 'CANCELLED',
      seatsReserved: true,
      expiresAt: ride.expiresAt,
    });
    expect((await matchService.reconcileSeats()).released).toBe(1);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(3);
    expect((await matchService.reconcileSeats()).released).toBe(0);
    expect((await Ride.findById(ride._id)).availableSeats).toBe(3);
  });
});
