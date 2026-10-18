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

test('safeRedirectPath allows only same-origin paths', async () => {
  const { safeRedirectPath } = await import('../src/utils/nav.js');
  assert.equal(safeRedirectPath('/rides/1'), '/rides/1');
  assert.equal(safeRedirectPath('/requests/1?x=1'), '/requests/1?x=1');
  assert.equal(safeRedirectPath({ pathname: '/requests/9', search: '?a=1', hash: '#h' }), '/requests/9?a=1#h');
  for (const bad of ['//evil.com', 'https://evil.com', '/login', '/register', '/login?x=1', '/register/', '', null, undefined, 42, '/\\evil.com', '/a\\b', '/a\nb', 'rides/1']) {
    assert.equal(safeRedirectPath(bad), null, String(bad));
  }
  assert.equal(safeRedirectPath('/loginx'), '/loginx');
});

test('post-auth redirect storage is saved, consumed once, and safe', async () => {
  const { savePostAuthRedirect, consumePostAuthRedirect, resolvePostAuthTarget } = await import('../src/utils/nav.js');
  const data = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  try {
    savePostAuthRedirect('//evil.com');
    assert.equal(data.size, 0);
    savePostAuthRedirect('/requests/5');
    assert.equal(data.get('postAuthRedirect'), '/requests/5');
    savePostAuthRedirect(undefined); // visit without a target clears the stale one
    assert.equal(data.size, 0);
    savePostAuthRedirect('/requests/5');
    assert.equal(consumePostAuthRedirect(), '/requests/5');
    assert.equal(consumePostAuthRedirect(), null);
    savePostAuthRedirect('/rides/2');
    assert.equal(resolvePostAuthTarget({ pathname: '/requests/7' }), '/requests/7');
    assert.equal(data.size, 0);
    assert.equal(resolvePostAuthTarget(undefined), '/');
  } finally {
    delete globalThis.sessionStorage;
  }
});
