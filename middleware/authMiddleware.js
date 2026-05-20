const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { istMidnightToday, istDayDiff } = require('../utils/dailyChallenge');

const MAX_FREEZES = 3;
const FREEZE_EARN_EVERY = 7; // earn one freeze every 7-day streak milestone

/**
 * Updates the user's daily-login streak and streak-freeze inventory. Called
 * once per authenticated request, but only writes when the IST calendar day
 * has actually changed — so each user incurs at most one write per IST day.
 *
 * Streak freezes are earned automatically: every time the streak crosses a
 * multiple of 7, one freeze is added (capped at MAX_FREEZES). If the user
 * misses exactly one day and has at least one freeze, the freeze is auto-spent
 * and the streak continues unbroken. Missing more than one day always resets.
 */
async function bumpDailyStreak(user) {
  const today = istMidnightToday();
  const last  = user.lastActiveDate ? new Date(user.lastActiveDate) : null;

  if (!last) {
    user.dailyStreak = 1;
    user.bestDailyStreak = Math.max(user.bestDailyStreak || 0, 1);
    user.lastActiveDate = today;
    await user.save();
    return;
  }

  const diff = istDayDiff(last, today);
  if (diff === null || diff <= 0) return; // already counted today (or clock skew)

  if (diff === 1) {
    user.dailyStreak = (user.dailyStreak || 0) + 1;
  } else if (diff === 2 && (user.streakFreezes || 0) > 0) {
    // Auto-spend one freeze to save the streak.
    user.streakFreezes -= 1;
    user.dailyStreak = (user.dailyStreak || 0) + 1;
  } else {
    user.dailyStreak = 1;
  }

  user.bestDailyStreak = Math.max(user.bestDailyStreak || 0, user.dailyStreak);

  // Earn a freeze every 7th day milestone (7, 14, 21, ...).
  if (user.dailyStreak > 0 && user.dailyStreak % FREEZE_EARN_EVERY === 0) {
    if ((user.streakFreezes || 0) < MAX_FREEZES) {
      user.streakFreezes = (user.streakFreezes || 0) + 1;
    }
  }

  user.lastActiveDate = today;
  await user.save();
}

const protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    req.user = user;
    bumpDailyStreak(user).catch((e) => console.error('streak update failed:', e.message));
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = { protect, MAX_FREEZES };
