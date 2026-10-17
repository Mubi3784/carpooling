const express = require('express');
const router = express.Router();
const {
  createRequest,
  getMyRequests,
  getRequests,
  getRequestById,
  updateRequest,
  getRidesForOffer,
  getMatchesForRequest,
  getMatchCounts,
  deleteRequest,
  deleteRequestSeries,
} = require('../controllers/requestController');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimiter');

// Per-IP, in-memory (best effort on serverless). Generous enough for normal use.
const createLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 20,
  message: 'Too many requests created. Please try again later.',
});

router.use(protect);

router.post('/', createLimiter, createRequest);
// Static paths must come before '/:id'
router.get('/mine', getMyRequests);
router.get('/matches/counts', getMatchCounts);
router.get('/', getRequests);
router.get('/:id/matches', getMatchesForRequest);
router.delete('/series/:seriesId', deleteRequestSeries);
router.get('/:id/rides-for-offer', getRidesForOffer);
router.get('/:id', getRequestById);
router.patch('/:id', updateRequest);
router.delete('/:id', deleteRequest);

module.exports = router;
