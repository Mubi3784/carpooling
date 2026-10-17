/**
 * Chat lifecycle hooks.
 *  - createChatForMatch(match): called when a match becomes ACCEPTED (idempotent).
 *  - purgeChatForMatch(match): hard-deletes messages then the conversation (idempotent).
 *    Called on match cancel, ride/series delete, request cancel, read-time expiry, cron.
 *    ReportedFlag snapshots are deliberately NOT deleted (own 15-day expiry).
 * Call sites must use `chatHooks.fn(...)` (not destructured) so tests can spy.
 */
const Ride = require('../models/Ride');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const createChatForMatch = async (match) => {
  if (!match || match.status !== 'ACCEPTED') return null;
  const ride = await Ride.findById(match.ride).select(
    'pickupLocation destination rideDate departureTime vehicleType expiresAt'
  );
  if (!ride) return null;
  try {
    return await Conversation.findOneAndUpdate(
      { match: match._id },
      {
        $setOnInsert: {
          match: match._id,
          ride: match.ride,
          driver: match.driver,
          passenger: match.passenger,
          contextSummary: {
            pickupLocation: ride.pickupLocation,
            destination: ride.destination,
            rideDate: ride.rideDate,
            departureTime: ride.departureTime,
            vehicleType: ride.vehicleType || 'CAR',
          },
          expiresAt: ride.expiresAt,
          unread: { driver: 0, passenger: 0 },
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err && err.code === 11000) return Conversation.findOne({ match: match._id });
    throw err;
  }
};

// Deletes messages first so a crash never leaves messages without their gate
const purgeConversations = async (filter) => {
  const convs = await Conversation.find(filter).select('_id').lean();
  if (convs.length === 0) return { conversations: 0, messages: 0 };
  const ids = convs.map((c) => c._id);
  const msgs = await Message.deleteMany({ conversation: { $in: ids } });
  const del = await Conversation.deleteMany({ _id: { $in: ids } });
  return { conversations: del.deletedCount, messages: msgs.deletedCount };
};

const purgeChatForMatch = async (match) => {
  if (!match || !match._id) return match;
  await purgeConversations({ match: match._id });
  return match;
};

const purgeChatsForRides = (rideIds) => purgeConversations({ ride: { $in: rideIds } });

module.exports = { createChatForMatch, purgeChatForMatch, purgeChatsForRides, purgeConversations };
