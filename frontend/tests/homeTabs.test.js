import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_TAB_KEYS, tabsForMode, defaultTab, resolveTab, readTab, writeTab, sourceFor, SOURCE_PATH,
  nextTabId, buildRequestFeedParams, filterByKeyword, emptyStateFor, loginPromptFor,
} from '../src/utils/homeTabs.js';
import { parseCommuteQuery } from '../src/utils/nlpSearchParser.js';

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};
const throwingStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
};

test('tab labels per mode', () => {
  assert.deepEqual(tabsForMode('driver').map((t) => t.label), ['Passenger Requests', 'My Rides']);
  assert.deepEqual(tabsForMode('passenger').map((t) => t.label), ['Available Rides', 'My Requests']);
  assert.deepEqual(tabsForMode('garbage').map((t) => t.label), ['Available Rides', 'My Requests']);
});

test('default tab is Tab 1 ("feed") in both modes for everyone', () => {
  for (const mode of ['driver', 'passenger']) {
    for (const authed of [true, false]) assert.equal(defaultTab(mode, authed), 'feed');
    assert.equal(tabsForMode(mode)[0].id, 'feed');
  }
  assert.equal(resolveTab({ mode: 'driver', isAuthenticated: true, choice: null }), 'feed');
  assert.equal(resolveTab({ mode: 'driver', isAuthenticated: true, choice: 'my' }), 'my');
  assert.equal(resolveTab({ mode: 'driver', isAuthenticated: true, choice: 'nope' }), 'feed');
  // guests: passenger feed is public, driver feed shows the login prompt
  assert.equal(sourceFor('passenger', defaultTab('passenger', false), false), 'rides');
  assert.equal(sourceFor('driver', defaultTab('driver', false), false), 'login');
});

test('persistence keys and per-mode independence', () => {
  assert.equal(HOME_TAB_KEYS.driver, 'carpool_home_tab_driver_v2');
  assert.equal(HOME_TAB_KEYS.passenger, 'carpool_home_tab_passenger_v2');
  // old (pre-reorder) stored values are ignored
  assert.equal(readTab(fakeStorage({ carpool_home_tab_driver: 'my' }), 'driver'), null);
  const s = fakeStorage();
  assert.equal(readTab(s, 'driver'), null);
  writeTab(s, 'driver', 'feed');
  assert.equal(readTab(s, 'driver'), 'feed');
  assert.equal(readTab(s, 'passenger'), null);
  writeTab(s, 'passenger', 'feed');
  writeTab(s, 'driver', 'my');
  assert.equal(readTab(s, 'passenger'), 'feed');
  assert.equal(readTab(s, 'driver'), 'my');
});

test('invalid or failing storage falls back to the default tab', () => {
  assert.equal(readTab(fakeStorage({ carpool_home_tab_driver_v2: 'zzz' }), 'driver'), null);
  assert.equal(readTab(throwingStorage, 'driver'), null);
  writeTab(throwingStorage, 'driver', 'feed');
  const s = fakeStorage();
  writeTab(s, 'driver', 'bogus');
  assert.deepEqual(s.data, {});
  assert.equal(resolveTab({ mode: 'driver', isAuthenticated: true, choice: readTab(throwingStorage, 'driver') }), 'feed');
});

test('data source mapping and cross-mode isolation', () => {
  const expected = {
    'driver/my': 'my-rides', 'driver/feed': 'requests', 'passenger/my': 'my-requests', 'passenger/feed': 'rides',
  };
  for (const mode of ['driver', 'passenger']) {
    for (const tab of ['my', 'feed']) {
      const authed = sourceFor(mode, tab, true);
      assert.equal(authed, expected[`${mode}/${tab}`]);
      if (mode === 'driver') assert.ok(!['my-requests', 'rides'].includes(authed));
      else assert.ok(!['my-rides', 'requests'].includes(authed));
      const guest = sourceFor(mode, tab, false);
      assert.equal(guest, mode === 'passenger' && tab === 'feed' ? 'rides' : 'login');
    }
  }
  assert.deepEqual(SOURCE_PATH, {
    'my-rides': '/rides/my-rides', requests: '/requests', 'my-requests': '/requests/mine', rides: '/rides',
  });
});

