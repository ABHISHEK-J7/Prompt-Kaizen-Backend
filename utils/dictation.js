const { istMidnightToday, isSameIstDay } = require('./dailyChallenge');

const DICTATION_DAILY_LIMIT = Number(process.env.DICTATION_DAILY_LIMIT) || 3;

/**
 * Returns the user's effective dictation usage for the current IST day, with
 * the per-day counter reset if their last use was on a previous day. The
 * caller is responsible for persisting any mutations (consumeDictation does).
 *
 * { limit, usedToday, remainingToday }
 */
function getDictationStatus(user) {
  const today = istMidnightToday();
  const sameDay = isSameIstDay(user?.dictationUsedDate, today);
  const usedToday = sameDay ? (user?.dictationsUsedToday || 0) : 0;
  return {
    limit: DICTATION_DAILY_LIMIT,
    usedToday,
    remainingToday: Math.max(0, DICTATION_DAILY_LIMIT - usedToday),
  };
}

/**
 * Increment the user's dictation counter for today and return the new
 * status. Does NOT save the user document — the caller decides when to
 * persist (typically right after a successful analyze).
 *
 * Throws an Error tagged `code = 'DICTATION_LIMIT_REACHED'` if the user is
 * already at the cap so the controller can return a 429.
 */
function consumeDictation(user) {
  const today = istMidnightToday();
  const sameDay = isSameIstDay(user?.dictationUsedDate, today);

  const usedBefore = sameDay ? (user.dictationsUsedToday || 0) : 0;
  if (usedBefore >= DICTATION_DAILY_LIMIT) {
    const err = new Error(
      `Your daily limit of ${DICTATION_DAILY_LIMIT} dictations has been exhausted. Try again tomorrow.`
    );
    err.code = 'DICTATION_LIMIT_REACHED';
    throw err;
  }

  user.dictationsUsedToday = usedBefore + 1;
  user.dictationUsedDate = today;

  return {
    limit: DICTATION_DAILY_LIMIT,
    usedToday: user.dictationsUsedToday,
    remainingToday: Math.max(0, DICTATION_DAILY_LIMIT - user.dictationsUsedToday),
  };
}

module.exports = {
  DICTATION_DAILY_LIMIT,
  getDictationStatus,
  consumeDictation,
};
