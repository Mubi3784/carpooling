const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    pickupLocation: {
      type: String,
      required: [true, 'Pickup location is required'],
      trim: true,
      maxlength: 100,
    },
    destination: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
      maxlength: 100,
    },
    requestDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    },
    departureTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24-hour format'],
    },
    departureDateTime: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    vehiclePreference: { type: String, enum: ['BIKE', 'CAR'], required: true },
    passengerCount: { type: Number, required: true, min: 1, max: 6, default: 1 },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    // EXPIRED is never stored; it is derived at read time (expiresAt <= now)
    status: { type: String, enum: ['ACTIVE', 'MATCHED', 'CANCELLED'], default: 'ACTIVE' },
    matchedRide: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', default: null },
    seriesId: { type: String, trim: true, maxlength: 64 },
    // expiresAt + 24h: expired requests stay visible to the owner until then
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true }
);

rideRequestSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
rideRequestSchema.index(
  { passenger: 1, seriesId: 1, requestDate: 1 },
  {
    unique: true,
    partialFilterExpression: { seriesId: { $type: 'string' } },
    name: 'uniq_passenger_series_date',
  }
);
rideRequestSchema.index({ passenger: 1, status: 1, expiresAt: 1 });
rideRequestSchema.index({ status: 1, vehiclePreference: 1, requestDate: 1, departureDateTime: 1 });

rideRequestSchema.pre('validate', function (next) {
  if (this.vehiclePreference === 'BIKE' && this.passengerCount !== 1) {
    this.invalidate('passengerCount', 'A bike request is for exactly 1 passenger');
  }
  next();
});

rideRequestSchema.statics.deriveStatus = (doc, now = new Date()) =>
  doc.status !== 'CANCELLED' && doc.expiresAt <= now ? 'EXPIRED' : doc.status;

module.exports = mongoose.model('RideRequest', rideRequestSchema);
