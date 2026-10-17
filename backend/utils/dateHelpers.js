// All users are in Pakistan: Asia/Karachi, UTC+5, no daylight saving.
const APP_TIME_ZONE = 'Asia/Karachi';
const APP_UTC_OFFSET = '+05:00';

/**
 * Combines YYYY-MM-DD and HH:mm (entered as Pakistan local time) into a UTC Date.
 */
const createDepartureDateTime = (rideDate, departureTime) => {
  return new Date(`${rideDate}T${departureTime}:00${APP_UTC_OFFSET}`);
};

/**
 * Returns today's date as YYYY-MM-DD in Asia/Karachi (not the server's local date).
 */
const getTodayInAppTimeZone = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/**
 * True when value is a YYYY-MM-DD string that is a real calendar date.
 */
const isValidDateString = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

/**
 * Pure calendar math on YYYY-MM-DD strings (no time zone drift).
 */
const addDaysToDateString = (yyyyMmDd, n) => {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Validates that the departure time is at least 5 minutes in the future.
 */
const isFutureDeparture = (departureDateTime) => {
  const now = new Date();
  // Allow minimum 5 minutes margin
  return departureDateTime.getTime() > now.getTime() + 5 * 60 * 1000;
};

/**
 * Calculates expiration timestamp: departure time + 15-minute grace period.
 */
const calculateExpiration = (departureDateTime) => {
  const GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutes
  return new Date(departureDateTime.getTime() + GRACE_PERIOD_MS);
};

module.exports = {
  APP_TIME_ZONE,
  APP_UTC_OFFSET,
  createDepartureDateTime,
  getTodayInAppTimeZone,
  isValidDateString,
  addDaysToDateString,
  isFutureDeparture,
  calculateExpiration,
};
