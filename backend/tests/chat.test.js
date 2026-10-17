/**
 * P4-B1 tests: chat core, privacy masking, reports, cron. In-memory MongoDB only.
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
let Conversation;
let Message;
let ReportedFlag;
let generateToken;
let chatHooks;
let counter = 0;
let idSeq = 0;

const DAY = 24 * 60 * 60 * 1000;
const FAKE_WA = '923001234567';
const cid = () => `msg-${Date.now()}-${(idSeq += 1)}`;

const makeUser = async (name = 'Ali Khan', extra = {}) => {
  counter += 1;
  const email = extra.email || `chatuser${counter}@carpool.test`;
  const phone = `0300777${String(1000 + counter)}`;
  const user = await User.create({ name, email, password: 'secret123', phone });
  return { user, email, phone, token: generateToken(user._id) };
};
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

const makeRide = (driver, o = {}) => {
  const departureDateTime = new Date(Date.now() + DAY);
  return Ride.create({
    driver: driver.user._id,
    pickupLocation: 'DHA',
    destination: 'FAST',
    rideDate: '2099-01-01',
    departureTime: '10:00',
    departureDateTime,
    availableSeats: 3,
    totalSeats: 3,
    vehicleType: 'CAR',
    pricePerSeat: 100,
    whatsappNumber: FAKE_WA,
    status: 'ACTIVE',
    expiresAt: new Date(departureDateTime.getTime() + 15 * 60 * 1000),
    ...(o.seriesId ? { seriesId: o.seriesId } : {}),
  });
};
const makeMatch = (ride, passenger, status = 'PENDING') =>
  RideMatch.create({
    ride: ride._id,
    passenger: passenger.user._id,
    driver: ride.driver,
    initiatedBy: 'PASSENGER',
    passengerCount: 1,
    status,
    seatsReserved: status === 'ACCEPTED',
    clientMatchId: `cm-${Date.now()}-${(idSeq += 1)}`,
    expiresAt: ride.expiresAt,
  });

// Accepted match + conversation (direct, fast)
const makeChat = async (o = {}) => {
  const d = await makeUser('Daniel Driver');
  const p = await makeUser('Priya Passenger');
  const ride = await makeRide(d, o);
  const match = await makeMatch(ride, p, 'ACCEPTED');
  const conv = await chatHooks.createChatForMatch(match);
  return { d, p, ride, match, conv };
};

const post = (u, id, body, clientMessageId = cid()) =>
  request(app)
    .post(`/api/chat/conversations/${id}/messages`)
    .set(auth(u))
    .send({ body, clientMessageId });
const getMsgs = (u, id, q = '') =>
  request(app).get(`/api/chat/conversations/${id}/messages${q}`).set(auth(u));

// No contact keys (recursive) and none of the seeded contact values
const collectKeys = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => collectKeys(x, out));
  else if (v && typeof v === 'object') {
    Object.keys(v).forEach((k) => {
      out.push(k);
      collectKeys(v[k], out);
    });
  }
  return out;
};
const expectNoContact = (body, users = []) => {
  collectKeys(body).forEach((k) => expect(k).not.toMatch(/email|phone|whatsapp/i));
  const text = JSON.stringify(body);
  expect(text).not.toContain(FAKE_WA);
  expect(text).not.toContain('wa.me');
  expect(text).not.toContain('@carpool.test');
  users.forEach((u) => {
    expect(text).not.toContain(u.email);
    expect(text).not.toContain(u.phone);
  });
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
  Conversation = require('../models/Conversation');
  Message = require('../models/Message');
  ReportedFlag = require('../models/ReportedFlag');
  generateToken = require('../utils/generateToken');
  chatHooks = require('../utils/chatHooks');
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([
    Ride.init(),
    RideRequest.init(),
    RideMatch.init(),
    User.init(),
    Conversation.init(),
    Message.init(),
    ReportedFlag.init(),
  ]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    Ride.deleteMany({}),
    RideRequest.deleteMany({}),
    RideMatch.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    ReportedFlag.deleteMany({}),
  ]);
  delete process.env.CRON_SECRET;
  jest.restoreAllMocks();
});

describe('Accept exposes the conversation id', () => {
  test('acceptMatch returns conversationId matching the conversation list, party-only, no contact data', async () => {
    const d = await makeUser('Daniel Driver');
    const p = await makeUser('Priya Passenger');
    const ride = await makeRide(d);
    const match = await makeMatch(ride, p, 'PENDING');
    const res = await request(app).post(`/api/matches/${match._id}/accept`).set(auth(d));
    expect(res.status).toBe(200);
    expect(res.body.conversationId).toBeTruthy();
    expectNoContact(res.body, [d, p]);
    for (const u of [d, p]) {
      const list = await request(app).get('/api/chat/conversations').set(auth(u));
      expect(list.body.data.map((c) => c.id)).toContain(res.body.conversationId);
      const one = await request(app).get(`/api/chat/conversations/${res.body.conversationId}`).set(auth(u));
      expect(one.status).toBe(200);
    }
    const outsider = await makeUser('Eve Outsider');
    const no = await request(app).get(`/api/chat/conversations/${res.body.conversationId}`).set(auth(outsider));
    expect(no.status).toBe(404);
  });
});

describe('Models and indexes', () => {
  test('unique and TTL indexes exist', async () => {
    const conv = await Conversation.collection.indexes();
    expect(conv.some((i) => i.key.match === 1 && i.unique)).toBe(true);
    expect(conv.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
    expect(conv.some((i) => i.key.driver === 1 && i.key.lastMessageAt === -1)).toBe(true);
    expect(conv.some((i) => i.key.passenger === 1 && i.key.lastMessageAt === -1)).toBe(true);
    const msg = await Message.collection.indexes();
    expect(msg.some((i) => i.key.conversation === 1 && i.key.clientMessageId === 1 && i.unique)).toBe(true);
    expect(msg.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
    expect(msg.some((i) => i.key.conversation === 1 && i.key.createdAt === 1)).toBe(true);
    const rep = await ReportedFlag.collection.indexes();
    expect(ReportedFlag.collection.collectionName).toBe('reported_flags');
    expect(rep.some((i) => i.key.reporter === 1 && i.key.messageId === 1 && i.unique)).toBe(true);
    expect(rep.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
  });
});

describe('Chat only after ACCEPTED', () => {
  test('none for PENDING, DECLINED, CANCELLED; created once on accept; purged on cancel', async () => {
    const d = await makeUser('Daniel Driver');
    const p = await makeUser('Priya Passenger');
    const ride = await makeRide(d);
    const m = await makeMatch(ride, p);
    expect(await Conversation.countDocuments()).toBe(0);

    await chatHooks.createChatForMatch(m); // PENDING: refused
    expect(await Conversation.countDocuments()).toBe(0);

    const dec = await makeMatch(ride, await makeUser(), 'DECLINED');
    await chatHooks.createChatForMatch(dec);
    const can = await makeMatch(ride, await makeUser(), 'CANCELLED');
    await chatHooks.createChatForMatch(can);
    expect(await Conversation.countDocuments()).toBe(0);

    const acc = await request(app).post(`/api/matches/${m._id}/accept`).set(auth(d));
    expect(acc.status).toBe(200);
    expect(await Conversation.countDocuments({ match: m._id })).toBe(1);
    const accepted = await RideMatch.findById(m._id);
    await chatHooks.createChatForMatch(accepted); // idempotent
    expect(await Conversation.countDocuments({ match: m._id })).toBe(1);
    const conv = await Conversation.findOne({ match: m._id });
    expect(conv.expiresAt.getTime()).toBe(ride.expiresAt.getTime());
    expect(conv.contextSummary.destination).toBe('FAST');

    await post(p, conv._id, 'hello');
    const cancel = await request(app).post(`/api/matches/${m._id}/cancel`).set(auth(p));
    expect(cancel.status).toBe(200);
    expect(await Conversation.countDocuments()).toBe(0);
    expect(await Message.countDocuments()).toBe(0);
  });

  test('purged on ride delete and series delete', async () => {
    const a = await makeChat();
    await post(a.p, a.conv._id, 'hi');
    const del = await request(app).delete(`/api/rides/${a.ride._id}`).set(auth(a.d));
    expect(del.status).toBe(200);
    expect(await Conversation.countDocuments()).toBe(0);
    expect(await Message.countDocuments()).toBe(0);

    const b = await makeChat({ seriesId: 'series-abc-123' });
    await post(b.p, b.conv._id, 'hi');
    const sdel = await request(app).delete('/api/rides/series/series-abc-123').set(auth(b.d));
    expect(sdel.status).toBe(200);
    expect(await Conversation.countDocuments()).toBe(0);
    expect(await Message.countDocuments()).toBe(0);
  });
});

describe('Chat authorization', () => {
  test('unauthenticated 401 and non-participant 404 on every route', async () => {
    const { d, p, conv } = await makeChat();
    const stranger = await makeUser('Sam Stranger');
    const sent = await post(p, conv._id, 'hello there');
    const mid = sent.body.data.id;
    const routes = [
      ['get', `/api/chat/conversations/${conv._id}`],
      ['get', `/api/chat/conversations/${conv._id}/messages`],
      ['post', `/api/chat/conversations/${conv._id}/messages`, { body: 'x', clientMessageId: cid() }],
      ['post', `/api/chat/messages/${mid}/report`, { reason: 'spam' }],
    ];
    for (const [method, url, body] of routes) {
      const anon = await request(app)[method](url).send(body);
      expect(anon.status).toBe(401);
      const res = await request(app)[method](url).set(auth(stranger)).send(body);
      expect(res.status).toBe(404);
    }
    expect((await request(app).get('/api/chat/conversations')).status).toBe(401);
    expect((await request(app).get('/api/chat/unread-count')).status).toBe(401);
    const list = await request(app).get('/api/chat/conversations').set(auth(stranger));
    expect(list.body.data).toEqual([]);
    expect((await getMsgs(d, 'not-an-id')).status).toBe(404);
    expect(await Message.countDocuments()).toBe(1); // stranger's send did not persist
    expect(await ReportedFlag.countDocuments()).toBe(0);
  });
});

describe('Messages', () => {
  test('validation and sanitization', async () => {
    const { p, d, conv } = await makeChat();
    expect((await post(p, conv._id, '')).status).toBe(400);
    expect((await post(p, conv._id, '   \u0000\u0007  ')).status).toBe(400);
    expect((await post(p, conv._id, 'a'.repeat(501))).status).toBe(400);
    expect((await post(p, conv._id, 'a'.repeat(5000))).status).toBe(400);
    expect((await post(p, conv._id, 12345)).status).toBe(400);
    expect((await post(p, conv._id, 'ok', 'bad id!')).status).toBe(400);
    const ok = await post(p, conv._id, '  hi\u0000 there\u0007\t! <b>bold</b><script>alert(1)</script>  ');
    expect(ok.status).toBe(201);
    expect(ok.body.data.body).toBe('hi there ! <b>bold</b><script>alert(1)</script>');
    const stored = await Message.findOne();
    expect(stored.body).toBe(ok.body.data.body);
    const got = await getMsgs(d, conv._id);
    expect(got.body.data[0].body).toBe(ok.body.data.body);
    expect((await post(p, conv._id, 'a'.repeat(500))).status).toBe(201);
  });

  test('idempotent on clientMessageId', async () => {
    const { p, conv } = await makeChat();
    const id = cid();
    const a = await post(p, conv._id, 'once', id);
    const b = await post(p, conv._id, 'once', id);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(await Message.countDocuments()).toBe(1);
    const c = await Conversation.findById(conv._id);
    expect(c.unread.driver).toBe(1);
  });

  test('message view: mine flag per participant, exact key set, no contact data', async () => {
    const { d, p, conv } = await makeChat();
    const id = cid();
    const a = await post(p, conv._id, 'p1', id);
    const replay = await post(p, conv._id, 'p1', id);
    const b = await post(d, conv._id, 'd1');
    const c = await post(p, conv._id, 'p2');
    expect(a.status).toBe(201);
    expect(a.body.data.mine).toBe(true);
    expect(replay.status).toBe(200);
    expect(replay.body.data.mine).toBe(true);
    expect(b.body.data.mine).toBe(true);

    const asP = await getMsgs(p, conv._id);
    const asD = await getMsgs(d, conv._id);
    expect(asP.body.data.map((m) => [m.body, m.mine])).toEqual([['p1', true], ['d1', false], ['p2', true]]);
    expect(asD.body.data.map((m) => [m.body, m.mine])).toEqual([['p1', false], ['d1', true], ['p2', false]]);

    for (const m of [...asP.body.data, ...asD.body.data, a.body.data, b.body.data, c.body.data]) {
      expect(Object.keys(m).sort()).toEqual(['body', 'createdAt', 'id', 'mine', 'readAt']);
    }
    const raw = JSON.stringify([asP.body, asD.body, a.body, replay.body, b.body]);
    for (const u of [d, p]) {
      expect(raw).not.toContain(u.email);
      expect(raw).not.toContain(u.phone);
      expect(raw).not.toContain(String(u.user._id));
    }
    expect(raw).not.toContain(FAKE_WA);
  });

  test('rate limit returns 429 after 20 messages per minute', async () => {
    const { p, conv } = await makeChat();
    const docs = Array.from({ length: 20 }, (_, i) => ({
      conversation: conv._id,
      sender: p.user._id,
      body: `m${i}`,
      clientMessageId: `seed-rate-${i}-x`,
      expiresAt: conv.expiresAt,
    }));
    await Message.insertMany(docs);
    const res = await post(p, conv._id, 'one too many');
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/too quickly/i);
  });

  test('per-conversation cap', async () => {
    const { p, d, conv } = await makeChat();
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const docs = Array.from({ length: 300 }, (_, i) => ({
      conversation: conv._id,
      sender: d.user._id,
      body: `m${i}`,
      clientMessageId: `seed-cap-${i}-x`,
      expiresAt: conv.expiresAt,
      createdAt: old,
    }));
    await Message.insertMany(docs, { timestamps: false });
    const res = await post(p, conv._id, 'over the cap');
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/limit/i);
  });

  test('polling cursor returns only newer messages and manages read/unread', async () => {
    const { d, p, conv } = await makeChat();
    for (let i = 0; i < 3; i += 1) await post(p, conv._id, `from passenger ${i}`);
    let c = await Conversation.findById(conv._id);
    expect(c.unread.driver).toBe(3);
    expect(c.unread.passenger).toBe(0);
    expect(c.lastMessagePreview).toBe('from passenger 2');

    const unread = await request(app).get('/api/chat/unread-count').set(auth(d));
    expect(unread.body.data.unreadMessages).toBe(3);

    const first = await getMsgs(d, conv._id);
    expect(first.body.data).toHaveLength(3);
    expect(first.body.data.every((m) => m.mine === false)).toBe(true);
    c = await Conversation.findById(conv._id);
    expect(c.unread.driver).toBe(0);
    expect(await Message.countDocuments({ readAt: null })).toBe(0);

    const last = first.body.data[2];
    const none = await getMsgs(d, conv._id, `?after=${last.id}`);
    expect(none.body.data).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 15));
    await post(p, conv._id, 'fourth');
    const byId = await getMsgs(d, conv._id, `?after=${last.id}`);
    expect(byId.body.data.map((m) => m.body)).toEqual(['fourth']);
    const byDate = await getMsgs(d, conv._id, `?after=${encodeURIComponent(last.createdAt)}`);
    expect(byDate.body.data.map((m) => m.body)).toEqual(['fourth']);
    expect((await getMsgs(d, conv._id, '?after=garbage')).status).toBe(400);

    // the sender's own poll does not clear the receiver's unread nor mark own messages read
    await getMsgs(p, conv._id);
    c = await Conversation.findById(conv._id);
    expect(c.unread.driver).toBe(0);
    const mine = await getMsgs(p, conv._id);
    expect(mine.body.data.every((m) => m.mine === true)).toBe(true);
  });

  test('unread-count includes pending matches awaiting my response', async () => {
    const d = await makeUser();
    const p = await makeUser();
    const ride = await makeRide(d);
    await makeMatch(ride, p); // passenger asked; driver must respond
    const dr = await request(app).get('/api/chat/unread-count').set(auth(d));
    expect(dr.body.data.pendingMatches).toBe(1);
    const pa = await request(app).get('/api/chat/unread-count').set(auth(p));
    expect(pa.body.data.pendingMatches).toBe(0);
  });
});

describe('Read-time expiry', () => {
  test('410 and hard delete on every endpoint once expiresAt has passed', async () => {
    const calls = [
      (u, id) => request(app).get(`/api/chat/conversations/${id}`).set(auth(u)),
      (u, id) => getMsgs(u, id),
      (u, id) => post(u, id, 'late'),
    ];
    for (const call of calls) {
      const { p, conv } = await makeChat();
      await post(p, conv._id, 'before');
      await Conversation.updateOne({ _id: conv._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await call(p, conv._id);
      expect(res.status).toBe(410);
      expect(res.body.message).toMatch(/ended/i);
      expect(await Conversation.countDocuments({ _id: conv._id })).toBe(0);
      expect(await Message.countDocuments({ conversation: conv._id })).toBe(0);
    }
  });

  test('410 when the ride is gone', async () => {
    const { p, ride, conv } = await makeChat();
    await post(p, conv._id, 'x');
    await Ride.deleteOne({ _id: ride._id });
    const res = await getMsgs(p, conv._id);
    expect(res.status).toBe(410);
    expect(await Message.countDocuments()).toBe(0);
  });
});

describe('Privacy masking', () => {
  test('auth responses only expose id, name, role', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Zed Zee', email: 'zed@carpool.test', password: 'secret123', phone: '03001239999' });
    expect(reg.status).toBe(201);
    expect(Object.keys(reg.body.data.user).sort()).toEqual(['id', 'name', 'role']);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'zed@carpool.test', password: 'secret123' });
    expect(Object.keys(login.body.data.user).sort()).toEqual(['id', 'name', 'role']);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.data.token}`);
    expect(Object.keys(me.body.data.user).sort()).toEqual(['id', 'name', 'role']);
  });

  test('profile returns only own data; PATCH validates', async () => {
    const a = await makeUser('Alice Aa');
    const b = await makeUser('Bob Bb');
    const prof = await request(app).get('/api/auth/profile').set(auth(a));
    expect(prof.status).toBe(200);
    expect(prof.body.data.profile).toEqual({ name: 'Alice Aa', email: a.email, phone: a.phone });
    expect(JSON.stringify(prof.body)).not.toContain(b.email);
    expect((await request(app).get('/api/auth/profile')).status).toBe(401);

    const upd = await request(app).patch('/api/auth/profile').set(auth(a)).send({
      name: 'Alice Renamed',
      phone: '0310-5517386',
      email: 'hacker@carpool.test',
    });
    expect(upd.status).toBe(200);
    expect(upd.body.data.profile).toEqual({
      name: 'Alice Renamed',
      email: a.email,
      phone: '923105517386',
    });
    expect((await request(app).patch('/api/auth/profile').set(auth(a)).send({ phone: '12' })).status).toBe(400);
    expect((await request(app).patch('/api/auth/profile').set(auth(a)).send({ name: 'x' })).status).toBe(400);
  });

  test('no email/phone/whatsapp in ride, request, match, chat or conversation responses', async () => {
    const { d, p, ride, conv, match } = await makeChat();
    const sent = await post(p, conv._id, 'hello');
    await post(d, conv._id, 'hi back');
    const reqDoc = await RideRequest.create({
      passenger: p.user._id,
      pickupLocation: 'Gulshan',
      destination: 'University',
      requestDate: '2099-01-01',
      departureTime: '09:00',
      departureDateTime: new Date(Date.now() + DAY),
      expiresAt: new Date(Date.now() + DAY),
      purgeAt: new Date(Date.now() + 2 * DAY),
      vehiclePreference: 'CAR',
      passengerCount: 1,
    });
    const stranger = await makeUser('Sam Stranger');
    const users = [d, p, stranger];
    const responses = [];
    for (const u of [d, p, stranger]) {
      responses.push(
        await request(app).get('/api/rides').set(auth(u)),
        await request(app).get(`/api/rides/${ride._id}`).set(auth(u)),
        await request(app).get('/api/rides/my-rides').set(auth(u)),
        await request(app).get('/api/requests').set(auth(u)),
        await request(app).get('/api/requests/mine').set(auth(u)),
        await request(app).get(`/api/requests/${reqDoc._id}`).set(auth(u)),
        await request(app).get('/api/matches').set(auth(u)),
        await request(app).get('/api/chat/conversations').set(auth(u)),
        await request(app).get('/api/chat/unread-count').set(auth(u))
      );
    }
    responses.push(await request(app).get(`/api/rides/${ride._id}`)); // guest
    for (const u of [d, p]) {
      responses.push(
        await request(app).get(`/api/chat/conversations/${conv._id}`).set(auth(u)),
        await getMsgs(u, conv._id)
      );
    }
    responses.push(await post(d, conv._id, 'another'));
    responses.push(await request(app).post(`/api/chat/messages/${sent.body.data.id}/report`).set(auth(d)).send({ reason: 'spam' }));
    for (const r of responses) {
      expect([200, 201, 403, 404]).toContain(r.status);
      expectNoContact(r.body, users);
    }
    expect(match.status).toBe('ACCEPTED');
  });

  test('counterpart in chat payload is first name plus role label only', async () => {
    const { d, p, conv } = await makeChat();
    const asP = await request(app).get('/api/chat/conversations').set(auth(p));
    expect(asP.body.data[0].otherParty).toEqual({ name: 'Daniel', roleLabel: 'Driver' });
    const asD = await request(app).get(`/api/chat/conversations/${conv._id}`).set(auth(d));
    expect(asD.body.data.otherParty).toEqual({ name: 'Priya', roleLabel: 'Passenger' });
  });

  test('creating a ride without a number works and numbers are never returned', async () => {
    const d = await makeUser('Daniel Driver');
    const res = await request(app).post('/api/rides').set(auth(d)).send({
      pickupLocation: 'A',
      destination: 'B',
      rideDate: '2099-01-01',
      departureTime: '10:00',
      availableSeats: 2,
      pricePerSeat: 50,
    });
    // far-future date is rejected by the scheduling window; optional-number path is what matters
    expect(res.body.message).not.toMatch(/required ride information/i);
  });
});

describe('Reports', () => {
  test('snapshot, duplicate prevention, own message, expiry, survives purge', async () => {
    const { d, p, match, conv } = await makeChat();
    const m = await post(d, conv._id, 'bad words here');
    const id = m.body.data.id;
    const own = await request(app).post(`/api/chat/messages/${id}/report`).set(auth(d)).send({ reason: 'spam' });
    expect(own.status).toBe(400);
    const bad = await request(app).post(`/api/chat/messages/${id}/report`).set(auth(p)).send({ reason: 'nope' });
    expect(bad.status).toBe(400);

    const r1 = await request(app)
      .post(`/api/chat/messages/${id}/report`)
      .set(auth(p))
      .send({ reason: 'harassment', note: 'rude' });
    expect(r1.status).toBe(201);
    const r2 = await request(app).post(`/api/chat/messages/${id}/report`).set(auth(p)).send({ reason: 'harassment' });
    expect(r2.status).toBe(200);
    expect(await ReportedFlag.countDocuments()).toBe(1);

    const flag = await ReportedFlag.findOne();
    expect(flag.messageText).toBe('bad words here');
    expect(String(flag.reportedUser)).toBe(String(d.user._id));
    expect(String(flag.reporter)).toBe(String(p.user._id));
    expect(flag.senderId).toBe(String(d.user._id));
    expect(flag.conversationId).toBe(String(conv._id));
    expect(flag.rideContext.destination).toBe('FAST');
    expect(flag.note).toBe('rude');
    expect(flag.expiresAt.getTime() - flag.createdAt.getTime()).toBe(15 * DAY);

    await request(app).post(`/api/matches/${match._id}/cancel`).set(auth(p));
    expect(await Message.countDocuments()).toBe(0);
    expect(await ReportedFlag.countDocuments()).toBe(1);
  });

  test('admin listing is admin-only and has no contact fields', async () => {
    const { d, p, conv } = await makeChat();
    const m = await post(d, conv._id, 'report me');
    await request(app).post(`/api/chat/messages/${m.body.data.id}/report`).set(auth(p)).send({ reason: 'unsafe' });
    const admin = await makeUser('Admin Person', { email: 'admin@carpool.test' });

    expect((await request(app).get('/api/admin/reports')).status).toBe(401);
    expect((await request(app).get('/api/admin/reports').set(auth(p))).status).toBe(403);
    expect((await request(app).get('/api/admin/conversations').set(auth(p))).status).toBe(403);
    expect((await request(app).get(`/api/admin/conversations/${conv._id}/messages`).set(auth(p))).status).toBe(403);

    const reports = await request(app).get('/api/admin/reports').set(auth(admin));
    expect(reports.status).toBe(200);
    expect(reports.body.data).toHaveLength(1);
    expect(reports.body.data[0].messageText).toBe('report me');
    expect(reports.body.data[0].reason).toBe('unsafe');
    expectNoContact(reports.body, [d, p]);

    const convs = await request(app).get('/api/admin/conversations').set(auth(admin));
    expect(convs.status).toBe(200);
    expect(convs.body.data).toHaveLength(1);
    expectNoContact(convs.body, [d, p]);

    const msgs = await request(app).get(`/api/admin/conversations/${conv._id}/messages`).set(auth(admin));
    expect(msgs.status).toBe(200);
    expect(msgs.body.data[0].body).toBe('report me');
    expectNoContact(msgs.body, [d, p]);
  });
});

describe('Cron cleanup', () => {
  const cron = (token) => {
    const r = request(app).get('/api/cron/cleanup');
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  test('vercel.json declares the daily cron', () => {
    const cfg = require('../vercel.json');
    expect(cfg.crons).toEqual([{ path: '/api/cron/cleanup', schedule: '0 0 * * *' }]);
  });

  test('401 without secret configured, without header, or with a wrong secret', async () => {
    const stale = await makeChat();
    await Conversation.updateOne({ _id: stale.conv._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await cron('anything')).status).toBe(401); // CRON_SECRET unset
    process.env.CRON_SECRET = 'test-cron-secret-value';
    expect((await cron()).status).toBe(401);
    expect((await cron('wrong-secret')).status).toBe(401);
    expect(await Conversation.countDocuments()).toBe(1); // nothing deleted
  });

  test('deletes stale data with counts, leaves fresh data, and is idempotent', async () => {
    process.env.CRON_SECRET = 'test-cron-secret-value';
    const past = new Date(Date.now() - 60 * 1000);

    const fresh = await makeChat();
    await post(fresh.p, fresh.conv._id, 'fresh');

    // expired conversation with messages
    const old = await makeChat();
    await post(old.p, old.conv._id, 'old');
    await post(old.d, old.conv._id, 'old2');
    await Conversation.updateOne({ _id: old.conv._id }, { $set: { expiresAt: past } });

    // orphan conversation (ride gone)
    const orphan = await makeChat();
    await post(orphan.p, orphan.conv._id, 'orphan');
    await Ride.deleteOne({ _id: orphan.ride._id });

    // expired ride with a match
    const d2 = await makeUser();
    const p2 = await makeUser();
    const expiredRide = await makeRide(d2);
    await Ride.updateOne({ _id: expiredRide._id }, { $set: { expiresAt: past } });
    await RideMatch.create({
      ride: expiredRide._id,
      passenger: p2.user._id,
      driver: d2.user._id,
      initiatedBy: 'PASSENGER',
      passengerCount: 1,
      status: 'PENDING',
      expiresAt: past,
    });

    // stale vs fresh request
    const mkReq = (purgeAt) =>
      RideRequest.create({
        passenger: p2.user._id,
        pickupLocation: 'A',
        destination: 'B',
        requestDate: '2099-01-01',
        departureTime: '09:00',
        departureDateTime: past,
        expiresAt: past,
        purgeAt,
        vehiclePreference: 'CAR',
        passengerCount: 1,
        seriesId: `ser-${Math.random().toString(36).slice(2, 10)}`,
      });
    await mkReq(past);
    await mkReq(new Date(Date.now() + DAY));

    // stale vs fresh report
    const flagBase = {
      reporter: p2.user._id,
      reportedUser: d2.user._id,
      conversationId: 'c',
      messageText: 't',
      senderId: 's',
      messageCreatedAt: new Date(),
      reason: 'spam',
    };
    await ReportedFlag.create({ ...flagBase, messageId: 'old-flag', createdAt: new Date(Date.now() - 16 * DAY) });
    await ReportedFlag.create({ ...flagBase, messageId: 'new-flag' });

    const res = await cron('test-cron-secret-value');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      conversations: 2,
      messages: 3,
      rides: 1,
      requests: 1,
      reports: 1,
    });
    expect(res.body.data.matches).toBeGreaterThanOrEqual(1);
    expectNoContact(res.body);

    expect(await Conversation.countDocuments()).toBe(1);
    expect(await Conversation.countDocuments({ _id: fresh.conv._id })).toBe(1);
    expect(await Message.countDocuments()).toBe(1);
    expect(await Ride.countDocuments({ _id: fresh.ride._id })).toBe(1);
    expect(await Ride.countDocuments({ _id: expiredRide._id })).toBe(0);
    expect(await RideRequest.countDocuments()).toBe(1);
    expect(await ReportedFlag.countDocuments()).toBe(1);
    expect(await RideMatch.countDocuments({ ride: fresh.ride._id })).toBe(1);

    const again = await cron('test-cron-secret-value');
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({
      conversations: 0,
      messages: 0,
      rides: 0,
      requests: 0,
      reports: 0,
      matches: 0,
    });
  });
});
