import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateDraft, newClientMessageId, pollDelay, classifyChatError, mergeMessages, counterText, REPORT_REASONS,
} from '../src/utils/chat.js';

test('validateDraft', () => {
  assert.equal(validateDraft('').ok, false);
  assert.equal(validateDraft('   ').ok, false);
  assert.equal(validateDraft('a'.repeat(500)).ok, true);
  assert.equal(validateDraft('a'.repeat(501)).ok, false);
  assert.equal(validateDraft(' hi ').body, 'hi');
  assert.equal(counterText(3), '3/500');
});

test('clientMessageId matches backend regex', () => {
  for (let i = 0; i < 5; i += 1) assert.match(newClientMessageId(), /^[A-Za-z0-9_-]{8,64}$/);
});

test('pollDelay pauses when hidden, backs off when idle', () => {
  assert.equal(pollDelay({ idleMs: 0, visible: false }), null);
  assert.equal(pollDelay({ idleMs: 0, visible: true }), 4000);
  assert.equal(pollDelay({ idleMs: 119999, visible: true }), 4000);
  assert.equal(pollDelay({ idleMs: 120000, visible: true }), 12000);
});

test('classifyChatError', () => {
  assert.equal(classifyChatError({ response: { status: 404 } }), 'ended');
  assert.equal(classifyChatError({ response: { status: 410 } }), 'ended');
  assert.equal(classifyChatError({ response: { status: 429 } }), 'rate');
  assert.equal(classifyChatError({ message: 'Network Error' }), 'offline');
  assert.equal(classifyChatError({ response: { status: 500 } }), 'other');
});

test('mergeMessages de-dupes by id and clientMessageId', () => {
  const a = [{ id: '1', createdAt: '2026-01-01T10:00:00Z', body: 'a' }];
  const b = mergeMessages(a, [{ id: '1', createdAt: '2026-01-01T10:00:00Z', body: 'a' }, { id: '2', createdAt: '2026-01-01T10:01:00Z', body: 'b' }]);
  assert.equal(b.length, 2);
  const opt = [{ clientMessageId: 'cid-12345', createdAt: '2026-01-01T10:02:00Z', body: 'x', status: 'sending' }];
  const c = mergeMessages(opt, [{ id: '9', clientMessageId: 'cid-12345', createdAt: '2026-01-01T10:02:00Z', body: 'x' }]);
  assert.equal(c.length, 1);
  assert.equal(c[0].id, '9');
});

test('hostile message body passes through helpers as a plain string', () => {
  const body = '<img src=x onerror=alert(1)>';
  const out = mergeMessages([], [{ id: 'z', createdAt: '2026-01-01T10:00:00Z', body }]);
  assert.equal(out[0].body, body);
  assert.equal(validateDraft(body).body, body);
});

test('report reasons match backend', () => {
  assert.deepEqual(REPORT_REASONS.map((r) => r.value), ['harassment', 'spam', 'unsafe', 'other']);
});

test('chat pages never inject HTML', () => {
  for (const f of ['ChatThread.jsx', 'ChatList.jsx']) {
    const t = fs.readFileSync(new URL(`../src/pages/${f}`, import.meta.url), 'utf8');
    assert.ok(!/dangerouslySetInnerHTML|innerHTML/.test(t), `${f} injects HTML`);
  }
});

test('thread polling is wired to pollDelay and visibility', () => {
  const t = fs.readFileSync(new URL('../src/pages/ChatThread.jsx', import.meta.url), 'utf8');
  assert.ok(t.includes('pollDelay'));
  assert.ok(t.includes('visibilitychange'));
  assert.ok(t.includes('classifyChatError'));
});
