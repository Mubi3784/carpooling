import test from 'node:test';
import assert from 'node:assert/strict';
import { statusLabel, groupRequestsBySeries, formatBadgeCount } from '../src/utils/requests.js';

test('statusLabel maps known statuses and falls back', () => {
  assert.equal(statusLabel('EXPIRED'), 'Expired');
  assert.equal(statusLabel('MATCHED'), 'Matched');
  assert.equal(statusLabel('???'), 'Unknown');
});

test('groupRequestsBySeries groups 2+ with the same seriesId and sorts by date', () => {
  const reqs = [
    { id: 'a', seriesId: 's1', requestDate: '2030-01-03', departureTime: '09:00' },
    { id: 'b', seriesId: null, requestDate: '2030-01-02', departureTime: '09:00' },
    { id: 'c', seriesId: 's1', requestDate: '2030-01-01', departureTime: '09:00' },
    { id: 'd', seriesId: 's2', requestDate: '2030-01-05', departureTime: '09:00' },
  ];
  const groups = groupRequestsBySeries(reqs);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].requests.map((r) => r.id), ['c', 'a']);
  assert.equal(groups[0].seriesId, 's1');
  assert.equal(groups[2].seriesId, null); // single request with its own series is not grouped
});

test('formatBadgeCount caps at 99+', () => {
  assert.equal(formatBadgeCount(5), '5');
  assert.equal(formatBadgeCount(100), '99+');
});
