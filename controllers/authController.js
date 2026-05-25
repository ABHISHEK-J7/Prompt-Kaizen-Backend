const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiry,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
} = require('../utils/otp');
const { sendOtpEmail } = require('../utils/mailer');
const { getDictationStatus } = require('../utils/dictation');

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sanitize = (user) => {
  const dictation = getDictationStatus(user);
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    dictation,
    createdAt: user.createdAt,
  };
};

/**
 * Generate a fresh OTP for `user`, persist its hash + expiry, and email the
 * plaintext code to the user's address. Resets the per-OTP attempt counter
 * so a new code starts with a clean slate.
 */
async function issueOtpForUser(user) {
  const otp = generateOtp();
  user.otpHash = await hashOtp(otp);
  user.otpExpiresAt = otpExpiry();
  user.otpAttempts = 0;
  await user.save();

  await sendOtpEmail({
    to: user.email,
    name: user.name,
    otp,
    ttlMinutes: OTP_TTL_MINUTES,
  });
}

const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    });

    try {
      await issueOtpForUser(user);
    } catch (mailErr) {
      console.error('register: failed to send OTP email:', mailErr?.message || mailErr);
      // Do not fail the whole registration — the user already exists and can
      // hit /api/auth/resend-otp to try again.
    }

    return res.status(201).json({
      message: 'Account created. Check your email for the verification code.',
      email: user.email,
      needsVerification: true,
      otpTtlMinutes: OTP_TTL_MINUTES,
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ message: 'Registration failed.' });
  }
};

const verifyOtpHandler = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+otpHash');
    if (!user) {
      return res.status(404).json({ message: 'No account found for this email.' });
    }

    if (user.emailVerified) {
      // Already verified — issue a fresh token so the client can proceed
      // without needing to log in again.
      const token = signToken(user);
      return res.json({ token, user: sanitize(user), alreadyVerified: true });
    }

    if (!user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({ message: 'No active verification code. Request a new one.' });
    }
    if (user.otpExpiresAt.getTime() < Date.now()) {
      // Expired — clear it so a fresh issue cycle starts cleanly.
      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpAttempts = 0;
      await user.save();
      return res.status(400).json({ message: 'Verification code expired. Request a new one.' });
    }
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      // Lock the code after too many wrong guesses.
      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpAttempts = 0;
      await user.save();
      return res.status(429).json({ message: 'Too many wrong attempts. Request a new code.' });
    }

    const ok = await verifyOtp(otp, user.otpHash);
    if (!ok) {
      user.otpAttempts += 1;
      await user.save();
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - user.otpAttempts);
      return res.status(400).json({
        message: remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
          : 'Too many wrong attempts. Request a new code.',
      });
    }

    user.emailVerified = true;
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();

    const token = signToken(user);
    return res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('verifyOtp error:', err);
    return res.status(500).json({ message: 'Verification failed.' });
  }
};

const resendOtpHandler = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      // Don't disclose whether the address exists; respond with a generic OK.
      return res.json({ message: 'If an account exists for that email, a code has been sent.' });
    }
    if (user.emailVerified) {
      return res.json({ message: 'This account is already verified — you can sign in.' });
    }
    try {
      await issueOtpForUser(user);
    } catch (mailErr) {
      console.error('resendOtp: send failed:', mailErr?.message || mailErr);
      return res.status(502).json({ message: 'Could not send the email. Please try again shortly.' });
    }
    return res.json({
      message: 'A new verification code has been sent to your email.',
      otpTtlMinutes: OTP_TTL_MINUTES,
    });
  } catch (err) {
    console.error('resendOtp error:', err);
    return res.status(500).json({ message: 'Could not resend the code.' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const match = await user.matchPassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Block login for users who never finished email verification. We send
    // a fresh OTP so they can complete the flow without re-registering.
    // Strict-equality false avoids retro-blocking legacy users (created
    // before this feature shipped — they have no `emailVerified` field, so
    // it reads undefined and is treated as verified).
    if (user.emailVerified === false) {
      try {
        await issueOtpForUser(user);
      } catch (mailErr) {
        console.error('login: failed to (re-)issue OTP:', mailErr?.message || mailErr);
      }
      return res.status(403).json({
        message: 'Please verify your email to continue. We just sent you a new code.',
        needsVerification: true,
        email: user.email,
        otpTtlMinutes: OTP_TTL_MINUTES,
      });
    }

    const token = signToken(user);
    return res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ message: 'Login failed.' });
  }
};

const me = async (req, res) => {
  return res.json({ user: sanitize(req.user) });
};

module.exports = {
  register,
  login,
  me,
  verifyOtp: verifyOtpHandler,
  resendOtp: resendOtpHandler,
};
