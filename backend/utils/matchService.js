const Ride = require('../models/Ride');
const RideRequest = require('../models/RideRequest');
const RideMatch = require('../models/RideMatch');
const chatHooks = require('./chatHooks');

/**
 * Atomically takes n seats. The filter enforces ACTIVE, not expired and enough seats,
 * so concurrent accepts can never oversell. Pipeline update sets FULL in the same op.
 * Returns the updated ride, or null when the seats could not be reserved.
 */
const reserveSeats = (rideId, n) =>
  Ride.findOneAndUpdate(
    {
      _id: rideId,
      status: 'ACTIVE',
      availableSeats: { $gte: n },
      expiresAt: { $gt: new Date() },
    },
    [
      {
        $set: {
          availableSeats: { $subtract: ['$availableSeats', n] },
          status: {
            $cond: [{ $eq: [{ $subtract: ['$availableSeats', n] }, 0] }, 'FULL', '$status'],
          },
        },
      },
    ],
    { new: true }
  );

/**
 * Gives n seats back (capped at totalSeats; FULL -> ACTIVE when seats > 0).
 * Silently does nothing if the ride is gone, cancelled or expired.
 */
const restoreSeats = (rideId, n) =>
  Ride.findOneAndUpdate(
    { _id: rideId, status: { $in: ['ACTIVE', 'FULL'] }, expiresAt: { $gt: new Date() } },
    [
      {
        $set: {
          availableSeats: { $min: ['$totalSeats', { $add: ['$availableSeats', n] }] },
        },
      },
      {
        $set: {
          status: { $cond: [{ $gt: ['$availableSeats', 0] }, 'ACTIVE', '$status'] },
        },
      },
    ],
    { new: true }
  );

/**
 * Atomically claims PENDING -> ACCEPTED and marks the seats as held. Call ONLY after
 * reserveSeats succeeded. Returns the updated match, or null if someone else answered.
 */
const claimMatch = (matchId, role) =>
  RideMatch.findOneAndUpdate(
    { _id: matchId, status: 'PENDING' },
    {
      $set: {
        status: 'ACCEPTED',
        seatsReserved: true,
        respondedAt: new Date(),
        seenByDriver: role === 'DRIVER',
        seenByPassenger: role === 'PASSENGER',
      },
    },
    { new: true }
  );

/**
 * The ONLY seat-credit path for existing matches. Atomically flips seatsReserved
 * true -> false; only the caller that wins the flip credits the seats, so double or
 * concurrent cancels can never double-credit. With `credit:false` (ride being deleted)
 * the flag is cleared without touching the ride. Returns true if seats were released.
 */
const releaseSeatsForMatch = async (matchId, { credit = true } = {}) => {
  const doc = await RideMatch.findOneAndUpdate(
    { _id: matchId, seatsReserved: true },
    { $set: { seatsReserved: false } },
    { new: false }
  );
  if (!doc) return false;
  if (credit) await restoreSeats(doc.ride, doc.passengerCount);
  return true;
};

/**
 * Cancels a PENDING/ACCEPTED match. `by` is 'DRIVER' or 'PASSENGER' (the acting party;
 * the other party gets an unseen alert). Seats are credited only if the match holds them
 * (seatsReserved) and `restore` is true; false when the ride itself is being deleted.
 * Linked request goes back to ACTIVE. Returns the previous status, or null if it was
 * already settled.
 */
const cancelMatchInternal = async (match, by, { restore = true } = {}) => {
  const previous = await RideMatch.findOneAndUpdate(
    { _id: match._id, status: { $in: ['PENDING', 'ACCEPTED'] } },
    {
      $set: {
        status: 'CANCELLED',
        cancelledBy: by,
        respondedAt: new Date(),
        seenByDriver: by === 'DRIVER',
        seenByPassenger: by === 'PASSENGER',
      },
    },
    { new: false }
  );
  if (!previous) return null;

  // PENDING matches hold no seats (flag false) so this is a no-op for them
  await releaseSeatsForMatch(previous._id, { credit: restore });
  if (previous.request) {
    await RideRequest.updateOne(
      { _id: previous.request, status: 'MATCHED', matchedRide: previous.ride },
      { $set: { status: 'ACTIVE', matchedRide: null } }
    );
  }
  await chatHooks.purgeChatForMatch(previous);
  return previous.status;
};

// Ride is being deleted by its driver: cancel everything, seats need no restoring
const cascadeCancelForRide = async (rideId) => {
  const matches = await RideMatch.find({
    ride: rideId,
    status: { $in: ['PENDING', 'ACCEPTED'] },
  });
  for (const m of matches) {
    await cancelMatchInternal(m, 'DRIVER', { restore: false });
  }
};

// Request is being deleted by its passenger: cancel its matches, restore seats
const cascadeCancelForRequest = async (requestId) => {
  const matches = await RideMatch.find({
    request: requestId,
    status: { $in: ['PENDING', 'ACCEPTED'] },
  });
  for (const m of matches) {
    await cancelMatchInternal(m, 'PASSENGER');
  }
};

/**
 * Idempotent crash recovery (safe to run any time, e.g. from the daily cleanup job).
 * CANCELLED/DECLINED matches still flagged seatsReserved (crash between the status flip
 * and the release) get their seats credited exactly once via releaseSeatsForMatch.
 * Returns { released }. ACCEPTED-without-seats cannot occur by design (seats are
 * reserved before the claim) and is not auto-repaired.
 */
const reconcileSeats = async ({ rideId } = {}) => {
  const filter = { status: { $in: ['CANCELLED', 'DECLINED'] }, seatsReserved: true };
  if (rideId) filter.ride = rideId;
  const stuck = await RideMatch.find(filter).select('_id').limit(500).lean();
  let released = 0;
  for (const m of stuck) {
    if (await releaseSeatsForMatch(m._id)) released += 1;
  }
  return { released };
};

module.exports = {
  reserveSeats,
  restoreSeats,
  claimMatch,
  releaseSeatsForMatch,
  reconcileSeats,
  cancelMatchInternal,
  cascadeCancelForRide,
  cascadeCancelForRequest,
};
