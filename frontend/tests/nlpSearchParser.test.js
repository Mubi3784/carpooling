import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCommuteQuery,
  isDepartureInTimeWindow,
  matchesLandmark,
} from '../src/utils/nlpSearchParser.js';
import { getRelativeTimeLabel, isOlderThanHours } from '../src/utils/dateUtils.js';

const now = new Date(2026, 0, 10, 9, 0);

test('"kal subah nust jana hai"', () => {
  const r = parseCommuteQuery('kal subah nust jana hai', now);
  assert.equal(r.targetDateTab, 'tomorrow');
  assert.equal(r.customDate, null);
  assert.equal(r.timeOfDay, 'morning');
  assert.deepEqual(r.parsedLocations, ['NUST H-12']);
  assert.equal(r.cleanKeyword, '');
  assert.equal(r.hasTokens, true);
});

test('"rawalpindi to blue area evening"', () => {
  const r = parseCommuteQuery('rawalpindi to blue area evening', now);
  assert.equal(r.targetDateTab, null);
  assert.equal(r.timeOfDay, 'evening');
  assert.deepEqual(r.parsedLocations, ['Rawalpindi', 'Blue Area']);
  assert.equal(r.cleanKeyword, '');
});

test('"sham ko fast university"', () => {
  const r = parseCommuteQuery('sham ko fast university', now);
  assert.equal(r.timeOfDay, 'evening');
  assert.deepEqual(r.parsedLocations, ['FAST H-11']);
  assert.equal(r.cleanKeyword, '');
});

test('"parso pindi se islamabad"', () => {
  const r = parseCommuteQuery('parso pindi se islamabad', now);
  assert.equal(r.targetDateTab, 'custom');
  assert.equal(r.customDate, '2026-01-12');
  assert.deepEqual(r.parsedLocations, ['Rawalpindi', 'Islamabad']);
  assert.equal(r.cleanKeyword, '');
});

test('"day after tomorrow" wins over "tomorrow" and H12 is tolerated', () => {
  const r = parseCommuteQuery('day after tomorrow h12', now);
  assert.equal(r.targetDateTab, 'custom');
  assert.equal(r.customDate, '2026-01-12');
  assert.deepEqual(r.parsedLocations, ['NUST H-12']);
});

test('"today 8am" detects today + morning', () => {
  const r = parseCommuteQuery('today 8am', now);
  assert.equal(r.targetDateTab, 'today');
  assert.equal(r.timeOfDay, 'morning');
  assert.equal(r.cleanKeyword, '');
});

test('"am" inside a word is not treated as a time token', () => {
  const r = parseCommuteQuery('name street', now);
  assert.equal(r.timeOfDay, null);
  assert.equal(r.cleanKeyword, 'name street');
  assert.equal(r.hasTokens, false);
});

test('empty / non-string input returns an empty result', () => {
  const r = parseCommuteQuery(undefined, now);
  assert.equal(r.hasTokens, false);
  assert.equal(r.cleanKeyword, '');
  assert.deepEqual(r.parsedLocations, []);
});

test('time window boundaries', () => {
  assert.equal(isDepartureInTimeWindow('07:30', 'morning'), true);
  assert.equal(isDepartureInTimeWindow('12:00', 'morning'), false);
  assert.equal(isDepartureInTimeWindow('12:00', 'afternoon'), true);
  assert.equal(isDepartureInTimeWindow('23:59', 'evening'), true);
  assert.equal(isDepartureInTimeWindow('05:00', 'evening'), false);
  assert.equal(isDepartureInTimeWindow('05:00', null), true);
});

test('landmark matching against ride text', () => {
  assert.equal(matchesLandmark('Saddar, Rawalpindi', 'Rawalpindi'), true);
  assert.equal(matchesLandmark('NUST Gate 1, H12', 'NUST H-12'), true);
  assert.equal(matchesLandmark('F-10 Markaz', 'Islamabad'), true);
  assert.equal(matchesLandmark('Breakfast Point', 'FAST H-11'), false);
});

test('relative time labels and stale detection', () => {
  const nowMs = new Date(2026, 0, 10, 12, 0).getTime();
  const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();
  assert.equal(getRelativeTimeLabel(iso(20 * 1000), nowMs), 'Updated just now');
  assert.equal(getRelativeTimeLabel(iso(60 * 1000), nowMs), 'Updated 1 minute ago');
  assert.equal(getRelativeTimeLabel(iso(5 * 60 * 1000), nowMs), 'Updated 5 minutes ago');
  assert.equal(getRelativeTimeLabel(iso(3 * 3600 * 1000), nowMs), 'Updated 3 hours ago');
  assert.equal(getRelativeTimeLabel(iso(2 * 86400 * 1000), nowMs), 'Updated 2 days ago');
  assert.equal(getRelativeTimeLabel('not-a-date', nowMs), '');
  assert.equal(isOlderThanHours(iso(13 * 3600 * 1000), 12, nowMs), true);
  assert.equal(isOlderThanHours(iso(2 * 3600 * 1000), 12, nowMs), false);
});
