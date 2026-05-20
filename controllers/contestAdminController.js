const Contest = require('../models/Contest');
const ContestSubmission = require('../models/ContestSubmission');
const User = require('../models/User');
const { parseEmailsFromBuffer } = require('../utils/parseEmails');
const { ALLOWED_CATEGORIES } = require('./promptController');
const { istDateTimeToUtc } = require('../utils/dailyChallenge');

/**
 * Stores `scheduledDate` as the UTC instant of midnight on the chosen IST day,
 * regardless of what time component the admin's payload included.
 */
function toIstMidnight(input) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  // Shift to IST so we can read the IST date components, then reconstruct
  // midnight IST as a UTC instant.
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const day = ist.getUTCDate();
  return new Date(Date.UTC(y, m, day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * Resolves the time-window for a contest from the admin's payload.
 * Returns `{ startsAt, endsAt, dateStr }` or `{ error }`.
 *
 * Accepts EITHER:
 *  - `scheduledDate` (YYYY-MM-DD) + `startTime` (HH:MM) + `endTime` (HH:MM), or
 *  - `scheduledDate` alone (legacy — the window defaults to the whole IST day).
 */
function resolveWindow({ scheduledDate, startTime, endTime }) {
  if (!scheduledDate) return { error: 'A scheduled date is required.' };
  const dateStr = String(scheduledDate).slice(0, 10); // tolerate ISO inputs
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: 'scheduledDate must be a YYYY-MM-DD string.' };
  }

  // If start/end provided, compute precise instants.
  if (startTime || endTime) {
    if (!startTime || !endTime) {
      return { error: 'Both start time and end time are required when one is provided.' };
    }
    const startsAt = istDateTimeToUtc(dateStr, startTime);
    const endsAt   = istDateTimeToUtc(dateStr, endTime);
    if (!startsAt || !endsAt) return { error: 'Invalid start or end time format (HH:MM).' };
    if (endsAt.getTime() <= startsAt.getTime()) {
      return { error: 'End time must be after start time.' };
    }
    return { startsAt, endsAt, dateStr };
  }

  // Legacy: full IST day window.
  const startsAt = istDateTimeToUtc(dateStr, '00:00');
  const endsAt   = istDateTimeToUtc(dateStr, '23:59');
  return { startsAt, endsAt, dateStr };
}

function validateScenarios(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return 'At least one scenario is required.';
  }
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i] || {};
    if (!s.category || !ALLOWED_CATEGORIES.includes(s.category))
      return `Scenario ${i + 1}: invalid category.`;
    if (!s.expectedOutputFormat || typeof s.expectedOutputFormat !== 'string')
      return `Scenario ${i + 1}: expectedOutputFormat is required.`;
    if (!s.scenario || String(s.scenario).trim().length < 10)
      return `Scenario ${i + 1}: scenario text must be at least 10 characters.`;
  }
  return null;
}

const listContests = async (req, res) => {
  try {
    const items = await Contest.find()
      .sort({ scheduledDate: -1, createdAt: -1 })
      .lean();
    // Attach submission counts in a single round-trip.
    const ids = items.map((c) => c._id);
    const counts = await ContestSubmission.aggregate([
      { $match: { contestId: { $in: ids } } },
      {
        $group: {
          _id: '$contestId',
          total: { $sum: 1 },
          submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          scoreSum:  { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, '$averageScore', 0] } },
        },
      },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));
    const out = items.map((c) => {
      const cnt = countMap.get(String(c._id)) || { total: 0, submitted: 0, scoreSum: 0 };
      const avgScore = cnt.submitted > 0
        ? Math.round((cnt.scoreSum / cnt.submitted) * 10) / 10
        : 0;
      return {
        ...c,
        submissionCount: cnt.total,
        submittedCount: cnt.submitted,
        avgScore,
        scenariosCount: (c.scenarios || []).length,
        allowedCount: (c.allowedEmails || []).length,
      };
    });
    return res.json({ contests: out });
  } catch (err) {
    console.error('listContests error:', err);
    return res.status(500).json({ message: 'Failed to load contests.' });
  }
};

