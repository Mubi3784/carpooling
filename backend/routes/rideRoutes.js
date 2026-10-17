const express = require('express');
const router = express.Router();
const {
  createRide,
  getRides,
  getRideById,
  getMyRides,
  updateSeats,
  deleteRide,
  deleteRideSeries,
  getMatchingRequests,
} = require('../controllers/rideController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

// Public & Optional Auth Routes
router.get('/', optionalAuth, getRides);
router.get('/my-rides', protect, getMyRides);
router.get('/:id/matching-requests', protect, getMatchingRequests);
router.get('/:id', optionalAuth, getRideById);

// Protected Routes (Must be logged in)
router.post('/', protect, createRide);
router.patch('/:id/seats', protect, updateSeats);
// Must be registered before '/:id' so 'series' is not captured as an id
router.delete('/series/:seriesId', protect, deleteRideSeries);
router.delete('/:id', protect, deleteRide);

module.exports = router;