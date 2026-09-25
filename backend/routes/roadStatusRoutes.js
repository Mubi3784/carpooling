const express = require('express');
const router = express.Router();
const {
  getRoadStatuses,
  createRoadStatus,
  updateRoadStatus,
  deleteRoadStatus,
} = require('../controllers/roadStatusController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public route
router.get('/', getRoadStatuses);

// Admin-only mutation routes
router.post('/', protect, adminOnly, createRoadStatus);
router.put('/:id', protect, adminOnly, updateRoadStatus);
router.delete('/:id', protect, adminOnly, deleteRoadStatus);

module.exports = router;