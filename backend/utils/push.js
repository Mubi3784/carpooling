/**
 * Web Push (zero cost). Payloads are GENERIC ONLY: no message text, names, places or
 * sender identity. No-ops silently when VAPID env vars are missing.
 * Callers should `await` notifyUser (never throws, bounded by a short timeout) so the
 * serverless function is not frozen mid-send.
 */
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const Conversation = require('../models/Conversation');

const PAYLOADS = {
  message: { title: 'Carpool', body: 'New message received', data: { type: 'message', url: '/chat' } },
  offer: { title: 'Carpool', body: 'New ride request', data: { type: 'offer', url: '/matches' } },
  update: { title: 'Carpool', body: 'Ride request update', data: { type: 'update', url: '/matches' } },
};
const SEND_TIMEOUT_MS = 5000;
const OVERALL_TIMEOUT_MS = 6000;
const MAX_FAILURES = 5;
const MESSAGE_THROTTLE_MS = 30 * 1000;

let configuredKey = null;
const isConfigured = () => {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  if (!pub || !priv || !subject) return false;
  const key = `${subject}|${pub}|${priv}`;
  if (configuredKey !== key) {
    try {
      webpush.setVapidDetails(subject, pub, priv);
    } catch (err) {
      console.error('Push disabled: invalid VAPID configuration');
      return false;
    }
    configuredKey = key;
  }
  return true;
};

const sendOne = async (sub, body) => {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      body,
      { timeout: SEND_TIMEOUT_MS, TTL: 3600 }
    );
    await PushSubscription.updateOne({ _id: sub._id }, { $set: { failureCount: 0 } });
  } catch (err) {
    const code = err && err.statusCode;
    if (code === 404 || code === 410) {
      await PushSubscription.deleteOne({ _id: sub._id });
      return;
    }
    const updated = await PushSubscription.findOneAndUpdate(
      { _id: sub._id },
      { $inc: { failureCount: 1 } },
      { new: true }
    );
    if (updated && updated.failureCount >= MAX_FAILURES) {
      await PushSubscription.deleteOne({ _id: sub._id });
    }
  }
};

// Resolves true if at least one send was attempted. Never throws.
const notifyUser = async (userId, kind) => {
  try {
    const payload = PAYLOADS[kind];
    if (!payload || !isConfigured()) return false;
    const subs = await PushSubscription.find({ user: userId }).lean();
    if (subs.length === 0) return false;
    const body = JSON.stringify(payload);
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, OVERALL_TIMEOUT_MS);
    });
    await Promise.race([Promise.allSettled(subs.map((s) => sendOne(s, body))), timeout]);
    clearTimeout(timer);
    return true;
  } catch (err) {
    console.error('Push failed:', err.message);
    return false;
  }
};

// Chat message push, at most one per conversation per ~30s (claimed atomically).
const notifyMessage = async (conversationId, recipientId) => {
  try {
    if (!isConfigured()) return false;
    // Only spend the throttle window if the recipient can actually receive a push
    if ((await PushSubscription.countDocuments({ user: recipientId })) === 0) return false;
    const conv = await Conversation.findById(conversationId).select('driver').lean();
    if (!conv) return false;
    const field = `lastPushAt.${String(conv.driver) === String(recipientId) ? 'driver' : 'passenger'}`;
    const now = new Date();
    const claimed = await Conversation.findOneAndUpdate(
      {
        _id: conversationId,
        $or: [
          { [field]: null },
          { [field]: { $exists: false } },
          { [field]: { $lte: new Date(now.getTime() - MESSAGE_THROTTLE_MS) } },
        ],
      },
      { $set: { [field]: now } }
    );
    if (!claimed) return false;
    return await notifyUser(recipientId, 'message');
  } catch (err) {
    console.error('Push failed:', err.message);
    return false;
  }
};

module.exports = { notifyUser, notifyMessage, isConfigured, PAYLOADS };
