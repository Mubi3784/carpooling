const { sendServerError } = require('../utils/errorResponse');
const PushSubscription = require('../models/PushSubscription');

const MAX_PER_USER = 5;
const MAX_ENDPOINT = 512;
const MAX_KEY = 256;

const send = (res, status, message) => res.status(status).json({ success: false, message });
const isHttpsUrl = (v) => {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_ENDPOINT) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};
const isKey = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_KEY;

// @route GET /api/push/public-key  (public key is not secret)
const getPublicKey = (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
    ? process.env.VAPID_PUBLIC_KEY
    : null;
  res.status(200).json({ success: true, data: { key } });
};

// @route POST /api/push/subscribe  { endpoint, keys:{p256dh,auth} }
const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!isHttpsUrl(endpoint)) return send(res, 400, 'Invalid subscription endpoint');
    if (!keys || typeof keys !== 'object' || !isKey(keys.p256dh) || !isKey(keys.auth)) {
      return send(res, 400, 'Invalid subscription keys');
    }
    const me = req.user._id;
    const existing = await PushSubscription.findOne({ endpoint }).select('user').lean();
    if (!existing || String(existing.user) !== String(me)) {
      const count = await PushSubscription.countDocuments({ user: me });
      if (count >= MAX_PER_USER) {
        // Cap: drop the oldest to make room
        const oldest = await PushSubscription.find({ user: me })
          .sort({ createdAt: 1 })
          .limit(count - MAX_PER_USER + 1)
          .select('_id')
          .lean();
        await PushSubscription.deleteMany({ _id: { $in: oldest.map((o) => o._id) } });
      }
    }
    const userAgent = String(req.get('user-agent') || '').slice(0, 200);
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          user: me,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          userAgent,
          failureCount: 0,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true });
  } catch (error) {
    sendServerError(res, error, 'Server error saving subscription');
  }
};

// @route DELETE /api/push/subscribe  { endpoint }
const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!isHttpsUrl(endpoint)) return send(res, 400, 'Invalid subscription endpoint');
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    res.status(200).json({ success: true });
  } catch (error) {
    sendServerError(res, error, 'Server error removing subscription');
  }
};

module.exports = { getPublicKey, subscribe, unsubscribe };
