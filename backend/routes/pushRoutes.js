const express = require('express');
const router = express.Router();
const { getPublicKey, subscribe, unsubscribe } = require('../controllers/pushController');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimiter');

const limiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests. Please slow down.',
});

router.use(protect);
router.get('/public-key', getPublicKey);
router.post('/subscribe', limiter, subscribe);
router.delete('/subscribe', limiter, unsubscribe);

module.exports = router;
