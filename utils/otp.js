const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 2;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Generate a uniformly-distributed 6-digit OTP as a string. Uses crypto
 * (not Math.random) so OTPs aren't predictable.
 */
function generateOtp() {
  // crypto.randomInt is exclusive of the upper bound. 100000–999999 inclusive.
  return String(crypto.randomInt(100_000, 1_000_000));
}

async function hashOtp(otp) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(String(otp), salt);
}

async function verifyOtp(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(String(plain), hash);
}

function otpExpiry() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiry,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
};
