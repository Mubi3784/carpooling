const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Ride = require('../models/Ride');
const RideMatch = require('../models/RideMatch');
const chatHooks = require('./chatHooks');

const ENDED_MESSAGE = 'This chat has ended. Chats are deleted after the ride.';

const isObjectId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);

/**
 * Shared gate for EVERY chat route.
 *  1. Unknown id, malformed id or caller not driver/passenger -> 404 (identical for all,
 *     so a stranger cannot tell whether a conversation exists).
 *  2. READ-TIME EXPIRY: if now >= expiresAt, or the ride is gone/cancelled, or the match
 *     is no longer ACCEPTED, the chat is hard-deleted right here and 410 is returned.
 *     Access control never relies on the Mongo TTL monitor (it lags up to ~60 s+).
 * Returns { conversation, role } on success or { error: { status, message } }.
 */
const loadConversationForUser = async (id, userId, now = new Date()) => {
  const notFound = { error: { status: 404, message: 'Conversation not found' } };
  if (!isObjectId(id)) return notFound;
  const conversation = await Conversation.findById(id);
  if (!conversation) return notFound;
  const me = String(userId);
  let role = null;
  if (String(conversation.driver) === me) role = 'DRIVER';
  else if (String(conversation.passenger) === me) role = 'PASSENGER';
  if (!role) return notFound;

  let ended = now >= conversation.expiresAt;
  if (!ended) {
    const [ride, match] = await Promise.all([
      Ride.findById(conversation.ride).select('status expiresAt').lean(),
      RideMatch.findById(conversation.match).select('status').lean(),
    ]);
    ended =
      !ride ||
      ride.status === 'CANCELLED' ||
      now >= ride.expiresAt ||
      !match ||
      match.status !== 'ACCEPTED';
  }
  if (ended) {
    await chatHooks.purgeConversations({ _id: conversation._id });
    return { error: { status: 410, message: ENDED_MESSAGE } };
  }
  return { conversation, role };
};

module.exports = { loadConversationForUser, isObjectId, ENDED_MESSAGE };
