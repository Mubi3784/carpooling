const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true, maxlength: 512 },
  keys: {
    p256dh: { type: String, required: true, maxlength: 256 },
    auth: { type: String, required: true, maxlength: 256 },
  },
  userAgent: { type: String, default: '', maxlength: 200 },
  createdAt: { type: Date, default: Date.now },
  failureCount: { type: Number, default: 0 },
  // refreshed on resubscribe; TTL removes stale subscriptions after 90 days
  expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
});

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ user: 1 });
pushSubscriptionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
