const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getVehicleType = (ride) => ride.vehicleType ?? 'CAR'; // old docs lack the field

const isExpired = (doc, now = new Date()) => !doc.expiresAt || doc.expiresAt <= now;

// BIKE-BIKE and CAR-CAR only
const isVehicleCompatible = (requestVehicle, ride) => requestVehicle === getVehicleType(ride);

/**
 * Validates that a ride can take `passengerCount` passengers (optionally for a request).
 * Returns { ok: true } or { ok: false, status, message }.
 */
const checkOfferEligibility = ({ ride, request, passengerCount, now = new Date() }) => {
  if (!ride || ride.status === 'CANCELLED' || isExpired(ride, now)) {
    return { ok: false, status: 404, message: 'Ride not found or has already departed' };
  }
  if (ride.status === 'FULL' || ride.availableSeats <= 0) {
    return { ok: false, status: 409, message: 'This ride has no seats left' };
  }
  if (ride.availableSeats < passengerCount) {
    return { ok: false, status: 409, message: 'Not enough seats left on this ride' };
  }
  if (request) {
    if (request.status !== 'ACTIVE' || isExpired(request, now)) {
      return { ok: false, status: 409, message: 'This request is no longer active' };
    }
    if (request.requestDate !== ride.rideDate) {
      return { ok: false, status: 400, message: 'The ride and request must be on the same date' };
    }
    if (!isVehicleCompatible(request.vehiclePreference, ride)) {
      return {
        ok: false,
        status: 400,
        message: 'Vehicle type does not match (bike with bike, car with car)',
      };
    }
  }
  if (getVehicleType(ride) === 'BIKE' && passengerCount !== 1) {
    return { ok: false, status: 400, message: 'A bike ride carries exactly 1 passenger' };
  }
  return { ok: true };
};

// ---------------------------------------------------------------------------
// P5 matching engine: PURE (no DB, no mutation, never changes any status).
// ---------------------------------------------------------------------------

const EXACT_TIME_WINDOW_MIN = 30;
const CLOSE_TIME_WINDOW_MIN = 90;
const ALTERNATIVE_TIME_WINDOW_MIN = 120;
const MATCH_LEVELS = Object.freeze({
  EXACT: 'EXACT',
  CLOSE: 'CLOSE',
  ALTERNATIVE: 'ALTERNATIVE',
});
const LEVEL_ORDER = [MATCH_LEVELS.EXACT, MATCH_LEVELS.CLOSE, MATCH_LEVELS.ALTERNATIVE];

// Generic words ignored when comparing places. Configurable: edit this list
// (or pass a different list as the optional `fillers` argument).
const FILLER_WORDS = [
  'road', 'rd', 'sector', 'near', 'chowk', 'stop', 'street', 'st', 'block', 'phase',
  'opposite', 'opp', 'behind', 'side', 'area', 'the', 'of', 'and', 'to', 'in', 'at', 'bus',
];

