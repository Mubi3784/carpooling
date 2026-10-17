// Pure helpers for P5 matching + feed filters (unit tested in tests/matches.test.js)

export const MATCH_LEVELS = ['EXACT', 'CLOSE', 'ALTERNATIVE'];

export const MATCH_LEVEL_LABELS = {
  EXACT: 'Exact match',
  CLOSE: 'Close match',
  ALTERNATIVE: 'Alternative',
};

export const SAFETY_NOTE = 'Matching suggestions do not guarantee a seat.';

export const EMPTY_MATCHES_MESSAGE =
  'No exact matches yet — try nearby times or the other vehicle type';

export const levelOrder = (level) => {
  const i = MATCH_LEVELS.indexOf(level);
  return i === -1 ? MATCH_LEVELS.length : i;
};

export const emptyMessage = () => EMPTY_MATCHES_MESSAGE;

// Ordered groups (only non-empty ones) plus per-level counts. Input order is kept inside a group.
export const groupByLevel = (items) => {
  const list = Array.isArray(items) ? items : [];
  const counts = { EXACT: 0, CLOSE: 0, ALTERNATIVE: 0 };
  for (const it of list) if (it.matchLevel in counts) counts[it.matchLevel] += 1;
  const groups = MATCH_LEVELS.filter((l) => counts[l] > 0).map((level) => ({
    level,
    label: MATCH_LEVEL_LABELS[level],
    items: list.filter((it) => it.matchLevel === level),
  }));
  return { groups, counts };
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Drops empty values; returns { params } or { error } (client-side mirror of the server rules)
export const buildFeedParams = (filters = {}) => {
  const params = {};
  const { timeFrom, timeTo, pickup, destination, minSeats } = filters;
  for (const [k, v] of [['timeFrom', timeFrom], ['timeTo', timeTo]]) {
    if (v) {
      if (!TIME_RE.test(v)) return { error: 'Time must be in HH:mm format' };
      params[k] = v;
    }
  }
  if (params.timeFrom && params.timeTo && params.timeFrom > params.timeTo) {
    return { error: 'Time from cannot be later than time to' };
  }
  for (const [k, v] of [['pickup', pickup], ['destination', destination]]) {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t) params[k] = t.slice(0, 50);
  }
  if (minSeats !== undefined && minSeats !== '' && minSeats !== null) {
    const n = Number(minSeats);
    if (!Number.isInteger(n) || n < 1 || n > 6) return { error: 'Minimum seats must be 1 to 6' };
    params.minSeats = String(n);
  }
  return { params };
};

export const countActiveFilters = (filters = {}) => {
  const keys = ['timeFrom', 'timeTo', 'pickup', 'destination', 'minSeats', 'passengers'];
  let n = keys.filter((k) => {
    const v = filters[k];
    return typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null && v !== '';
  }).length;
  if (filters.vehicle && filters.vehicle !== 'ALL') n += 1;
  return n;
};

// Request to Join payload. `requestId` is only sent when the vehicle matches the request,
// because the server rejects a linked request with a different vehicle type.
export const joinPayloadFor = (match, request, clientMatchId) => ({
  rideId: match.ride.id,
  ...(match.canLinkRequest
    ? { requestId: request.id }
    : { passengerCount: match.ride.vehicleType === 'BIKE' ? 1 : request.passengerCount }),
  clientMatchId: String(clientMatchId).slice(0, 64),
});
