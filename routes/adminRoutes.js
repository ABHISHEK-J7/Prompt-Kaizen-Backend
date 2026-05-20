const express = require('express');
const { stats, listUsers, listPrompts } = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

const router = express.Router();

router.use(protect, adminOnly);

router.get('/stats', stats);
router.get('/users', listUsers);
router.get('/prompts', listPrompts);

module.exports = router;
