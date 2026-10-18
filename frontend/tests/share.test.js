import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAppBaseUrl, buildRideLink, buildRequestLink, buildRideShareText, buildRequestShareText,
  buildWhatsAppUrl, openWhatsAppShare,
} from '../src/utils/share.js';

const ride = {
  id: 'abc123', pickupLocation: 'Saddar, Rawalpindi', destination: 'Blue Area, Islamabad',
  rideDate: '2030-01-05', departureTime: '08:30', vehicleType: 'CAR', availableSeats: 3,
};
const req = {
  id: 'req456', pickupLocation: 'F-10', destination: 'NUST', requestDate: '2030-01-06',
  departureTime: '17:05', vehiclePreference: 'BIKE',
};

test('getAppBaseUrl: env, trailing slash strip, invalid and fallback', () => {
  assert.equal(getAppBaseUrl('https://carpool.example.com', 'http://localhost:5173'), 'https://carpool.example.com');
  assert.equal(getAppBaseUrl('https://carpool.example.com///', 'http://x'), 'https://carpool.example.com');
  assert.equal(getAppBaseUrl('  ', 'https://origin.test'), 'https://origin.test');
  assert.equal(getAppBaseUrl(undefined, 'https://origin.test/'), 'https://origin.test');
  assert.equal(getAppBaseUrl('not a url', 'https://origin.test'), 'https://origin.test');
  assert.equal(getAppBaseUrl('javascript:alert(1)', 'https://origin.test'), 'https://origin.test');
});

test('links use encoded ids and no query string', () => {
  assert.equal(buildRideLink('abc123', 'https://a.test'), 'https://a.test/rides/abc123');
  assert.equal(buildRequestLink('r/1?x', 'https://a.test'), 'https://a.test/requests/r%2F1%3Fx');
  assert.ok(!buildRideLink('abc123', 'https://a.test').includes('?'));
});

test('ride share text matches the exact template', () => {
  const link = buildRideLink(ride.id, 'https://a.test');
  assert.equal(
    buildRideShareText(ride, link),
    '🚗 Carpooling Ride Available!\n\n📍 From: Saddar, Rawalpindi\n\n📍 To: Blue Area, Islamabad\n\n📅 Date: 2030-01-05\n\n🕒 Departure: 8:30 AM\n\n🚘 Vehicle: Car\n\n💺 Seats: 3\n\nView details & request to join on Carpooling:\n\nhttps://a.test/rides/abc123'
  );
  assert.match(buildRideShareText({ ...ride, vehicleType: 'BIKE' }, link), /🚘 Vehicle: Bike/);
});

test('request share text matches the exact template (Bike and Car)', () => {
  const link = buildRequestLink(req.id, 'https://a.test');
  assert.equal(
    buildRequestShareText(req, link),
    '🙋 Ride Request on Carpooling!\n\n📍 Pickup: F-10\n\n📍 Destination: NUST\n\n📅 Date: 2030-01-06\n\n🕒 Preferred Time: 5:05 PM\n\n🏍️ Vehicle Preference: Bike\n\nView the request on Carpooling:\n\nhttps://a.test/requests/req456'
  );
  assert.match(buildRequestShareText({ ...req, vehiclePreference: 'CAR' }, link), /🚘 Vehicle Preference: Car/);
});

test('WhatsApp URL round-trips the text', () => {
  const text = buildRideShareText(ride, 'https://a.test/rides/abc123');
  const url = buildWhatsAppUrl(text);
  assert.ok(url.startsWith('https://wa.me/?text='));
  assert.equal(decodeURIComponent(url.slice('https://wa.me/?text='.length)), text);
});

test('control characters are stripped and fields capped', () => {
  const text = buildRideShareText({ ...ride, pickupLocation: `A\n\nB${'x'.repeat(300)}` }, 'l');
  assert.ok(text.includes('📍 From: A B'));
  assert.ok(!text.includes('x'.repeat(101)));
});

test('no phone, email, notes, token or person objects leak', () => {
  const poisoned = {
    ...ride, whatsappNumber: '03105517386', phone: '03001234567', email: 'a@b.com', notes: 'SECRETNOTE',
    token: 'jwt.token.value', driver: { name: 'Dave', phone: '0300' }, passenger: { name: 'Pam' },
  };
  const poisonedReq = { ...req, phone: '03001234567', email: 'a@b.com', notes: 'SECRETNOTE', token: 'jwt.token.value', passenger: { name: 'Pam' } };
  for (const text of [
    buildRideShareText(poisoned, buildRideLink('abc123', 'https://a.test')),
    buildRequestShareText(poisonedReq, buildRequestLink('req456', 'https://a.test')),
  ]) {
    for (const bad of ['03105517386', '03001234567', 'a@b.com', 'SECRETNOTE', 'jwt.token', 'Dave', 'Pam', 'token=']) {
      assert.ok(!text.includes(bad), `leaked ${bad}`);
      assert.ok(!buildWhatsAppUrl(text).includes(encodeURIComponent(bad)), `url leaked ${bad}`);
    }
  }
});

test('openWhatsAppShare opens with noopener and falls back when blocked', () => {
  const calls = [];
  globalThis.window = {
    open: (...a) => { calls.push(['open', ...a]); return null; },
    location: { assign: (u) => calls.push(['assign', u]) },
  };
  try {
    openWhatsAppShare('hi there');
    assert.equal(calls[0][1], 'https://wa.me/?text=hi%20there');
    assert.equal(calls[0][3], 'noopener,noreferrer');
    assert.deepEqual(calls[1], ['assign', 'https://wa.me/?text=hi%20there']);
  } finally {
    delete globalThis.window;
  }
});
