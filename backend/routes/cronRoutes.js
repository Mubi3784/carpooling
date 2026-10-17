const express = require('express');
const router = express.Router();
const { cleanup } = require('../controllers/cronController');

// Vercel cron issues GET with `Authorization: Bearer <CRON_SECRET>`; checked in the handler
router.get('/cleanup', cleanup);

module.exports = router;
