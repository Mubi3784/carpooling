import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bannerViewFor } from '../src/utils/pushSupport.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('bannerViewFor maps every state', () => {
  assert.equal(bannerViewFor('loading'), null);
  assert.equal(bannerViewFor('bogus'), null);
  const off = bannerViewFor('off');
  assert.equal(off.cta, 'Turn On Notifications');
  assert.equal(off.dismissible, false);
  assert.equal(bannerViewFor('off', true).kind, 'off'); // actionable state is never hidden
  const on = bannerViewFor('on');
  assert.equal(on.title, 'Notifications Enabled');
  assert.equal(on.cta, null);
  for (const s of ['denied', 'ios-needs-install', 'unsupported']) {
    const v = bannerViewFor(s);
    assert.equal(v.kind, s);
    assert.equal(v.cta, null);
    assert.equal(v.dismissible, true);
    assert.equal(bannerViewFor(s, true), null);
  }
  assert.match(bannerViewFor('ios-needs-install').body, /Add to Home Screen/);
  assert.match(bannerViewFor('denied').body, /Allow/);
});

test('banner never requests permission on load; only turnOn from onClick', () => {
  const banner = read('components/NotificationBanner.jsx');
  const hook = read('hooks/usePushNotifications.js');
  assert.match(banner, /usePushNotifications\(\{ resync: true \}\)/);
  assert.match(banner, /onClick=\{turnOn\}/);
  assert.doesNotMatch(banner, /requestPermission|enablePush/);
  assert.doesNotMatch(banner, /useEffect/);
  assert.doesNotMatch(hook, /requestPermission/);
  // turnOn (enablePush) is not invoked from any effect
  const effect = hook.slice(hook.indexOf('useEffect('), hook.indexOf('const turnOn'));
  assert.doesNotMatch(effect, /enablePush\(|turnOn\(/);
  assert.match(hook, /sessionStorage/);
  assert.match(hook, /pushResyncedAt/);
});

test('NotificationsCard uses the shared hook and keeps Turn off', () => {
  const card = read('components/NotificationsCard.jsx');
  assert.match(card, /usePushNotifications\(\)/);
  assert.ok(card.includes('Turn off notifications'));
  assert.ok(card.includes('Enable notifications'));
  assert.doesNotMatch(card, /enablePush|currentPushState/);
});
