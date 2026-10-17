import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createClientRequestId,
  getSelectableDates,
  toggleDate,
  groupRidesBySeries,
  formatDateChip,
} from '../src/utils/scheduling.js';
import { getDateStringWithOffset } from '../src/utils/dateUtils.js';

test('createClientRequestId returns unique ids matching the backend pattern', () => {
  const a = createClientRequestId();
  const b = createClientRequestId();
  assert.match(a, /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(a, b);
});

test('getSelectableDates covers today..today+13 and clamps the start', () => {
  const now = new Date(2026, 4, 10);
  const all = getSelectableDates(undefined, now);
  assert.equal(all.length, 14);
  assert.equal(all[0], '2026-05-10');
  assert.equal(all[13], getDateStringWithOffset(13, now));
  assert.equal(getSelectableDates('2026-05-01', now)[0], '2026-05-10');
  assert.deepEqual(getSelectableDates('2026-12-31', now), [getDateStringWithOffset(13, now)]);
  assert.equal(getSelectableDates('2026-05-15', now)[0], '2026-05-15');
});

test('toggleDate adds sorted, removes, and stops at the max', () => {
  let sel = [];
  sel = toggleDate(sel, '2026-05-12');
  sel = toggleDate(sel, '2026-05-11');
  assert.deepEqual(sel, ['2026-05-11', '2026-05-12']);
  assert.deepEqual(toggleDate(sel, '2026-05-11'), ['2026-05-12']);
  const full = ['01', '02', '03', '04', '05', '06'].map((d) => `2026-05-${d}`);
  assert.equal(toggleDate(full, '2026-05-07'), full);
  assert.equal(toggleDate(['2026-05-07'], '2026-05-08', 1).length, 1);
});

test('formatDateChip gives weekday and day-month', () => {
  assert.deepEqual(formatDateChip('2026-05-12'), { weekday: 'Tue', label: '12 May' });
});

test('groupRidesBySeries groups series of 2+, keeps singles and legacy separate', () => {
  const r = (id, rideDate, seriesId) => ({ id, rideDate, departureTime: '09:00', seriesId });
  const groups = groupRidesBySeries([
    r('a3', '2026-05-13', 's1'),
    r('legacy', '2026-05-11', null),
    r('a1', '2026-05-11', 's1'),
    r('lone', '2026-05-12', 's2'),
    r('a2', '2026-05-12', 's1'),
  ]);
  assert.equal(groups.length, 3);
  const series = groups.find((g) => g.seriesId === 's1');
  assert.deepEqual(series.rides.map((x) => x.id), ['a1', 'a2', 'a3']);
  const lone = groups.find((g) => g.rides[0].id === 'lone');
  assert.equal(lone.seriesId, null);
  assert.equal(lone.rides.length, 1);
  assert.equal(groups.find((g) => g.rides[0].id === 'legacy').seriesId, null);
  // ordered by earliest ride
  assert.deepEqual(
    groups.map((g) => g.rides[0].rideDate),
    [...groups.map((g) => g.rides[0].rideDate)].sort()
  );
});
