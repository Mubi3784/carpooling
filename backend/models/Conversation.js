const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

// One chat per ACCEPTED RideMatch. Hard-deleted (with its messages) when the match is
// cancelled, the ride goes away, or on read-time expiry; TTL is only a safety net.
const conversationSchema = new mongoose.Schema(
  {
    ride: { type: ObjectId, ref: 'Ride', required: true },
    match: { type: ObjectId, ref: 'RideMatch', required: true },
    driver: { type: ObjectId, ref: 'User', required: true },
    passenger: { type: ObjectId, ref: 'User', required: true },
    contextSummary: {
      pickupLocation: String,
      destination: String,
      rideDate: String,
      departureTime: String,
      vehicleType: String,
    },
    // = ride.expiresAt (departure + 15 min)
    expiresAt: { type: Date, required: true },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '', maxlength: 80 },
    unread: {
      driver: { type: Number, default: 0, min: 0 },
      passenger: { type: Number, default: 0, min: 0 },
    },
    // Per-recipient push throttle (a reply must still notify the other person)
    lastPushAt: {
      driver: { type: Date, default: null },
      passenger: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

conversationSchema.index({ match: 1 }, { unique: true });
conversationSchema.index({ driver: 1, lastMessageAt: -1 });
conversationSchema.index({ passenger: 1, lastMessageAt: -1 });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
conversationSchema.index({ ride: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