const normalizeText = (value) =>
  typeof value === 'string'
    ? value
        .toLowerCase()
        .replace(/['’-]/g, '') // "i-8" -> "i8" so sector codes stay one token
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

const tokenize = (value, fillers = FILLER_WORDS) => {
  const skip = new Set(fillers);
  return normalizeText(value)
    .split(' ')
    .filter((t) => t && !skip.has(t));
};

const sharesToken = (a, b, fillers = FILLER_WORDS) => {
  const tb = new Set(tokenize(b, fillers));
  return tokenize(a, fillers).some((t) => tb.has(t));
};

// Equal, one contains the other (word-wise), or a shared meaningful token
const textMatches = (a, b, fillers = FILLER_WORDS) => {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na && na === nb) return true;
  const ja = tokenize(a, fillers).join(' ');
  const jb = tokenize(b, fillers).join(' ');
  if (!ja || !jb) return false;
  if (ja === jb || ` ${ja} `.includes(` ${jb} `) || ` ${jb} `.includes(` ${ja} `)) return true;
  return sharesToken(a, b, fillers);
};

const minutesApart = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;

// Accepts an id, an ObjectId, or a populated doc
const idOf = (v) => String(v && v._id ? v._id : v);

// Read-time candidate rules (never relies on TTL deletion)
const isCandidate = (ride, request, now = new Date()) =>
  !!ride &&
  !!request &&
  ride.rideDate === request.requestDate &&
  ride.status === 'ACTIVE' &&
  !isExpired(ride, now) &&
  ride.availableSeats > 0 &&
  idOf(ride.driver) !== idOf(request.passenger) &&
  (!request.status || request.status === 'ACTIVE') &&
  !(request.expiresAt && request.expiresAt <= now);

const capacityOk = (ride, passengerCount) =>
  getVehicleType(ride) === 'BIKE'
    ? passengerCount === 1
    : ride.availableSeats >= passengerCount; // availableSeats, never totalSeats

const vehicleLabel = (v) => (v === 'BIKE' ? 'Bike' : 'Car');

/**
 * Returns null (no match) or { matchLevel, reasons[] }.
 * ALTERNATIVE always stays within ALTERNATIVE_TIME_WINDOW_MIN, even for a different vehicle.
 */
const matchRideToRequest = (ride, request, now = new Date(), fillers = FILLER_WORDS) => {
  if (!isCandidate(ride, request, now)) return null;
  if (!textMatches(ride.destination, request.destination, fillers)) return null;
  if (!capacityOk(ride, request.passengerCount)) return null;

  const rideVehicle = getVehicleType(ride);
  const sameVehicle = rideVehicle === request.vehiclePreference;
  const diff = minutesApart(ride.departureDateTime, request.departureDateTime);
  if (diff > ALTERNATIVE_TIME_WINDOW_MIN) return null;
  const signed = (new Date(ride.departureDateTime) - new Date(request.departureDateTime)) / 60000;
  const pickupOk = textMatches(ride.pickupLocation, request.pickupLocation, fillers);
  const pickupShared = sharesToken(ride.pickupLocation, request.pickupLocation, fillers);
  const samePickup =
    tokenize(ride.pickupLocation, fillers).join(' ') ===
    tokenize(request.pickupLocation, fillers).join(' ');
  const mins = Math.round(Math.abs(signed));
  const timeReason =
    mins === 0
      ? 'Departs at the requested time'
      : `Departs ${mins} min ${signed > 0 ? 'later' : 'earlier'} than requested`;

  if (sameVehicle && diff <= EXACT_TIME_WINDOW_MIN && pickupOk) {
    return {
      matchLevel: MATCH_LEVELS.EXACT,
      reasons: [
        'Same vehicle',
        'Seats available',
        diff === 0 ? 'Departs at the requested time' : `${timeReason} (within ${EXACT_TIME_WINDOW_MIN} min)`,
        'Same destination',
        samePickup ? 'Same pickup' : 'Pickup is similar but not identical',
      ],
    };
  }
  if (sameVehicle && diff <= CLOSE_TIME_WINDOW_MIN && pickupShared) {
    return {
      matchLevel: MATCH_LEVELS.CLOSE,
      reasons: [
        'Same vehicle',
        'Seats available',
        timeReason,
        'Same destination',
        samePickup ? 'Same pickup' : 'Pickup is similar but not identical',
      ],
    };
  }
  const reasons = [];
  if (!sameVehicle) {
    reasons.push(`${vehicleLabel(rideVehicle)} instead of ${vehicleLabel(request.vehiclePreference)}`);
  }
  if (diff > 0) reasons.push(timeReason);
  if (!pickupOk) reasons.push('Pickup differs');
  else if (!samePickup) reasons.push('Pickup is similar but not identical');
  reasons.push('Same destination', 'Seats available');
  return { matchLevel: MATCH_LEVELS.ALTERNATIVE, reasons };
};

const byRank = (a, b) =>
  LEVEL_ORDER.indexOf(a.matchLevel) - LEVEL_ORDER.indexOf(b.matchLevel) ||
  a.minutesApart - b.minutesApart ||
  new Date(a.departureDateTime) - new Date(b.departureDateTime);

const rank = (items, evaluate) =>
  items
    .map((item) => {
      const m = evaluate(item);
      return m
        ? { item, ...m, minutesApart: m.minutes, departureDateTime: item.departureDateTime }
        : null;
    })
    .filter(Boolean)
    .sort(byRank)
    .map(({ item, matchLevel, reasons }) => ({ item, matchLevel, reasons }));

const withMinutes = (m, a, b) => (m ? { ...m, minutes: minutesApart(a, b) } : null);

// Ranked [{ item: ride, matchLevel, reasons }]
const rankRidesForRequest = (rides, request, now = new Date()) =>
  rank(rides, (ride) =>
    withMinutes(
      matchRideToRequest(ride, request, now),
      ride.departureDateTime,
      request.departureDateTime
    )
  );

// Ranked [{ item: request, matchLevel, reasons }]
const rankRequestsForRide = (requests, ride, now = new Date()) =>
  rank(requests, (request) =>
    withMinutes(
      matchRideToRequest(ride, request, now),
      ride.departureDateTime,
      request.departureDateTime
    )
  );

module.exports = {
  escapeRegex,
  getVehicleType,
  isExpired,
  isVehicleCompatible,
  checkOfferEligibility,
  EXACT_TIME_WINDOW_MIN,
  CLOSE_TIME_WINDOW_MIN,
  ALTERNATIVE_TIME_WINDOW_MIN,
  MATCH_LEVELS,
  FILLER_WORDS,
  normalizeText,
  tokenize,
  textMatches,
  sharesToken,
  minutesApart,
  isCandidate,
  matchRideToRequest,
  rankRidesForRequest,
  rankRequestsForRide,
};