const createContest = async (req, res) => {
  try {
    const { title, description, scheduledDate, startTime, endTime, durationMinutes, scenarios } = req.body;
    if (!title || !title.trim())
      return res.status(400).json({ message: 'Title is required.' });

    const window = resolveWindow({ scheduledDate, startTime, endTime });
    if (window.error) return res.status(400).json({ message: window.error });

    const scenarioErr = validateScenarios(scenarios);
    if (scenarioErr) return res.status(400).json({ message: scenarioErr });

    const istMidnight = toIstMidnight(window.dateStr);
    const contest = await Contest.create({
      title: title.trim(),
      description: (description || '').trim(),
      scheduledDate: istMidnight,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      durationMinutes: durationMinutes || 60,
      scenarios,
      allowedEmails: [],
      status: 'draft',
      createdBy: req.user._id,
    });
    return res.status(201).json({ contest });
  } catch (err) {
    console.error('createContest error:', err);
    return res.status(500).json({ message: 'Failed to create contest.' });
  }
};

const updateContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (contest.status === 'closed')
      return res.status(409).json({ message: 'Closed contests cannot be edited.' });

    const { title, description, scheduledDate, startTime, endTime, durationMinutes, scenarios } = req.body;
    if (title !== undefined) contest.title = String(title).trim();
    if (description !== undefined) contest.description = String(description).trim();
    if (scheduledDate !== undefined || startTime !== undefined || endTime !== undefined) {
      const window = resolveWindow({
        scheduledDate: scheduledDate ?? (contest.scheduledDate
          ? new Date(contest.scheduledDate).toISOString().slice(0, 10)
          : null),
        startTime,
        endTime,
      });
      if (window.error) return res.status(400).json({ message: window.error });
      contest.scheduledDate = toIstMidnight(window.dateStr);
      contest.startsAt = window.startsAt;
      contest.endsAt = window.endsAt;
    }
    if (durationMinutes !== undefined) contest.durationMinutes = durationMinutes;
    if (scenarios !== undefined) {
      const err = validateScenarios(scenarios);
      if (err) return res.status(400).json({ message: err });
      contest.scenarios = scenarios;
    }
    await contest.save();
    return res.json({ contest });
  } catch (err) {
    console.error('updateContest error:', err);
    return res.status(500).json({ message: 'Failed to update contest.' });
  }
};

const deleteContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    await ContestSubmission.deleteMany({ contestId: contest._id });
    await contest.deleteOne();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('deleteContest error:', err);
    return res.status(500).json({ message: 'Failed to delete contest.' });
  }
};

const uploadAllowedEmails = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });

    const { emails, skipped } = parseEmailsFromBuffer(req.file.buffer);

    const mode = (req.body.mode || 'replace').toLowerCase(); // 'replace' or 'append'
    if (mode === 'append') {
      const existing = new Set(contest.allowedEmails || []);
      for (const e of emails) existing.add(e);
      contest.allowedEmails = Array.from(existing);
    } else {
      contest.allowedEmails = emails;
    }
    await contest.save();
    return res.json({
      contest,
      parsed: emails.length,
      skipped,
      total: contest.allowedEmails.length,
    });
  } catch (err) {
    console.error('uploadAllowedEmails error:', err);
    return res.status(500).json({ message: 'Failed to parse the uploaded file.' });
  }
};

const publishContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (!contest.allowedEmails || contest.allowedEmails.length === 0)
      return res.status(400).json({ message: 'Upload an allowlist before publishing.' });
    if (!contest.scenarios || contest.scenarios.length === 0)
      return res.status(400).json({ message: 'Add at least one scenario before publishing.' });
    contest.status = 'published';
    await contest.save();
    return res.json({ contest });
  } catch (err) {
    console.error('publishContest error:', err);
    return res.status(500).json({ message: 'Failed to publish contest.' });
  }
};

const closeContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    contest.status = 'closed';
    await contest.save();
    return res.json({ contest });
  } catch (err) {
    console.error('closeContest error:', err);
    return res.status(500).json({ message: 'Failed to close contest.' });
  }
};

const getContestDetail = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id).lean();
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    const submissions = await ContestSubmission.find({ contestId: contest._id })
      .populate('userId', 'name email')
      .sort({ averageScore: -1, submittedAt: -1 })
      .lean();
    return res.json({ contest, submissions });
  } catch (err) {
    console.error('getContestDetail error:', err);
    return res.status(500).json({ message: 'Failed to load contest.' });
  }
};

module.exports = {
  listContests,
  createContest,
  updateContest,
  deleteContest,
  uploadAllowedEmails,
  publishContest,
  closeContest,
  getContestDetail,
};