test('nextTabId keyboard navigation', () => {
  const tabs = tabsForMode('driver');
  assert.equal(nextTabId(tabs, 'feed', 'ArrowRight'), 'my');
  assert.equal(nextTabId(tabs, 'my', 'ArrowRight'), 'feed');
  assert.equal(nextTabId(tabs, 'feed', 'ArrowLeft'), 'my');
  assert.equal(nextTabId(tabs, 'my', 'ArrowUp'), 'feed');
  assert.equal(nextTabId(tabs, 'my', 'Home'), 'feed');
  assert.equal(nextTabId(tabs, 'feed', 'End'), 'my');
  assert.equal(nextTabId(tabs, 'feed', 'x'), 'feed');
});

test('buildRequestFeedParams', () => {
  assert.deepEqual(buildRequestFeedParams({ date: '2030-01-01', vehicle: 'ALL' }), { params: { date: '2030-01-01' } });
  assert.deepEqual(buildRequestFeedParams({ vehicle: 'CAR' }).params, { vehicleType: 'CAR' });
  assert.deepEqual(buildRequestFeedParams({ vehicle: 'BIKE' }).params, { vehicleType: 'BIKE' });
  assert.deepEqual(
    buildRequestFeedParams({ date: 'd', filters: { timeFrom: '08:00', timeTo: '10:00', passengers: '3' } }).params,
    { date: 'd', timeFrom: '08:00', timeTo: '10:00', passengers: '3' }
  );
  assert.ok(buildRequestFeedParams({ filters: { timeFrom: '25:00' } }).error);
  assert.ok(buildRequestFeedParams({ filters: { timeFrom: '10:00', timeTo: '08:00' } }).error);
  for (const bad of ['0', '7', 'x']) assert.equal(buildRequestFeedParams({ filters: { passengers: bad } }).error, 'Passengers must be 1 to 6');
  assert.deepEqual(buildRequestFeedParams({ filters: { timeFrom: '', timeTo: '', passengers: '' } }).params, {});
  assert.ok(!('keyword' in buildRequestFeedParams({ filters: { keyword: 'x' } }).params));
});

test('filterByKeyword works on request-shaped items', () => {
  const items = [
    { pickupLocation: 'Gulshan', destination: 'NUST H-12', departureTime: '08:00' },
    { pickupLocation: 'Blue Area', destination: 'Saddar', departureTime: '19:00' },
  ];
  const f = (kw) => filterByKeyword(items, kw, parseCommuteQuery(kw));
  assert.equal(f('').length, 2);
  assert.equal(f('gulshan').length, 1);
  assert.equal(f('SADDAR')[0].pickupLocation, 'Blue Area');
  const nlp = f('subah nust');
  assert.equal(nlp.length, 1);
  assert.equal(nlp[0].pickupLocation, 'Gulshan');
});

test('empty states and login prompts', () => {
  assert.deepEqual(
    (({ title, ctaLabel, ctaTo }) => ({ title, ctaLabel, ctaTo }))(emptyStateFor({ mode: 'driver', tab: 'my' })),
    { title: 'No rides posted yet', ctaLabel: 'Offer a ride', ctaTo: '/offer-ride' }
  );
  const pm = emptyStateFor({ mode: 'passenger', tab: 'my' });
  assert.equal(pm.title, 'You have no requests');
  assert.equal(pm.ctaLabel, 'Post a request');
  assert.equal(pm.ctaTo, '/request-ride');
  assert.equal(emptyStateFor({ mode: 'driver', tab: 'feed' }).title, 'No open passenger requests for this date');
  assert.equal(emptyStateFor({ mode: 'passenger', tab: 'feed' }).title, 'No rides available for this date');
  for (const mode of ['driver', 'passenger']) {
    for (const tab of ['my', 'feed']) assert.ok(loginPromptFor({ mode, tab }).length > 10);
  }
});
