/**
 * P5 unit tests: pure matching engine (no DB).
 */
const {
  EXACT_TIME_WINDOW_MIN,
  CLOSE_TIME_WINDOW_MIN,
  ALTERNATIVE_TIME_WINDOW_MIN,
  MATCH_LEVELS,
  FILLER_WORDS,
  normalizeText,
  tokenize,
  textMatches,
  isCandidate,
  matchRideToRequest,
  rankRidesForRequest,
  rankRequestsForRide,
} = require('../utils/matching');

const NOW = new Date('2030-01-01T00:00:00Z');
const BASE = new Date('2030-01-01T05:00:00Z'); // request departure
const at = (minOffset) => new Date(BASE.getTime() + minOffset * 60000);

const mkRequest = (o = {}) => ({
  passenger: 'p1',
  pickupLocation: 'Gulshan Block 5',
  destination: 'FAST University',
  requestDate: '2030-01-01',
  departureDateTime: BASE,
  expiresAt: new Date(BASE.getTime() + 15 * 60000),
  vehiclePreference: 'CAR',
  passengerCount: 1,
  status: 'ACTIVE',
  ...o,
});
const mkRide = (o = {}) => ({
  driver: 'd1',
  pickupLocation: 'Gulshan Block 5',
  destination: 'FAST University',
  rideDate: '2030-01-01',
  departureDateTime: BASE,
  expiresAt: new Date(BASE.getTime() + 15 * 60000),
  vehicleType: 'CAR',
  availableSeats: 3,
  totalSeats: 4,
  status: 'ACTIVE',
  ...o,
});
const level = (ride, request) => matchRideToRequest(ride, request, NOW)?.matchLevel ?? null;

describe('constants', () => {
  test('thresholds are named constants', () => {
    expect(EXACT_TIME_WINDOW_MIN).toBe(30);
    expect(CLOSE_TIME_WINDOW_MIN).toBe(90);
    expect(ALTERNATIVE_TIME_WINDOW_MIN).toBe(120);
    expect(Object.values(MATCH_LEVELS)).toEqual(['EXACT', 'CLOSE', 'ALTERNATIVE']);
    expect(FILLER_WORDS).toEqual(expect.arrayContaining(['road', 'sector', 'near', 'chowk', 'stop']));
  });
});

describe('normalisation', () => {
  test('lower-cases, trims, collapses spaces, strips punctuation', () => {
    expect(normalizeText('  Gulshan,   BLOCK-5!! ')).toBe('gulshan block5');
    expect(normalizeText('F-8   Markaz.')).toBe('f8 markaz');
  });
  test('non-string input gives empty string', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(['a'])).toBe('');
    expect(normalizeText({})).toBe('');
  });
  test('tokenize drops filler words', () => {
    expect(tokenize('Near Gulshan Chowk Road')).toEqual(['gulshan']);
    expect(tokenize('Sector G-10 bus stop')).toEqual(['g10']);
  });
  test('custom filler list is honoured', () => {
    expect(tokenize('gulshan market', ['market'])).toEqual(['gulshan']);
  });
  test('textMatches: equality, containment, shared token, no match, only fillers', () => {
    expect(textMatches('FAST University', 'fast university')).toBe(true);
    expect(textMatches('FAST', 'FAST University Campus')).toBe(true);
    expect(textMatches('Gulshan Block 5', 'Near Gulshan Chowk')).toBe(true);
    expect(textMatches('Gulshan', 'Saddar')).toBe(false);
    expect(textMatches('Road', 'Chowk')).toBe(false);
    expect(textMatches('Road', 'road')).toBe(true);
    expect(textMatches('', '')).toBe(false);
    expect(textMatches(undefined, 'x')).toBe(false);
  });
});

