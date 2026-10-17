const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

// Plain text only (see chatController for the XSS stance). Stored unencrypted so admins
// can review reported conversations.
const messageSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    sender: { type: ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
    clientMessageId: { type: String, required: true, maxlength: 64 },
    readAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ conversation: 1, clientMessageId: 1 }, { unique: true });
messageSchema.index({ sender: 1, createdAt: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', messageSchema);
