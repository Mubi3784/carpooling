const crypto = require('crypto');
const mongoose = require('mongoose');
const { sendServerError } = require('../utils/errorResponse');
const Ride = require('../models/Ride');
const RideMatch = require('../models/RideMatch');
const RideRequest = require('../models/RideRequest');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ReportedFlag = require('../models/ReportedFlag');
const chatHooks = require('../utils/chatHooks');
const { reconcileSeats } = require('../utils/matchService');

const BATCH = 500;
const MAX_BATCHES = 20; // bounded work per run; the next daily run continues

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

// Constant-time Bearer check. Fails closed when CRON_SECRET is unset.
const isAuthorized = (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  return crypto.timingSafeEqual(sha256(header.slice(7)), sha256(secret));
};

// Deletes matching docs in bounded batches; returns the number deleted
const deleteInBatches = async (Model, filter) => {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const ids = (await Model.find(filter).select('_id').limit(BATCH).lean()).map((d) => d._id);
    if (ids.length === 0) break;
    const r = await Model.deleteMany({ _id: { $in: ids } });
    total += r.deletedCount;
    if (ids.length < BATCH) break;
  }
  return total;
};

// Conversations past expiry, or whose ride no longer exists (messages go first)
const sweepChats = async (now) => {
  let conversations = 0;
  let messages = 0;
  const add = (r) => {
    conversations += r.conversations;
    messages += r.messages;
  };
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const ids = (await Conversation.find({ expiresAt: { $lte: now } }).select('_id').limit(BATCH).lean()).map(
      (c) => c._id
    );
    if (ids.length === 0) break;
    add(await chatHooks.purgeConversations({ _id: { $in: ids } }));
    if (ids.length < BATCH) break;
  }
  // Orphans: scan live conversations in id order and check their rides exist
  let lastId = null;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const filter = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Conversation.find(filter).sort({ _id: 1 }).select('ride').limit(BATCH).lean();
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1]._id;
    const rideIds = [...new Set(batch.map((c) => String(c.ride)))];
    const found = new Set(
      (await Ride.find({ _id: { $in: rideIds } }).select('_id').lean()).map((r) => String(r._id))
    );
    const gone = batch.filter((c) => !found.has(String(c.ride))).map((c) => c._id);
    if (gone.length > 0) add(await chatHooks.purgeConversations({ _id: { $in: gone } }));
    if (batch.length < BATCH) break;
  }
  // Stray messages (conversation already gone) that outlived their expiry
  messages += await deleteInBatches(Message, { expiresAt: { $lte: now } });
  return { conversations, messages };
};

// @desc    Daily cleanup (Vercel cron, GET). Idempotent; returns counts only.
// @route   GET /api/cron/cleanup
// @access  Bearer CRON_SECRET
const cleanup = async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const now = new Date();
    const counts = {};

    // Credit seats stuck on settled matches before their rides disappear
    counts.seatsReleased = (await reconcileSeats()).released;

    const chats = await sweepChats(now);
    counts.conversations = chats.conversations;
    counts.messages = chats.messages;

    // Expired rides take their matches (and any chat left behind) with them
    let rides = 0;
    let rideMatches = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const ids = (await Ride.find({ expiresAt: { $lte: now } }).select('_id').limit(BATCH).lean()).map(
        (r) => r._id
      );
      if (ids.length === 0) break;
      await chatHooks.purgeChatsForRides(ids);
      rideMatches += (await RideMatch.deleteMany({ ride: { $in: ids } })).deletedCount;
      rides += (await Ride.deleteMany({ _id: { $in: ids } })).deletedCount;
      if (ids.length < BATCH) break;
    }
    counts.rides = rides;
    counts.matches = rideMatches + (await deleteInBatches(RideMatch, { expiresAt: { $lte: now } }));
    counts.requests = await deleteInBatches(RideRequest, { purgeAt: { $lte: now } });

    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    counts.reports = await deleteInBatches(ReportedFlag, {
      $or: [{ expiresAt: { $lte: now } }, { createdAt: { $lte: fifteenDaysAgo } }],
    });

    // Push collection arrives in a later sub-phase; tolerate its absence
    counts.pushSubscriptions = 0;
    const Push = mongoose.models.PushSubscription;
    if (Push) counts.pushSubscriptions = await deleteInBatches(Push, { expiresAt: { $lte: now } });

    res.status(200).json({ success: true, data: counts });
  } catch (error) {
    sendServerError(res, error, 'Cleanup failed');
  }
};

module.exports = { cleanup, isAuthorized };
