const express = require('express');
const { register, login, me, verifyOtp, resendOtp } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register',    register);
router.post('/login',       login);
router.post('/verify-otp',  verifyOtp);
router.post('/resend-otp',  resendOtp);
router.get('/me', protect,  me);

module.exports = router;
