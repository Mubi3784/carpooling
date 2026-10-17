import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { filterMatchesByMode, otherModeCount, conversationForMatch, splitInbox, pendingIncoming, chatTargetAfterAccept } from '../src/utils/matchInbox.js';

const ms = [
  { id: 'a', role: 'PASSENGER', status: 'PENDING', direction: 'incoming' },
  { id: 'b', role: 'DRIVER', status: 'PENDING', direction: 'incoming' },
  { id: 'c', role: 'DRIVER', status: 'ACCEPTED', direction: 'incoming' },
  { id: 'd', role: 'DRIVER', status: 'PENDING', direction: 'outgoing' },
];

test('filterMatchesByMode', () => {
  assert.deepEqual(filterMatchesByMode(ms, 'passenger').map((m) => m.id), ['a']);
  assert.deepEqual(filterMatchesByMode(ms, 'driver').map((m) => m.id), ['b', 'c', 'd']);
});

test('otherModeCount counts only pending incoming in other mode', () => {
  assert.equal(otherModeCount(ms, 'passenger'), 1);
  assert.equal(otherModeCount(ms, 'driver'), 1);
});

test('conversationForMatch', () => {
  assert.equal(conversationForMatch([{ id: 'c1', matchId: 'm1' }], 'm1').id, 'c1');
  assert.equal(conversationForMatch([], 'm1'), null);
});

test('(a) pending incoming items show in BOTH modes via splitInbox', () => {
  for (const mode of ['passenger', 'driver']) {
    const { needsResponse, rest } = splitInbox(ms, mode);
    assert.deepEqual(needsResponse.map((m) => m.id), ['a', 'b']);
    const ids = [...needsResponse, ...rest].map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.deepEqual(splitInbox(ms, 'driver').rest.map((m) => m.id), ['c', 'd']);
  assert.deepEqual(splitInbox(ms, 'passenger').rest.map((m) => m.id), []);
  assert.deepEqual(pendingIncoming(ms).map((m) => m.id), ['a', 'b']);
});

test('(c) chatTargetAfterAccept', () => {
  assert.equal(chatTargetAfterAccept({ data: { conversationId: 'c9' } }, [], 'm1'), '/chat/c9');
  assert.equal(chatTargetAfterAccept({ data: {} }, [{ id: 'c1', matchId: 'm1' }], 'm1'), '/chat/c1');
  assert.equal(chatTargetAfterAccept(null, [], 'm1'), null);
});

test('(a)(b)(c) wiring', () => {
  const r = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  assert.match(r('pages/Matches.jsx'), /splitInbox/);
  assert.match(r('pages/Matches.jsx'), /navigate\(target\)/);
  assert.match(r('pages/Feed.jsx'), /useAlerts/);
  assert.match(r('components/BottomNav.jsx'), /useAlerts/);
  assert.match(r('context/AlertContext.jsx'), /addEventListener\('focus'/);
});
