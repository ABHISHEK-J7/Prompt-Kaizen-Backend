const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // `email` doubles as the login identifier. It accepts real email
    // addresses for normal users AND simple usernames (e.g. "admin") for
    // operator-seeded accounts. Stored lowercased + trimmed for uniqueness.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Daily login streak — bumped by authMiddleware on the first authenticated
    // request of each new UTC day. `dailyStreak` counts consecutive days
    // (today inclusive). Missing a day resets it to 1 the next time the user
    // returns. `bestDailyStreak` is the all-time peak.
    dailyStreak:     { type: Number, default: 0 },
    bestDailyStreak: { type: Number, default: 0 },
    lastActiveDate:  { type: Date,   default: null },

    // Streak freezes — earned automatically every 7th day of an unbroken
    // streak (cap = 3 in storage). If the user misses a single day with at
    // least one freeze available, one is auto-spent and the streak continues.
    streakFreezes:   { type: Number, default: 0 },

    // Daily Challenge participation tracking.
    lastChallengeDate:        { type: Date,   default: null },
    dailyChallengesCompleted: { type: Number, default: 0 },

    // Voice dictation quota — capped per IST day. Counter only ticks when an
    // `/analyze` request actually arrives with `usedDictation: true` (so a
    // user who taps the mic but never submits doesn't burn a use).
    dictationsUsedToday: { type: Number, default: 0 },
    dictationUsedDate:   { type: Date,   default: null },

    // Email verification via one-time password (OTP).
    // - `emailVerified` flips true after a successful verify-otp call.
    // - `otpHash` is a bcrypt hash of the 6-digit code (never the plaintext).
    // - `otpExpiresAt` is the wall-clock expiry; verification fails after it.
    // - `otpAttempts` counts wrong tries against a single OTP; we invalidate
    //   the OTP after 5 wrong attempts so a single code can't be brute-forced.
    emailVerified: { type: Boolean, default: false },
    otpHash:       { type: String, select: false, default: null },
    otpExpiresAt:  { type: Date, default: null },
    otpAttempts:   { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otpHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
