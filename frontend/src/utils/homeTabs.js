// Pure decision logic for the mode-scoped two-tab Home (unit tested in tests/homeTabs.test.js)
import { normalizeMode } from './mode.js';
import { buildFeedParams } from './matches.js';
import { matchesLandmark, isDepartureInTimeWindow } from './nlpSearchParser.js';

// _v2: tab order changed (feed first); old keys are ignored so stored values cannot override the new default
export const HOME_TAB_KEYS = {
  driver: 'carpool_home_tab_driver_v2',
  passenger: 'carpool_home_tab_passenger_v2',
};

export const HOME_TABS = {
  driver: [
    { id: 'feed', label: 'Passenger Requests' },
    { id: 'my', label: 'My Rides' },
  ],
  passenger: [
    { id: 'feed', label: 'Available Rides' },
    { id: 'my', label: 'My Requests' },
  ],
};

export const SOURCE_PATH = {
  'my-rides': '/rides/my-rides',
  requests: '/requests',
  'my-requests': '/requests/mine',
  rides: '/rides',
};

export const tabsForMode = (mode) => HOME_TABS[normalizeMode(mode)];

export const isValidTab = (mode, id) => tabsForMode(mode).some((t) => t.id === id);

// Tab 1 (the feed) is the default for everyone. Driver-mode guests see the login prompt there.
// eslint-disable-next-line no-unused-vars
export const defaultTab = (mode, isAuthenticated) => 'feed';

export const resolveTab = ({ mode, isAuthenticated, choice }) =>
  isValidTab(mode, choice) ? choice : defaultTab(mode, isAuthenticated);

export const readTab = (storage, mode) => {
  try {
    const v = storage?.getItem(HOME_TAB_KEYS[normalizeMode(mode)]);
    return isValidTab(mode, v) ? v : null;
  } catch {
    return null;
  }
};

export const writeTab = (storage, mode, id) => {
  if (!isValidTab(mode, id)) return;
  try {
    storage?.setItem(HOME_TAB_KEYS[normalizeMode(mode)], id);
  } catch {
    // storage unavailable: tab just won't persist
  }
};

export const sourceFor = (mode, tab, isAuthenticated) => {
  const m = normalizeMode(mode);
  const source = m === 'driver' ? (tab === 'feed' ? 'requests' : 'my-rides') : tab === 'feed' ? 'rides' : 'my-requests';
  if (source !== 'rides' && !isAuthenticated) return 'login';
  return source;
};

export const nextTabId = (tabs, currentId, key) => {
  const i = Math.max(0, tabs.findIndex((t) => t.id === currentId));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return tabs[(i + 1) % tabs.length].id;
    case 'ArrowLeft':
    case 'ArrowUp':
      return tabs[(i - 1 + tabs.length) % tabs.length].id;
    case 'Home':
      return tabs[0].id;
    case 'End':
      return tabs[tabs.length - 1].id;
    default:
      return currentId;
  }
};

// Query params for GET /api/requests. Keyword filtering stays client-side.
export const buildRequestFeedParams = ({ date, vehicle, filters = {} } = {}) => {
  const params = {};
  if (date) params.date = date;
  if (vehicle === 'CAR' || vehicle === 'BIKE') params.vehicleType = vehicle;
  const times = buildFeedParams({ timeFrom: filters.timeFrom, timeTo: filters.timeTo });
  if (times.error) return { error: times.error };
  Object.assign(params, times.params);
  const p = filters.passengers;
  if (p !== undefined && p !== null && p !== '') {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 6) return { error: 'Passengers must be 1 to 6' };
    params.passengers = String(n);
  }
  return { params };
};

// Works for rides and requests (both have pickupLocation, destination, departureTime)
export const filterByKeyword = (items, searchKeyword, parsed) =>
  items.filter((item) => {
    if (!String(searchKeyword || '').trim()) return true;
    const pickup = String(item.pickupLocation || '');
    const dest = String(item.destination || '');
    if (!parsed.hasTokens) {
      const term = searchKeyword.toLowerCase();
      return pickup.toLowerCase().includes(term) || dest.toLowerCase().includes(term);
    }
    const locationsMatch = parsed.parsedLocations.every(
      (label) => matchesLandmark(pickup, label) || matchesLandmark(dest, label)
    );
    if (!locationsMatch) return false;
    if (!isDepartureInTimeWindow(item.departureTime, parsed.timeOfDay)) return false;
    if (parsed.cleanKeyword) {
      const term = parsed.cleanKeyword.toLowerCase();
      return pickup.toLowerCase().includes(term) || dest.toLowerCase().includes(term);
    }
    return true;
  });

export const emptyStateFor = ({ mode, tab }) => {
  const driver = normalizeMode(mode) === 'driver';
  if (tab === 'my') {
    return driver
      ? { title: 'No rides posted yet', body: 'Post a ride so passengers can find you.', ctaLabel: 'Offer a ride', ctaTo: '/offer-ride' }
      : { title: 'You have no requests', body: 'Post a request and drivers can offer you a seat.', ctaLabel: 'Post a request', ctaTo: '/request-ride' };
  }
  return driver
    ? { title: 'No open passenger requests for this date', body: 'No passenger has asked for a ride on this date yet. Be the first to offer one!', ctaLabel: 'Offer a ride', ctaTo: '/offer-ride' }
    : { title: 'No rides available for this date', body: 'No drivers have scheduled a ride for this date yet. Post a request and drivers can offer you a seat.', ctaLabel: 'Post a request', ctaTo: '/request-ride' };
};

export const loginPromptFor = ({ mode, tab }) => {
  const driver = normalizeMode(mode) === 'driver';
  if (driver) {
    return tab === 'feed'
      ? 'Log in to browse passenger requests and offer your ride.'
      : 'Log in to see and manage the rides you posted.';
  }
  return tab === 'feed' ? 'Log in to see available rides.' : 'Log in to see your ride requests.';
};
