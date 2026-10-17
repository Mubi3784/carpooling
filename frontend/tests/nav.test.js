import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NAV_ITEMS, guestTarget, badgeFor } from '../src/utils/nav.js';

test('bottom nav has exactly 4 items and no Roads', () => {
  assert.deepEqual(NAV_ITEMS.map((i) => i.label), ['Home', 'Active Rides', 'Chat', 'Profile']);
  assert.ok(!NAV_ITEMS.some((i) => /road/i.test(i.label) || i.to === '/road-status'));
});

test('guests are sent to login for protected tabs only', () => {
  const [home, active, chat, profile] = NAV_ITEMS;
  assert.equal(guestTarget(home, false), '/');
  for (const i of [active, chat, profile]) {
    assert.equal(guestTarget(i, false), '/login');
    assert.equal(guestTarget(i, true), i.to);
  }
});

test('BottomNav renders from NAV_ITEMS (no hardcoded Roads)', () => {
  const src = fs.readFileSync(new URL('../src/components/BottomNav.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('NAV_ITEMS'));
  assert.ok(!/Roads/.test(src));
});

test('(b) badgeFor: alerts on Active Rides, unread on Chat', () => {
  assert.equal(badgeFor('active', { alerts: 3, chatUnread: 5 }), 3);
  assert.equal(badgeFor('chat', { alerts: 3, chatUnread: 5 }), 5);
  assert.equal(badgeFor('home', { alerts: 3, chatUnread: 5 }), 0);
  assert.equal(badgeFor('active', {}), 0);
});

test('FAB component uses fabConfig', () => {
  const src = fs.readFileSync(new URL('../src/components/ModeFab.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('fabConfig'));
});
