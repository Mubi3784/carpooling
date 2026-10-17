import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOwnMessage, bubbleView } from '../src/utils/chat.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('sent message (mine true) aligns right with primary background', () => {
  const v = bubbleView({ id: '1', mine: true, body: 'hi' }, { currentUserId: 'u1' });
  assert.equal(v.side, 'right');
  assert.ok(v.rowClass.includes('justify-end'));
  assert.ok(v.bubbleClass.includes('ml-auto'));
  assert.ok(v.bubbleClass.includes('bg-emerald-700'));
  assert.equal(v.status, 'sent');
  assert.equal(v.srLabel, 'You said');
  assert.equal(v.canReport, false);
});

test('received message (mine false) aligns left with neutral background', () => {
  const v = bubbleView({ id: '2', mine: false, body: 'yo' }, { currentUserId: 'u1', otherName: 'Sara' });
  assert.equal(v.side, 'left');
  assert.ok(v.rowClass.includes('justify-start'));
  assert.ok(v.bubbleClass.includes('mr-auto'));
  assert.ok(v.bubbleClass.includes('bg-slate-100'));
  assert.equal(v.status, null);
  assert.equal(v.srLabel, 'Sara said');
  assert.equal(v.canReport, true);
});

test('optimistic and failed messages align right and are not reportable', () => {
  const sending = bubbleView({ mine: true, status: 'sending', clientMessageId: 'c1' }, {});
  assert.equal(sending.side, 'right');
  assert.equal(sending.status, 'sending');
  assert.equal(sending.canReport, false);
  const failed = bubbleView({ mine: true, status: 'failed', clientMessageId: 'c1' }, {});
  assert.equal(failed.side, 'right');
  assert.equal(failed.status, 'failed');
});

test('id type mismatch is handled when mine is absent', () => {
  const oid = { toString: () => 'abc123' };
  assert.equal(isOwnMessage({ senderId: oid }, 'abc123'), true);
  assert.equal(isOwnMessage({ sender_id: 42 }, '42'), true);
  assert.equal(isOwnMessage({ sender: { _id: 'x' } }, 'y'), false);
  assert.equal(isOwnMessage({ sender: { id: 'x' } }, 'x'), true);
});

test('unknown sender is never own; string mine falls through to ids', () => {
  assert.equal(isOwnMessage({ body: 'x' }, 'u1'), false);
  assert.equal(isOwnMessage(null, 'u1'), false);
  assert.equal(bubbleView({ body: 'x' }, {}).side, 'left');
  assert.equal(isOwnMessage({ mine: 'true' }, 'u1'), false);
  assert.equal(isOwnMessage({ mine: 'true', sender_id: 'u1' }, 'u1'), true);
});

test('canReport only for other-party persisted messages', () => {
  assert.equal(bubbleView({ mine: false, id: 'a' }, {}).canReport, true);
  assert.equal(bubbleView({ mine: false }, {}).canReport, false);
  assert.equal(bubbleView({ mine: true, id: 'a' }, {}).canReport, false);
  assert.equal(bubbleView({ mine: false }, {}).srLabel, 'They said');
});

test('bubble classes cap width and wrap long words', () => {
  for (const mine of [true, false]) {
    const v = bubbleView({ mine }, {});
    assert.ok(v.bubbleClass.includes('max-w-[80%]'));
    assert.ok(v.bubbleClass.includes('[overflow-wrap:anywhere]'));
  }
});

test('helpers never touch the body (hostile text stays plain)', () => {
  const m = { mine: false, id: '1', body: '<img src=x onerror=alert(1)>' };
  bubbleView(m, {});
  assert.equal(m.body, '<img src=x onerror=alert(1)>');
});

test('source wiring: bubble renders plain text and ChatThread uses it', () => {
  const bubble = read('components/MessageBubble.jsx');
  const thread = read('pages/ChatThread.jsx');
  for (const src of [bubble, thread]) assert.doesNotMatch(src, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(thread, /import MessageBubble from/);
  assert.doesNotMatch(thread, /justify-end/);
  assert.match(bubble, /bubbleView/);
  assert.match(bubble, /\{message\.body\}/);
  assert.match(bubble, /sr-only/);
  assert.match(bubble, /data-side/);
  assert.match(bubble, /Report this message/);
  assert.match(bubble, /Retry/);
});
