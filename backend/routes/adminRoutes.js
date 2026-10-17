const express = require('express');
const router = express.Router();
const {
  listReports,
  listConversations,
  listConversationMessages,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect, adminOnly);
router.get('/reports', listReports);
router.get('/conversations', listConversations);
router.get('/conversations/:id/messages', listConversationMessages);

module.exports = router;