describe('EXACT', () => {
  test('same vehicle, seats, time, destination, pickup', () => {
    const m = matchRideToRequest(mkRide(), mkRequest(), NOW);
    expect(m.matchLevel).toBe('EXACT');
    expect(m.reasons).toEqual(expect.arrayContaining(['Same vehicle', 'Same destination', 'Same pickup']));
  });
  test('boundary: 30 min is EXACT, 31 min is CLOSE', () => {
    expect(level(mkRide({ departureDateTime: at(30) }), mkRequest())).toBe('EXACT');
    expect(level(mkRide({ departureDateTime: at(-30) }), mkRequest())).toBe('EXACT');
    expect(level(mkRide({ departureDateTime: at(31) }), mkRequest())).toBe('CLOSE');
  });
  test('bike ride with a bike request (count 1) is EXACT', () => {
    expect(
      level(
        mkRide({ vehicleType: 'BIKE', availableSeats: 1, totalSeats: 1 }),
        mkRequest({ vehiclePreference: 'BIKE' })
      )
    ).toBe('EXACT');
  });
  test('filler words and case do not break the match', () => {
    expect(
      level(mkRide({ pickupLocation: 'GULSHAN, near chowk' }), mkRequest({ pickupLocation: 'gulshan' }))
    ).toBe('EXACT');
  });
});

describe('CLOSE', () => {
  test('boundary: 90 min is CLOSE, 91 min falls to ALTERNATIVE', () => {
    expect(level(mkRide({ departureDateTime: at(90) }), mkRequest())).toBe('CLOSE');
    expect(level(mkRide({ departureDateTime: at(91) }), mkRequest())).toBe('ALTERNATIVE');
  });
  test('needs a shared pickup token, otherwise ALTERNATIVE within 2h', () => {
    const far = { pickupLocation: 'Saddar' };
    expect(level(mkRide({ ...far, departureDateTime: at(60) }), mkRequest())).toBe('ALTERNATIVE');
    expect(level(mkRide({ ...far, departureDateTime: at(121) }), mkRequest())).toBeNull();
  });
  test('reason names the time difference', () => {
    const m = matchRideToRequest(mkRide({ departureDateTime: at(45) }), mkRequest(), NOW);
    expect(m.reasons).toContain('Departs 45 min later than requested');
    const e = matchRideToRequest(mkRide({ departureDateTime: at(-45) }), mkRequest(), NOW);
    expect(e.reasons).toContain('Departs 45 min earlier than requested');
  });
  test('similar but not identical pickup is stated', () => {
    const m = matchRideToRequest(
      mkRide({ departureDateTime: at(45), pickupLocation: 'Gulshan Market' }),
      mkRequest(),
      NOW
    );
    expect(m.matchLevel).toBe('CLOSE');
    expect(m.reasons).toContain('Pickup is similar but not identical');
  });
});

describe('ALTERNATIVE', () => {
  test('boundary: 120 min ok, 121 min excluded', () => {
    expect(level(mkRide({ departureDateTime: at(120) }), mkRequest())).toBe('ALTERNATIVE');
    expect(level(mkRide({ departureDateTime: at(121) }), mkRequest())).toBeNull();
  });
  test('BIKE request sees a CAR ride only as ALTERNATIVE', () => {
    const m = matchRideToRequest(mkRide(), mkRequest({ vehiclePreference: 'BIKE' }), NOW);
    expect(m.matchLevel).toBe('ALTERNATIVE');
    expect(m.reasons).toContain('Car instead of Bike');
  });
  test('CAR request (count 1) sees a BIKE ride as ALTERNATIVE', () => {
    const m = matchRideToRequest(
      mkRide({ vehicleType: 'BIKE', availableSeats: 1, totalSeats: 1 }),
      mkRequest(),
      NOW
    );
    expect(m.matchLevel).toBe('ALTERNATIVE');
    expect(m.reasons).toContain('Bike instead of Car');
  });
  test('CAR request for 2 never matches a BIKE ride', () => {
    expect(
      level(
        mkRide({ vehicleType: 'BIKE', availableSeats: 1, totalSeats: 1 }),
        mkRequest({ passengerCount: 2 })
      )
    ).toBeNull();
  });
  test('different pickup is called out', () => {
    const m = matchRideToRequest(
      mkRide({ pickupLocation: 'Saddar', departureDateTime: at(100) }),
      mkRequest(),
      NOW
    );
    expect(m.reasons).toContain('Pickup differs');
  });
  test('legacy ride without vehicleType is treated as CAR', () => {
    const legacy = mkRide();
    delete legacy.vehicleType;
    expect(level(legacy, mkRequest())).toBe('EXACT');
    expect(level(legacy, mkRequest({ vehiclePreference: 'BIKE' }))).toBe('ALTERNATIVE');
  });
});

