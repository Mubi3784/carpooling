const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const rideMatchSchema = new mongoose.Schema(
  {
    ride: { type: ObjectId, ref: 'Ride', required: true },
    request: { type: ObjectId, ref: 'RideRequest', default: null },
    passenger: { type: ObjectId, ref: 'User', required: true },
    driver: { type: ObjectId, ref: 'User', required: true },
    initiatedBy: { type: String, enum: ['DRIVER', 'PASSENGER'], required: true },
    passengerCount: { type: Number, required: true, min: 1, max: 6 },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'],
      default: 'PENDING',
    },
    // true only while this match actually holds seats on the ride (single source of truth)
    seatsReserved: { type: Boolean, default: false },
    clientMatchId: { type: String, maxlength: 64 },
    respondedAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ['DRIVER', 'PASSENGER', null], default: null },
    // Alert flags: false = this party has an unseen update
    seenByDriver: { type: Boolean, default: false },
    seenByPassenger: { type: Boolean, default: false },
    // = the ride's expiresAt; TTL removes the match afterwards
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

rideMatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
rideMatchSchema.index(
  { ride: 1, passenger: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['PENDING', 'ACCEPTED'] } },
    name: 'uniq_active_match_ride_passenger',
  }
);
// Idempotency per initiator
rideMatchSchema.index(
  { ride: 1, passenger: 1, initiatedBy: 1, clientMatchId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMatchId: { $type: 'string' } },
    name: 'uniq_match_client_id',
  }
);
rideMatchSchema.index({ driver: 1, status: 1, expiresAt: 1 });
rideMatchSchema.index({ passenger: 1, status: 1, expiresAt: 1 });
rideMatchSchema.index({ ride: 1, status: 1 });
rideMatchSchema.index({ status: 1, seatsReserved: 1, expiresAt: 1 });

module.exports = mongoose.model('RideMatch', rideMatchSchema);
