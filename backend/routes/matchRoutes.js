const express = require('express');
const router = express.Router();
const {
  createMatch,
  listMatches,
  acceptMatch,
  declineMatch,
  cancelMatch,
  getAlertCount,
  markSeen,
} = require('../controllers/matchController');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimiter');

const isTest = process.env.NODE_ENV === 'test';
const createLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: isTest ? 10000 : 40,
  message: 'Too many offers sent. Please try again later.',
});
const actionLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: isTest ? 10000 : 80,
  message: 'Too many actions. Please try again later.',
});

router.use(protect);

router.get('/alerts/count', getAlertCount);
router.post('/', createLimiter, createMatch);
router.get('/', listMatches);
router.post('/:id/accept', actionLimiter, acceptMatch);
router.post('/:id/decline', actionLimiter, declineMatch);
router.post('/:id/cancel', actionLimiter, cancelMatch);
router.post('/:id/seen', markSeen);

module.exports = router;
