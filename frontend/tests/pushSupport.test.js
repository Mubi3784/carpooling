import test from 'node:test';
import assert from 'node:assert/strict';
import { pushSupportState, urlBase64ToUint8Array, subscriptionToPayload } from '../src/utils/pushSupport.js';

test('pushSupportState', () => {
  assert.equal(pushSupportState({ hasSW: true, hasPush: true, hasNotification: true }), 'ok');
  assert.equal(pushSupportState({ hasSW: true, hasPush: false, hasNotification: true }), 'unsupported');
  assert.equal(pushSupportState({ isIosNotStandalone: true }), 'ios-needs-install');
});

test('urlBase64ToUint8Array decodes url-safe base64', () => {
  const arr = urlBase64ToUint8Array('AQID_w');
  assert.deepEqual(Array.from(arr), [1, 2, 3, 255]);
});

test('subscriptionToPayload', () => {
  const sub = { toJSON: () => ({ endpoint: 'https://e/x', keys: { p256dh: 'p', auth: 'a' }, extra: 1 }) };
  assert.deepEqual(subscriptionToPayload(sub), { endpoint: 'https://e/x', keys: { p256dh: 'p', auth: 'a' } });
});
