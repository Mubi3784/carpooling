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
    pricePerSeat: {
      type: Number,
      required: [true, 'Price per seat is required'],
      min: [0, 'Price cannot be negative'],
    },
    whatsappNumber: {
      type: String,
      required: [true, 'WhatsApp contact number is required'],
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
  },
  {
    timestamps: true,
  }
);

// TTL Index: MongoDB automatically deletes document when expiresAt timestamp arrives
rideSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound Index: Optimizes filtering by date, status, and departure time
rideSchema.index({ rideDate: 1, status: 1, departureDateTime: 1 });

module.exports = mongoose.model('Ride', rideSchema);