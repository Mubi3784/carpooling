import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SOURCE_PATH } from '../src/utils/homeTabs.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

const feed = read('pages/Feed.jsx');
const tabs = read('components/HomeTabs.jsx');
const disc = read('components/DiscoveryFeed.jsx');
const requestsPage = read('pages/Requests.jsx');
const myRidesPage = read('pages/MyRides.jsx');
const myRequestsPage = read('pages/MyRequests.jsx');
const api = read('services/api.js');

test('Feed is a thin tabbed orchestrator', () => {
  for (const name of ['HomeTabs', 'MyRidesList', 'MyRequestsList', 'DiscoveryFeed', 'LoginPrompt', 'ModeSwitcher', 'ModeFab', 'sourceFor', 'resolveTab', 'readTab', 'writeTab']) {
    assert.match(feed, new RegExp(name), `Feed should use ${name}`);
  }
  assert.match(feed, /sessionStorage/);
  assert.match(feed, /role="tabpanel"/);
  assert.match(feed, /key=\{`\$\{mode\}-\$\{tab\}`\}/);
  assert.match(feed, /authLoading/);
  assert.doesNotMatch(feed, /api\.get\(|RideCard|'\/rides'/);
});

test('Feed renders NotificationBanner for logged-in users only (not while auth loads)', () => {
  assert.match(feed, /import NotificationBanner from '\.\.\/components\/NotificationBanner'/);
  assert.match(feed, /isAuthenticated && !authLoading && <NotificationBanner \/>/);
});

test('HomeTabs is an accessible tablist', () => {
  for (const s of ['role="tablist"', 'role="tab"', 'aria-selected', 'aria-controls', 'nextTabId', 'tabIndex']) {
    assert.ok(tabs.includes(s), `HomeTabs should contain ${s}`);
  }
});

test('DiscoveryFeed keeps the out-of-order guard and both data sources', () => {
  for (const s of ['requestId', 'getRequests', 'getRides', 'RequestCard', 'RideCard', 'OfferPicker', 'Retry', 'filterByKeyword', 'OfflineNotice']) {
    assert.ok(disc.includes(s), `DiscoveryFeed should contain ${s}`);
  }
  assert.match(disc, /\[kind,/);
});

test('shared components are not duplicated', () => {
  assert.ok(read('components/RequestCard.jsx').includes('Offer my ride'));
  assert.ok(read('components/OfferPicker.jsx').includes('Offer my ride'));
  for (const src of [requestsPage, disc, feed]) assert.ok(!src.includes('Offer my ride'));
  assert.match(requestsPage, /import RequestCard/);
  assert.match(disc, /import RequestCard/);
  assert.match(myRidesPage, /import MyRidesList/);
  assert.doesNotMatch(myRidesPage, /groupRidesBySeries/);
  assert.match(myRequestsPage, /import MyRequestsList/);
  assert.doesNotMatch(myRequestsPage, /groupRequestsBySeries/);
});

test('Retry exists on every list that can fail', () => {
  for (const p of ['components/MyRidesList.jsx', 'components/MyRequestsList.jsx', 'pages/Requests.jsx', 'components/DiscoveryFeed.jsx']) {
    assert.ok(read(p).includes('Retry'), `${p} should have Retry`);
  }
});

test('api helpers match the source paths', () => {
  assert.match(api, /export const getMyRides = \(\) => api\.get\('\/rides\/my-rides'\)/);
  assert.match(api, /export const getRides = \(params\) => api\.get\('\/rides', \{ params \}\)/);
  assert.equal(SOURCE_PATH['my-rides'], '/rides/my-rides');
  assert.equal(SOURCE_PATH.rides, '/rides');
});

test('no HTML injection or wa.me in new/changed files', () => {
  const files = [
    'pages/Feed.jsx', 'components/HomeTabs.jsx', 'components/LoginPrompt.jsx', 'components/DiscoveryFeed.jsx',
    'components/RequestCard.jsx', 'components/OfferPicker.jsx', 'components/MyRidesList.jsx', 'components/MyRequestsList.jsx',
    'components/RideCard.jsx', 'pages/Requests.jsx',
  ];
  for (const f of files) assert.doesNotMatch(read(f), /dangerouslySetInnerHTML|innerHTML|wa\.me/, f);
});

test('RideCard shows the own-ride note', () => {
  const card = read('components/RideCard.jsx');
  assert.ok(card.includes('isOwn'));
  assert.ok(card.includes('This is your ride'));
});
