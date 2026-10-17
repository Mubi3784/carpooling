import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE_KEY, normalizeMode, readMode, writeMode, fabConfig, nextModeFromKey } from '../src/utils/mode.js';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('mode key and default is passenger', () => {
  assert.equal(MODE_KEY, 'carpool_mode');
  assert.equal(readMode(fakeStorage()), 'passenger');
  assert.equal(normalizeMode('admin'), 'passenger');
  const s = fakeStorage();
  s.setItem(MODE_KEY, 'garbage');
  assert.equal(readMode(s), 'passenger');
});

test('mode persists round trip', () => {
  const s = fakeStorage();
  writeMode(s, 'driver');
  assert.equal(readMode(s), 'driver');
  writeMode(s, 'nope');
  assert.equal(readMode(s), 'passenger');
});

test('throwing storage is safe', () => {
  const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(readMode(bad), 'passenger');
  assert.doesNotThrow(() => writeMode(bad, 'driver'));
});

test('FAB label and target per mode', () => {
  assert.deepEqual(fabConfig('passenger'), { label: 'Post Request', to: '/request-ride' });
  assert.deepEqual(fabConfig('driver'), { label: 'Offer Ride', to: '/offer-ride' });
});

test('segmented control keyboard transitions', () => {
  assert.equal(nextModeFromKey('passenger', 'ArrowRight'), 'driver');
  assert.equal(nextModeFromKey('driver', 'ArrowLeft'), 'passenger');
  assert.equal(nextModeFromKey('driver', 'Home'), 'passenger');
  assert.equal(nextModeFromKey('passenger', 'End'), 'driver');
  assert.equal(nextModeFromKey('driver', 'a'), 'driver');
});
