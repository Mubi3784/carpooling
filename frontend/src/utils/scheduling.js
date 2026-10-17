import { getDateStringWithOffset } from './dateUtils.js';

export const MAX_DATES = 6;
export const WINDOW_DAYS = 13;

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Client-generated idempotency key (sent as clientRequestId). Matches ID_PATTERN.
 */
export const createClientRequestId = () => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  let hex = '';
  if (c && typeof c.getRandomValues === 'function') {
    hex = Array.from(c.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');
  } else {
    hex = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random()
      .toString(16)
      .slice(2)}`;
  }
  const id = `req-${hex}`.slice(0, 64);
  return ID_PATTERN.test(id) ? id : `req-${Date.now().toString(16)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Dates from startDate up to today + 13, as YYYY-MM-DD strings.
 * startDate is clamped into today..today+13.
 */
export const getSelectableDates = (startDate, now = new Date()) => {
  const today = getDateStringWithOffset(0, now);
  const last = getDateStringWithOffset(WINDOW_DAYS, now);
  let start = startDate || today;
  if (start < today) start = today;
  if (start > last) start = last;
  const dates = [];
  for (let i = 0; i <= WINDOW_DAYS; i += 1) {
    const d = getDateStringWithOffset(i, now);
    if (d >= start && d <= last) dates.push(d);
  }
  return dates;
};

/**
 * "2026-05-12" -> { weekday: 'Tue', label: '12 May' }
 */
export const formatDateChip = (yyyyMmDd) => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  };
};

/**
 * Adds or removes `date`. Adding past maxCount is a no-op. Result stays sorted.
 */
export const toggleDate = (selected, date, maxCount = MAX_DATES) => {
  if (selected.includes(date)) return selected.filter((d) => d !== date);
  if (selected.length >= maxCount) return selected;
  return [...selected, date].sort();
};

const byDateTime = (a, b) =>
  `${a.rideDate} ${a.departureTime}`.localeCompare(`${b.rideDate} ${b.departureTime}`);

/**
 * Groups rides sharing a seriesId (2+ rides) into one group; all others are single groups.
 * Groups are ordered by their earliest ride; rides inside a group are ascending.
 */
export const groupRidesBySeries = (rides) => {
  const bySeries = new Map();
  rides.forEach((r) => {
    if (!r.seriesId) return;
    if (!bySeries.has(r.seriesId)) bySeries.set(r.seriesId, []);
    bySeries.get(r.seriesId).push(r);
  });

  const groups = [];
  rides.forEach((r) => {
    const members = r.seriesId ? bySeries.get(r.seriesId) : null;
    if (members && members.length >= 2) {
      if (!groups.some((g) => g.seriesId === r.seriesId)) {
        groups.push({
          key: `series-${r.seriesId}`,
          seriesId: r.seriesId,
          rides: [...members].sort(byDateTime),
        });
      }
    } else {
      groups.push({ key: `ride-${r.id}`, seriesId: null, rides: [r] });
    }
  });
  return groups.sort((a, b) => byDateTime(a.rides[0], b.rides[0]));
};
