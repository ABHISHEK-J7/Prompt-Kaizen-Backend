const express = require('express');
const {
  analyze,
  history,
  getOne,
  remove,
  getScenarioForCategory,
  getDailyChallengeForToday,
  getDailyChallengeHistory,
} = require('../controllers/promptController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/scenario', protect, getScenarioForCategory);
router.get('/daily-challenge/history', protect, getDailyChallengeHistory);
router.get('/daily-challenge', protect, getDailyChallengeForToday);
router.post('/analyze', protect, analyze);
router.get('/history', protect, history);
router.get('/:id', protect, getOne);
router.delete('/:id', protect, remove);

module.exports = router;
