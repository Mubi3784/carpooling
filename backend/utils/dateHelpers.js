/**
 * Combines YYYY-MM-DD and HH:mm into a unified Date object in UTC.
 */
const createDepartureDateTime = (rideDate, departureTime) => {
  // Construct ISO string (e.g., '2026-09-23T08:30:00')
  return new Date(`${rideDate}T${departureTime}:00`);
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
  createDepartureDateTime,
  isFutureDeparture,
  calculateExpiration,
};