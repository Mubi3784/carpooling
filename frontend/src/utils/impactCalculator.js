/**
 * Commute Economics Engine
 *
 * Estimates what a passenger saves by carpooling instead of booking a solo
 * ride-hailing trip, plus the CO₂ prevented. Distances come from a fixed
 * Twin Cities corridor table (no paid Maps API, no GPS measurement).
 */

export const SOLO_FARE_PER_KM = 65; // PKR per km, Twin Cities ride-hailing / taxi estimate
export const MIN_SOLO_FARE = 350; // PKR minimum solo fare
export const CO2_KG_PER_PASSENGER_KM = 0.171; // kg CO₂ per passenger-km (petrol passenger car)
export const DEFAULT_TWIN_CITIES_KM = 15;
export const INTERCITY_KM = 120;

// Islamabad sector pattern after normalisation (e.g. "f-10", "g-8")
const ISLAMABAD_SECTOR = /[d-i]-\d{1,2}/;
const F_SECTOR = /f-\d{1,2}/;

const RAWALPINDI_ALIASES = ['rawalpindi', 'pindi', 'rwp', 'saddar', 'commercial market'];

/**
 * Corridor table, checked in order (most specific first).
 * Matching works in either direction (sideA -> sideB or sideB -> sideA).
 */
export const CORRIDORS = [
  {
    label: 'Rawalpindi / Faizabad ↔ COMSATS (Park Road)',
    distanceKm: 12,
    sideA: [...RAWALPINDI_ALIASES, 'faizabad'],
    sideB: ['comsats', 'park road', 'chak shahzad'],
  },
  {
    label: 'Rawalpindi / Saddar ↔ NUST (H-12)',
    distanceKm: 22,
    sideA: RAWALPINDI_ALIASES,
    sideB: ['nust', 'h-12'],
  },
  {
    label: 'Islamabad F-Sectors ↔ FAST / CFD (H-11)',
    distanceKm: 14,
    sideA: ['islamabad', 'isb', 'blue area', F_SECTOR],
    sideB: ['fast', 'cfd', 'h-11'],
  },
  {
    label: 'Rawalpindi / Saddar ↔ Islamabad / Blue Area',
    distanceKm: 18,
    sideA: [...RAWALPINDI_ALIASES, 'faizabad'],
    sideB: ['islamabad', 'isb', 'blue area', ISLAMABAD_SECTOR],
  },
];

const INTERCITY_KEYWORDS = [
  'peshawar',
  'lahore',
  'm-1',
  'm-2',
  'motorway',
  'murree',
  'abbottabad',
  'faisalabad',
  'multan',
  'karachi',
  'swat',
  'attock',
  'jhelum',
  'gujranwala',
  'sialkot',
  'muzaffarabad',
  'mansehra',
];

export const IMPACT_ASSUMPTIONS = [
  `Solo ride-hailing estimate: PKR ${SOLO_FARE_PER_KM}/km with a PKR ${MIN_SOLO_FARE} minimum fare.`,
  `Emissions factor: ${CO2_KG_PER_PASSENGER_KM} kg CO₂ per passenger-km avoided (petrol passenger car).`,
  `Distances come from a fixed Twin Cities corridor table (default ~${DEFAULT_TWIN_CITIES_KM} km, intercity ~${INTERCITY_KM} km) — estimates, not GPS-measured.`,
];

/**
 * Lowercases, collapses whitespace and unifies sector / motorway spellings:
 * "H12", "h 12" -> "h-12"; "M1", "m 1" -> "m-1".
 */
const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b([d-i])[\s-]?(\d{1,2})\b/g, '$1-$2')
    .replace(/\bm[\s-]?(\d)\b/g, 'm-$1')
    .trim();
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds a regex that matches the alias only when bounded by non-alphanumerics
const aliasToRegExp = (alias) => {
  const source = alias instanceof RegExp ? alias.source : escapeRegExp(alias);
  return new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`);
};

const matchesAny = (text, aliases) => aliases.some((alias) => aliasToRegExp(alias).test(text));

/**
 * Estimates the corridor distance for a pickup/destination pair.
 * @returns {{ distanceKm: number, isIntercity: boolean, corridorLabel: string }}
 */
export const estimateCorridorDistance = (pickup, destination) => {
  const from = normalizeText(pickup);
  const to = normalizeText(destination);

  if (matchesAny(from, INTERCITY_KEYWORDS) || matchesAny(to, INTERCITY_KEYWORDS)) {
    return {
      distanceKm: INTERCITY_KM,
      isIntercity: true,
      corridorLabel: 'Intercity / Motorway route',
    };
  }

  for (const corridor of CORRIDORS) {
    const forward = matchesAny(from, corridor.sideA) && matchesAny(to, corridor.sideB);
    const reverse = matchesAny(from, corridor.sideB) && matchesAny(to, corridor.sideA);
    if (forward || reverse) {
      return {
        distanceKm: corridor.distanceKm,
        isIntercity: false,
        corridorLabel: corridor.label,
      };
    }
  }

  return {
    distanceKm: DEFAULT_TWIN_CITIES_KM,
    isIntercity: false,
    corridorLabel: 'Twin Cities default',
  };
};

/**
 * Calculates passenger savings vs solo ride-hailing and CO₂ prevented.
 * @param {string} pickup
 * @param {string} destination
 * @param {number} pricePerSeat PKR charged per seat
 * @param {number} seats number of seats shared (default 1)
 * @returns {{ soloEstimate: number, passengerSavings: number, co2KgSaved: number,
 *   distanceKm: number, isIntercity: boolean, corridorLabel: string }}
 */
export const calculateRideImpact = (pickup, destination, pricePerSeat, seats = 1) => {
  const { distanceKm, isIntercity, corridorLabel } = estimateCorridorDistance(pickup, destination);

  const parsedPrice = Number(pricePerSeat);
  const price = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0;

  const parsedSeats = Number(seats);
  const seatCount = Number.isFinite(parsedSeats) && parsedSeats >= 1 ? Math.floor(parsedSeats) : 1;

  const soloEstimate = Math.max(MIN_SOLO_FARE, Math.round(distanceKm * SOLO_FARE_PER_KM));
  const passengerSavings = Math.max(0, soloEstimate - price);
  const co2KgSaved = Math.round(distanceKm * CO2_KG_PER_PASSENGER_KM * seatCount * 10) / 10;

  return {
    soloEstimate,
    passengerSavings,
    co2KgSaved,
    distanceKm,
    isIntercity,
    corridorLabel,
  };
};
