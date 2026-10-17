const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema(
  {
    driver: {
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
    rideDate: {
      type: String,
      required: [true, 'Ride date is required (YYYY-MM-DD)'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    },
    departureTime: {
      type: String,
      required: [true, 'Departure time is required (HH:mm)'],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24-hour format'],
    },
    departureDateTime: {
      type: Date,
      required: true,
      index: true,
    },
    availableSeats: {
      type: Number,
      required: true,
      min: [0, 'Available seats cannot be negative'],
      max: [6, 'Available seats cannot exceed 6'],
    },
    totalSeats: {
      type: Number,
      required: true,
      min: [1, 'Total seats must be at least 1'],
      max: [6, 'Total seats cannot exceed 6'],
    },
    vehicleType: {
      type: String,
      enum: ['CAR', 'BIKE'],
      default: 'CAR', // missing on old documents means CAR (no migration)
    },
    pricePerSeat: {
      type: Number,
      required: [true, 'Price per seat is required'],
      min: [0, 'Price cannot be negative'],
    },
    whatsappNumber: {
      type: String,
      // Private to the driver: stored but never returned by any API
      trim: true,
    },
    genderPreference: {
      type: String,
      enum: ['Anyone', 'Male Only', 'Female Only'],
      default: 'Anyone',
    },
    carDetails: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'FULL', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    // Groups the per-date rides of one multi-day submission (= clientRequestId).
    // Absent on legacy rides.
    seriesId: {
      type: String,
      trim: true,
      maxlength: 64,
    },
    // Set on creation (rides made after the P0 time zone fix already hold correct UTC)
    // and by scripts/migrate-shift-times.js. Lets the migration skip already-correct rides.
    timeShiftedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// TTL Index: MongoDB automatically deletes document when expiresAt timestamp arrives
rideSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound Index: Optimizes filtering by date, status, and departure time
rideSchema.index({ rideDate: 1, status: 1, departureDateTime: 1 });

// Compound Index: vehicle-filtered feed search
rideSchema.index({ status: 1, vehicleType: 1, rideDate: 1, departureDateTime: 1 });

// Idempotency: one ride per driver/series/date (legacy rides without seriesId are exempt)
rideSchema.index(
  { driver: 1, seriesId: 1, rideDate: 1 },
  {
    unique: true,
    partialFilterExpression: { seriesId: { $type: 'string' } },
    name: 'uniq_driver_series_date',
  }
);

// Per-user active ride count (cap check)
rideSchema.index({ driver: 1, status: 1, expiresAt: 1 });

// Seat invariants (only checked for new docs or when the relevant fields change)
rideSchema.pre('validate', function (next) {
  if (
    this.isNew ||
    this.isModified('availableSeats') ||
    this.isModified('totalSeats') ||
    this.isModified('vehicleType')
  ) {
    if (this.vehicleType === 'BIKE' && (this.totalSeats !== 1 || this.availableSeats > 1)) {
      this.invalidate('totalSeats', 'A bike ride has exactly 1 seat');
    }
    if (this.availableSeats > this.totalSeats) {
      this.invalidate('availableSeats', 'Available seats cannot exceed total seats');
    }
  }
  next();
});

module.exports = mongoose.model('Ride', rideSchema);