const express = require('express');
const router = express.Router();
const {
  listConversations,
  getConversation,
  getMessages,
  sendMessage,
  getUnreadCount,
  reportMessage,
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimiter');

// Small per-IP in-memory guard (best effort). The real per-user limit is Mongo-backed.
const writeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 200,
  message: 'Too many requests. Please slow down.',
});

router.use(protect);
router.get('/conversations', listConversations);
router.get('/unread-count', getUnreadCount);
router.get('/conversations/:id', getConversation);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', writeLimiter, sendMessage);
router.post('/messages/:id/report', writeLimiter, reportMessage);

module.exports = router;
