/**
 * Daily Challenge — deterministic, identical-for-all-users selection of a
 * (category, scenario) pair based on the current IST calendar date.
 *
 * The day boundary is IST midnight (00:00 UTC+5:30), so a new challenge drops
 * at the same wall-clock instant every day for everyone, irrespective of where
 * the user lives. We also export small helpers for IST-aware date comparison
 * which the auth middleware uses for daily-streak bookkeeping.
 */
const { SCENARIO_BANK, listCategories } = require('./scenarioBank');

const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30

/**
 * Combine an IST date (YYYY-MM-DD) and a time-of-day (HH:MM) into a UTC Date
 * instant. Returns null on invalid input.
 */
function istDateTimeToUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const dm = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]) - 1;
  const d = Number(dm[3]);
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  if ([y, mo, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  const istMidnightUtc = Date.UTC(y, mo, d, 0, 0, 0, 0) - IST_OFFSET_MS;
  return new Date(istMidnightUtc + (hh * 60 + mm) * 60_000);
}

/**
 * Returns the calendar date in IST as a 'YYYY-MM-DD' string. Pass any Date
 * (or omit to use now) — the value of the IST calendar at that UTC instant.
 */
function istDayKey(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns a JS Date representing the UTC instant at which "today's IST day"
 * started (i.e. the most recent IST midnight ≤ now).
 */
function istMidnightToday() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const startSeenAsUtc = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    0, 0, 0, 0,
  );
  return new Date(startSeenAsUtc - IST_OFFSET_MS);
}

/** True iff `a` and `b` fall on the same IST calendar day. */
function isSameIstDay(a, b) {
  if (!a || !b) return false;
  return istDayKey(new Date(a)) === istDayKey(new Date(b));
}

/**
 * Number of whole IST days between two timestamps (positive when b > a).
 * Returns null when either side is missing.
 */
function istDayDiff(a, b) {
  if (!a || !b) return null;
  const aDate = new Date(`${istDayKey(new Date(a))}T00:00:00Z`);
  const bDate = new Date(`${istDayKey(new Date(b))}T00:00:00Z`);
  return Math.round((bDate.getTime() - aDate.getTime()) / 86_400_000);
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

function getDailyChallenge(dateKey = istDayKey()) {
  const categories = listCategories();
  const seed = fnv1a(dateKey);
  const category = categories[seed % categories.length];
  const list = SCENARIO_BANK[category] || [];
  const scenario = list[(seed >>> 5) % list.length] || '';
  return { date: dateKey, category, scenario };
}

module.exports = {
  getDailyChallenge,
  istDayKey,
  istMidnightToday,
  isSameIstDay,
  istDayDiff,
  istDateTimeToUtc,
};
