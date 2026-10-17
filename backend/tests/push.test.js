/**
 * P4-B2 tests: Web Push. web-push is mocked; env values are clearly fake and test-only.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(() => Promise.resolve({ statusCode: 201 })),
}));

const webpush = require('web-push');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

let mongod;
let app;
let User;
let Ride;
let RideMatch;
let Conversation;
let PushSubscription;
let generateToken;
let chatHooks;
let counter = 0;

const DAY = 24 * 60 * 60 * 1000;
const FAKE_ENV = {
  VAPID_PUBLIC_KEY: 'fake-public-key-for-tests',
  VAPID_PRIVATE_KEY: 'fake-private-key-for-tests',
  VAPID_SUBJECT: 'mailto:test@example.invalid',
};
const setVapid = () => Object.assign(process.env, FAKE_ENV);
const clearVapid = () => Object.keys(FAKE_ENV).forEach((k) => delete process.env[k]);

const makeUser = async (name) => {
  counter += 1;
  const user = await User.create({
    name: name.length < 2 ? `User ${name}` : name,
    email: `pushuser${counter}@carpool.test`,
    password: 'secret123',
    phone: `0300888${1000 + counter}`,
  });
  return { user, token: generateToken(user._id) };
};
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const sub = (n, extra = {}) => ({
  endpoint: `https://push.example.test/send/${n}`,
  keys: { p256dh: 'p256dh-fake', auth: 'auth-fake' },
  ...extra,
});
const subscribe = (u, body) => request(app).post('/api/push/subscribe').set(auth(u)).send(body);

const makeChat = async () => {
  const d = await makeUser('Daniel Driver');
  const p = await makeUser('Priya Passenger');
  const dt = new Date(Date.now() + DAY);
  const ride = await Ride.create({
    driver: d.user._id,
    pickupLocation: 'SecretPickupPlace',
    destination: 'SecretDestPlace',
    rideDate: '2099-01-01',
    departureTime: '10:00',
    departureDateTime: dt,
    availableSeats: 2,
    totalSeats: 3,
    vehicleType: 'CAR',
    pricePerSeat: 100,
    whatsappNumber: '923001234567',
    status: 'ACTIVE',
    expiresAt: new Date(dt.getTime() + 15 * 60 * 1000),
  });
  const match = await RideMatch.create({
    ride: ride._id,
    passenger: p.user._id,
    driver: d.user._id,
    initiatedBy: 'PASSENGER',
    passengerCount: 1,
    status: 'ACCEPTED',
    seatsReserved: true,
    clientMatchId: `cm-push-${counter}`,
    expiresAt: ride.expiresAt,
  });
  const conv = await chatHooks.createChatForMatch(match);
  return { d, p, ride, match, conv };
};
const sendMsg = (u, convId, body) =>
  request(app)
    .post(`/api/chat/conversations/${convId}/messages`)
    .set(auth(u))
    .send({ body, clientMessageId: `cmid-${Date.now()}-${(counter += 1)}` });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);
  app = require('../server');
  User = require('../models/User');
  Ride = require('../models/Ride');
  RideMatch = require('../models/RideMatch');
  Conversation = require('../models/Conversation');
  PushSubscription = require('../models/PushSubscription');
  generateToken = require('../utils/generateToken');
  chatHooks = require('../utils/chatHooks');
  await PushSubscription.init();
});

afterAll(async () => {
  clearVapid();
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => {
  clearVapid();
  webpush.sendNotification.mockClear();
  webpush.sendNotification.mockImplementation(() => Promise.resolve({ statusCode: 201 }));
});

describe('public key + subscribe/unsubscribe', () => {
  test('requires auth', async () => {
    expect((await request(app).get('/api/push/public-key')).status).toBe(401);
  });

  test('public key is null when unset, public key only when set', async () => {
    const u = await makeUser('Anna A');
    let res = await request(app).get('/api/push/public-key').set(auth(u));
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBeNull();
    setVapid();
    res = await request(app).get('/api/push/public-key').set(auth(u));
    expect(res.body.data.key).toBe(FAKE_ENV.VAPID_PUBLIC_KEY);
    expect(JSON.stringify(res.body)).not.toContain(FAKE_ENV.VAPID_PRIVATE_KEY);
  });

  test('subscribe validates input', async () => {
    const u = await makeUser('Anna A');
    expect((await subscribe(u, {})).status).toBe(400);
    expect((await subscribe(u, sub(1, { endpoint: 'http://insecure.test/x' }))).status).toBe(400);
    expect((await subscribe(u, sub(1, { keys: { p256dh: 'x' } }))).status).toBe(400);
    expect((await subscribe(u, sub(1, { endpoint: `https://x.test/${'a'.repeat(600)}` }))).status).toBe(400);
  });

  test('subscribe upserts, reassigns endpoint, unsubscribe is owner-only', async () => {
    const a = await makeUser('Anna A');
    const b = await makeUser('Bob B');
    const s = sub(100);
    expect((await subscribe(a, s)).status).toBe(201);
    expect((await subscribe(a, s)).status).toBe(201);
    expect(await PushSubscription.countDocuments({ endpoint: s.endpoint })).toBe(1);

    // another user cannot delete it
    await request(app).delete('/api/push/subscribe').set(auth(b)).send({ endpoint: s.endpoint });
    expect(await PushSubscription.countDocuments({ endpoint: s.endpoint })).toBe(1);

    // resubscribing from another account reassigns it
    await subscribe(b, s);
    const doc = await PushSubscription.findOne({ endpoint: s.endpoint }).lean();
    expect(String(doc.user)).toBe(String(b.user._id));

    const res = await request(app).delete('/api/push/subscribe').set(auth(b)).send({ endpoint: s.endpoint });
    expect(res.status).toBe(200);
    expect(await PushSubscription.countDocuments({ endpoint: s.endpoint })).toBe(0);
  });

  test('caps subscriptions per user at 5', async () => {
    const u = await makeUser('Capped');
    for (let i = 0; i < 7; i += 1) {
      expect((await subscribe(u, sub(200 + i))).status).toBe(201);
    }
    expect(await PushSubscription.countDocuments({ user: u.user._id })).toBe(5);
  });
});

describe('push delivery', () => {
  test('no-op when VAPID is unset (chat still works)', async () => {
    const { d, p, conv } = await makeChat();
    await subscribe(d, sub(300));
    const res = await sendMsg(p, conv._id, 'hello there');
    expect(res.status).toBe(201);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(webpush.setVapidDetails).not.toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined
    );
  });

  test('payload is generic: no message text, names, places or sender identity', async () => {
    setVapid();
    const { d, p, conv } = await makeChat();
    await subscribe(d, sub(400));
    const secretText = 'my-super-secret-message-text';
    const res = await sendMsg(p, conv._id, secretText);
    expect(res.status).toBe(201);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [target, payload] = webpush.sendNotification.mock.calls[0];
    expect(target.endpoint).toBe(sub(400).endpoint);
    const parsed = JSON.parse(payload);
    expect(parsed).toEqual({
      title: 'Carpool',
      body: 'New message received',
      data: { type: 'message', url: '/chat' },
    });
    for (const leak of [
      secretText,
      'Priya',
      'Daniel',
      'SecretPickupPlace',
      'SecretDestPlace',
      String(p.user._id),
      String(conv._id),
      '923001234567',
    ]) {
      expect(payload).not.toContain(leak);
    }
  });

  test('throttle: one message push per conversation per 30s', async () => {
    setVapid();
    const { d, p, conv } = await makeChat();
    await subscribe(d, sub(500));
    await sendMsg(p, conv._id, 'one');
    await sendMsg(p, conv._id, 'two');
    await sendMsg(p, conv._id, 'three');
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    await Conversation.updateOne(
      { _id: conv._id },
      { $set: { 'lastPushAt.driver': new Date(Date.now() - 31000) } }
    );
    await sendMsg(p, conv._id, 'four');
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  test('throttle is per recipient: a reply within 30s still notifies the other person', async () => {
    setVapid();
    const { d, p, conv } = await makeChat();
    await subscribe(d, sub(510));
    await subscribe(p, sub(511));
    await sendMsg(p, conv._id, 'question');
    await sendMsg(d, conv._id, 'answer');
    const endpoints = webpush.sendNotification.mock.calls.map((c) => c[0].endpoint);
    expect(endpoints).toEqual([sub(510).endpoint, sub(511).endpoint]);
  });

  test('throttle window is not spent when recipient has no subscription', async () => {
    setVapid();
    const { d, p, conv } = await makeChat();
    await sendMsg(p, conv._id, 'nobody home');
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    const fresh = await Conversation.findById(conv._id).lean();
    expect(fresh.lastPushAt.driver).toBeFalsy();
    await subscribe(d, sub(520));
    await sendMsg(p, conv._id, 'now subscribed');
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  test.each([404, 410])('removes dead subscription on %i', async (code) => {
    setVapid();
    const { d, p, conv } = await makeChat();
    await subscribe(d, sub(600 + code));
    webpush.sendNotification.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('gone'), { statusCode: code }))
    );
    const res = await sendMsg(p, conv._id, 'hi');
    expect(res.status).toBe(201);
    expect(await PushSubscription.countDocuments({ endpoint: sub(600 + code).endpoint })).toBe(0);
  });

  test('other push errors never break the request and count failures', async () => {
    setVapid();
    const { d, p, conv } = await makeChat();
    await subscribe(d, sub(700));
    webpush.sendNotification.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('boom'), { statusCode: 500 }))
    );
    const res = await sendMsg(p, conv._id, 'hi');
    expect(res.status).toBe(201);
    const doc = await PushSubscription.findOne({ endpoint: sub(700).endpoint }).lean();
    expect(doc.failureCount).toBe(1);
  });

  test('match request, accept and decline notify with generic payloads', async () => {
    setVapid();
    const d = await makeUser('Dora Driver');
    const p = await makeUser('Paul Passenger');
    const dt = new Date(Date.now() + DAY);
    const ride = await Ride.create({
      driver: d.user._id,
      pickupLocation: 'Alpha',
      destination: 'Beta',
      rideDate: '2099-01-01',
      departureTime: '10:00',
      departureDateTime: dt,
      availableSeats: 3,
      totalSeats: 3,
      vehicleType: 'CAR',
      pricePerSeat: 100,
      whatsappNumber: '923001234567',
      status: 'ACTIVE',
      expiresAt: new Date(dt.getTime() + 15 * 60 * 1000),
    });
    await subscribe(d, sub(800));
    await subscribe(p, sub(801));

    const created = await request(app)
      .post('/api/matches')
      .set(auth(p))
      .send({ rideId: String(ride._id), clientMatchId: 'client-match-push-1' });
    expect(created.status).toBe(201);
    let calls = webpush.sendNotification.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].endpoint).toBe(sub(800).endpoint);
    expect(JSON.parse(calls[0][1])).toEqual({
      title: 'Carpool',
      body: 'New ride request',
      data: { type: 'offer', url: '/matches' },
    });

    webpush.sendNotification.mockClear();
    const accepted = await request(app)
      .post(`/api/matches/${created.body.data.id}/accept`)
      .set(auth(d));
    expect(accepted.status).toBe(200);
    calls = webpush.sendNotification.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].endpoint).toBe(sub(801).endpoint);
    expect(JSON.parse(calls[0][1]).body).toBe('Ride request update');

    // decline path
    const p2 = await makeUser('Second Passenger');
    await subscribe(p2, sub(802));
    const c2 = await request(app)
      .post('/api/matches')
      .set(auth(p2))
      .send({ rideId: String(ride._id), clientMatchId: 'client-match-push-2' });
    webpush.sendNotification.mockClear();
    const declined = await request(app)
      .post(`/api/matches/${c2.body.data.id}/decline`)
      .set(auth(d));
    expect(declined.status).toBe(200);
    calls = webpush.sendNotification.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].endpoint).toBe(sub(802).endpoint);
    expect(JSON.parse(calls[0][1]).body).toBe('Ride request update');
  });
});
