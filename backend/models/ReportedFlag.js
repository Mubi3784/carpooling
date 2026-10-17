const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000;

// Snapshot of a reported message. Deliberately survives the chat purge (self-contained,
// no refs that need to resolve) and expires 15 days after creation.
const reportedFlagSchema = new mongoose.Schema(
  {
    reporter: { type: ObjectId, ref: 'User', required: true },
    reportedUser: { type: ObjectId, ref: 'User', required: true },
    conversationId: { type: String, required: true },
    messageId: { type: String, required: true },
    messageText: { type: String, required: true, maxlength: 500 },
    senderId: { type: String, required: true },
    messageCreatedAt: { type: Date, required: true },
    rideContext: {
      rideId: String,
      pickupLocation: String,
      destination: String,
      rideDate: String,
      departureTime: String,
      vehicleType: String,
    },
    reason: { type: String, enum: ['harassment', 'spam', 'unsafe', 'other'], required: true },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  { collection: 'reported_flags' }
);

reportedFlagSchema.pre('validate', function (next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date((this.createdAt || new Date()).getTime() + FIFTEEN_DAYS);
  }
  next();
});

reportedFlagSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
reportedFlagSchema.index({ reporter: 1, messageId: 1 }, { unique: true });
reportedFlagSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ReportedFlag', reportedFlagSchema);
