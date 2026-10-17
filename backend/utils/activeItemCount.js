/**
 * Combined per-user cap helper (P3). A user's active future Rides (as driver) and
 * active future RideRequests (as passenger) share ONE budget of
 * MAX_ACTIVE_FUTURE_ITEMS_PER_USER. Expired and cancelled items do not count.
 * Best effort under concurrency (same as P2).
 */
const countActiveFutureItems = async (userId) => {
  const Ride = require('../models/Ride');
  const RideRequest = require('../models/RideRequest');
  const now = new Date();
  const [rides, requests] = await Promise.all([
    Ride.countDocuments({
      driver: userId,
      status: { $in: ['ACTIVE', 'FULL'] },
      expiresAt: { $gt: now },
    }),
    RideRequest.countDocuments({
      passenger: userId,
      status: { $in: ['ACTIVE', 'MATCHED'] },
      expiresAt: { $gt: now },
    }),
  ]);
  return rides + requests;
};

module.exports = { countActiveFutureItems };
