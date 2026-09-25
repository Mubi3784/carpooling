const mongoose = require('mongoose');

const roadStatusSchema = new mongoose.Schema(
  {
    roadName: {
      type: String,
      required: [true, 'Road name is required'],
      trim: true,
      maxlength: 120, // e.g. "M-1 Motorway (Islamabad → Peshawar)"
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED', 'RESTRICTED'],
      required: [true, 'Status is required'],
      default: 'OPEN',
    },
    category: {
      type: String,
      enum: ['Twin Cities', 'Motorways & Highways', 'Other'],
      default: 'Twin Cities',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300, // e.g. "Closed at toll plaza due to protest. Use GT Road."
      default: '',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true, // Manages createdAt and updatedAt automatically
  }
);

module.exports = mongoose.model('RoadStatus', roadStatusSchema);