describe('destination and capacity', () => {
  test('destination mismatch excludes at every level', () => {
    for (const mins of [0, 60, 100]) {
      expect(level(mkRide({ destination: 'Airport', departureDateTime: at(mins) }), mkRequest())).toBeNull();
    }
  });
  test('capacity compares availableSeats, never totalSeats', () => {
    expect(level(mkRide({ availableSeats: 2, totalSeats: 6 }), mkRequest({ passengerCount: 3 }))).toBeNull();
    expect(level(mkRide({ availableSeats: 2, totalSeats: 2 }), mkRequest({ passengerCount: 2 }))).toBe('EXACT');
    expect(level(mkRide({ availableSeats: 3, totalSeats: 3 }), mkRequest({ passengerCount: 3 }))).toBe('EXACT');
  });
  test('capacity applies to ALTERNATIVE too', () => {
    expect(
      level(mkRide({ availableSeats: 1, departureDateTime: at(100) }), mkRequest({ passengerCount: 2 }))
    ).toBeNull();
  });
});

describe('candidate rules', () => {
  test('different date excluded', () => {
    expect(level(mkRide({ rideDate: '2030-01-02' }), mkRequest())).toBeNull();
  });
  test('FULL and CANCELLED excluded', () => {
    expect(level(mkRide({ status: 'FULL' }), mkRequest())).toBeNull();
    expect(level(mkRide({ status: 'CANCELLED' }), mkRequest())).toBeNull();
  });
  test('expired excluded at read time using the injected now', () => {
    const ride = mkRide({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(level(ride, mkRequest())).toBeNull();
    expect(level(mkRide({ expiresAt: NOW }), mkRequest())).toBeNull();
    expect(matchRideToRequest(mkRide(), mkRequest(), new Date(BASE.getTime() + 16 * 60000))).toBeNull();
  });
  test('zero available seats excluded', () => {
    expect(level(mkRide({ availableSeats: 0 }), mkRequest())).toBeNull();
  });
  test('own ride excluded (string and ObjectId-like inputs)', () => {
    expect(level(mkRide({ driver: 'p1' }), mkRequest())).toBeNull();
    const oid = (s) => ({ toString: () => s });
    expect(level(mkRide({ driver: oid('abc') }), mkRequest({ passenger: oid('abc') }))).toBeNull();
    expect(isCandidate(mkRide({ driver: 'other' }), mkRequest(), NOW)).toBe(true);
  });
  test('inactive or expired requests do not match', () => {
    expect(level(mkRide(), mkRequest({ status: 'MATCHED' }))).toBeNull();
    expect(level(mkRide(), mkRequest({ expiresAt: new Date(NOW.getTime() - 1) }))).toBeNull();
  });
});

describe('ranking and purity', () => {
  test('ranks EXACT, CLOSE, ALTERNATIVE then by time distance', () => {
    const rides = [
      mkRide({ id: 'alt', departureDateTime: at(110) }),
      mkRide({ id: 'close', departureDateTime: at(60) }),
      mkRide({ id: 'exact2', departureDateTime: at(20) }),
      mkRide({ id: 'exact1', departureDateTime: at(5) }),
      mkRide({ id: 'none', destination: 'Airport' }),
    ];
    const out = rankRidesForRequest(rides, mkRequest(), NOW);
    expect(out.map((r) => r.item.id)).toEqual(['exact1', 'exact2', 'close', 'alt']);
    expect(out.map((r) => r.matchLevel)).toEqual(['EXACT', 'EXACT', 'CLOSE', 'ALTERNATIVE']);
  });
  test('rankRequestsForRide ranks requests for a ride', () => {
    const reqs = [
      mkRequest({ id: 'far', departureDateTime: at(100) }),
      mkRequest({ id: 'near', departureDateTime: at(0) }),
    ];
    const out = rankRequestsForRide(reqs, mkRide(), NOW);
    expect(out.map((r) => r.item.id)).toEqual(['near', 'far']);
  });
  test('frozen inputs are never mutated', () => {
    const deepFreeze = (o) => {
      Object.values(o).forEach((v) => v && typeof v === 'object' && !(v instanceof Date) && deepFreeze(v));
      return Object.freeze(o);
    };
    const ride = deepFreeze(mkRide());
    const request = deepFreeze(mkRequest());
    expect(() => rankRidesForRequest([ride], request, NOW)).not.toThrow();
    expect(() => rankRequestsForRide([request], ride, NOW)).not.toThrow();
    expect(ride.status).toBe('ACTIVE');
    expect(ride.availableSeats).toBe(3);
  });
});
