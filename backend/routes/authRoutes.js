const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  getProfile,
  updateProfile,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimiter');

// Best-effort: counters are per serverless instance (see middleware/rateLimiter.js)
const limiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
};
const registerLimiter = createRateLimiter(limiterOptions);
const loginLimiter = createRateLimiter(limiterOptions);

router.post('/register', registerLimiter, registerUser);
router.post('/login', loginLimiter, loginUser);
router.get('/me', protect, getMe);
router.get('/profile', protect, getProfile);
router.patch(
  '/profile',
  protect,
  createRateLimiter({ windowMs: 60 * 1000, max: 20, message: 'Too many updates. Please wait a minute.' }),
  updateProfile
);

module.exports = router;