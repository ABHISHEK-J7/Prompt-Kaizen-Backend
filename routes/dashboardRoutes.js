const express = require('express');
const { stats, badges, weeklyRecap } = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/stats', protect, stats);
router.get('/badges', protect, badges);
router.get('/weekly-recap', protect, weeklyRecap);

module.exports = router;
