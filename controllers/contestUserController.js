const Contest = require('../models/Contest');
const ContestSubmission = require('../models/ContestSubmission');
const { analyzePrompt } = require('../utils/promptAnalyzer');
const { generateImprovedPrompt } = require('../utils/generateImprovedPrompt');
const { istDayKey, isSameIstDay } = require('../utils/dailyChallenge');

function userEmail(req) {
  return (req.user?.email || '').toLowerCase().trim();
}

function isEligibleFor(contest, email) {
  if (!contest) return false;
  if (contest.status !== 'published') return false;
  if (!Array.isArray(contest.allowedEmails)) return false;
  return contest.allowedEmails.includes(email);
}

/**
 * True when *right now* falls inside the contest's window. If startsAt/endsAt
 * aren't set (older contests), falls back to "any time on the IST day".
 */
function isLiveNow(contest, now = new Date()) {
  if (contest.startsAt && contest.endsAt) {
    const t = now.getTime();
    return t >= new Date(contest.startsAt).getTime() && t <= new Date(contest.endsAt).getTime();
  }
  return isSameIstDay(contest.scheduledDate, now);
}

/**
 * Lists contests visible to the calling user, in three buckets:
 *   - live: scheduled for today and published
 *   - upcoming: scheduled in the future and published
 *   - past: scheduled in the past OR explicitly closed
 * Only contests whose allow-list includes the caller's email are returned.
 */
const listAvailable = async (req, res) => {
  try {
    const email = userEmail(req);
    const contests = await Contest.find({
      allowedEmails: email,
      status: { $in: ['published', 'closed'] },
    })
      .sort({ scheduledDate: -1 })
      .lean();

    const mySubs = await ContestSubmission.find({ userId: req.user._id }).lean();
    const subBy = new Map(mySubs.map((s) => [String(s.contestId), s]));

    const now = new Date();
    const out = contests.map((c) => {
      const startsAt = c.startsAt ? new Date(c.startsAt) : null;
      const endsAt   = c.endsAt   ? new Date(c.endsAt)   : null;
      const live = c.status === 'published' && isLiveNow(c, now);
      const upcoming = c.status === 'published' && !!startsAt && startsAt.getTime() > now.getTime();
      const past = !live && !upcoming;
      const sub = subBy.get(String(c._id));
      return {
        _id: c._id,
        title: c.title,
        description: c.description,
        scheduledDate: c.scheduledDate,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        durationMinutes: c.durationMinutes,
        status: c.status,
        scenariosCount: (c.scenarios || []).length,
        live, upcoming, past,
        mySubmission: sub
          ? {
              _id: sub._id,
              status: sub.status,
              averageScore: sub.averageScore,
              submittedAt: sub.submittedAt,
            }
          : null,
      };
    });
    return res.json({ contests: out });
  } catch (err) {
    console.error('listAvailable error:', err);
    return res.status(500).json({ message: 'Failed to load contests.' });
  }
};

const getContestForUser = async (req, res) => {
  try {
    const email = userEmail(req);
    const contest = await Contest.findById(req.params.id).lean();
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (!isEligibleFor(contest, email))
      return res.status(403).json({ message: 'You are not eligible for this contest.' });

    const mySubmission = await ContestSubmission.findOne({
      contestId: contest._id,
      userId: req.user._id,
    }).lean();

    return res.json({
      contest: {
        _id: contest._id,
        title: contest.title,
        description: contest.description,
        scheduledDate: contest.scheduledDate,
        startsAt: contest.startsAt,
        endsAt: contest.endsAt,
        durationMinutes: contest.durationMinutes,
        scenarios: contest.scenarios,
        status: contest.status,
      },
      live: isLiveNow(contest),
      mySubmission,
    });
  } catch (err) {
    console.error('getContestForUser error:', err);
    return res.status(500).json({ message: 'Failed to load contest.' });
  }
};

const startContest = async (req, res) => {
  try {
    const email = userEmail(req);
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (!isEligibleFor(contest, email))
      return res.status(403).json({ message: 'You are not eligible for this contest.' });
    if (!isLiveNow(contest))
      return res.status(409).json({ message: 'This contest is not open right now. Check the start and end times.' });

    let sub = await ContestSubmission.findOne({
      contestId: contest._id,
      userId: req.user._id,
    });
    if (sub && sub.status === 'submitted')
      return res.status(409).json({ message: 'You have already submitted this contest.' });

    if (!sub) {
      sub = await ContestSubmission.create({
        contestId: contest._id,
        userId: req.user._id,
        startedAt: new Date(),
        answers: [],
        status: 'in_progress',
      });
    }
    return res.json({ submission: sub });
  } catch (err) {
    console.error('startContest error:', err);
    return res.status(500).json({ message: 'Failed to start contest.' });
  }
};

/**
 * Final submit: body { answers: [{ scenarioIndex, userPrompt }, ...] }
 * The server re-validates every answer and scores via the rule-based analyzer.
 */
const submitContest = async (req, res) => {
  try {
    const email = userEmail(req);
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (!isEligibleFor(contest, email))
      return res.status(403).json({ message: 'You are not eligible for this contest.' });
    if (!isLiveNow(contest))
      return res.status(409).json({ message: 'This contest window has not started or has already ended.' });

    const existing = await ContestSubmission.findOne({
      contestId: contest._id,
      userId: req.user._id,
    });
    if (existing && existing.status === 'submitted')
      return res.status(409).json({ message: 'You have already submitted this contest.' });

    const submitted = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const answers = [];
    for (let i = 0; i < contest.scenarios.length; i++) {
      const provided = submitted.find((a) => Number(a?.scenarioIndex) === i) || {};
      const userPrompt = String(provided.userPrompt || '').trim();
      const sc = contest.scenarios[i];

      // Allow short / empty answers but score them as such (0).
      let analysis = {
        scores: {}, overallScore: 0, rating: 'Poor Prompt',
        missingParameters: ['Empty prompt'], strengths: [], weaknesses: ['No prompt submitted.'],
        suggestions: ['Provide a complete prompt next time.'],
      };
      let improvedPrompt = '';
      if (userPrompt.length >= 5) {
        analysis = analyzePrompt({
          category: sc.category,
          scenario: sc.scenario,
          userPrompt,
          expectedOutputFormat: sc.expectedOutputFormat,
        });
        improvedPrompt = generateImprovedPrompt({
          category: sc.category,
          scenario: sc.scenario,
          expectedOutputFormat: sc.expectedOutputFormat,
        });
      }

      answers.push({
        scenarioIndex: i,
        userPrompt,
        scores: analysis.scores,
        overallScore: analysis.overallScore,
        rating: analysis.rating,
        missingParameters: analysis.missingParameters,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        suggestions: analysis.suggestions,
        improvedPrompt,
      });
    }

    const totalScore = answers.reduce((a, b) => a + (b.overallScore || 0), 0);
    const averageScore = answers.length
      ? Math.round((totalScore / answers.length) * 10) / 10
      : 0;

    const sub =
      existing ||
      new ContestSubmission({
        contestId: contest._id,
        userId: req.user._id,
        startedAt: new Date(),
      });
    sub.answers = answers;
    sub.averageScore = averageScore;
    sub.status = 'submitted';
    sub.submittedAt = new Date();
    await sub.save();

    return res.json({ submission: sub });
  } catch (err) {
    console.error('submitContest error:', err);
    return res.status(500).json({ message: 'Failed to submit contest.' });
  }
};

/**
 * Returns the user's own result for a contest (only after submission).
 */
const getMyResult = async (req, res) => {
  try {
    const sub = await ContestSubmission.findOne({
      contestId: req.params.id,
      userId: req.user._id,
    }).lean();
    if (!sub) return res.status(404).json({ message: 'No submission found.' });
    const contest = await Contest.findById(req.params.id).lean();
    return res.json({ submission: sub, contest });
  } catch (err) {
    console.error('getMyResult error:', err);
    return res.status(500).json({ message: 'Failed to load result.' });
  }
};

/** A user is allowed to view a contest's leaderboard if they're on its
 *  allowlist — regardless of contest status (so they can also see results
 *  for closed contests). */
function isOnAllowlist(contest, email) {
  if (!contest || !Array.isArray(contest.allowedEmails)) return false;
  return contest.allowedEmails.includes(email);
}

/**
 * Leaderboard for a SPECIFIC contest. Only that contest's submissions are
 * ranked. Primary sort: per-contest accuracy. Tiebreaker: faster submission.
 */
const getContestLeaderboard = async (req, res) => {
  try {
    const ContestSubmission = require('../models/ContestSubmission');
    const email = userEmail(req);
    const contest = await Contest.findById(req.params.id).lean();
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (!isOnAllowlist(contest, email)) {
      return res.status(403).json({ message: 'You are not eligible for this contest.' });
    }

    const rows = await ContestSubmission.aggregate([
      {
        $match: {
          contestId: contest._id,
          status: 'submitted',
          submittedAt: { $ne: null },
          startedAt: { $ne: null },
        },
      },
      {
        $project: {
          userId: 1,
          averageScore: 1,
          submittedAt: 1,
          timeMs: { $max: [0, { $subtract: ['$submittedAt', '$startedAt'] }] },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: 1,
          name: '$user.name',
          email: '$user.email',
          score: '$averageScore',
          timeMs: 1,
          submittedAt: 1,
        },
      },
      { $sort: { score: -1, timeMs: 1 } },
    ]);

    const callerId = String(req.user?._id || '');
    const ranked = rows.map((r, i) => ({
      ...r,
      rank: i + 1,
      isMe: String(r.userId) === callerId,
    }));

    return res.json({
      contest: {
        _id: contest._id,
        title: contest.title,
        description: contest.description,
        scheduledDate: contest.scheduledDate,
        startsAt: contest.startsAt,
        endsAt: contest.endsAt,
        scenariosCount: (contest.scenarios || []).length,
        allowedCount: (contest.allowedEmails || []).length,
        status: contest.status,
      },
      leaderboard: ranked,
      total: ranked.length,
    });
  } catch (err) {
    console.error('getContestLeaderboard error:', err);
    return res.status(500).json({ message: 'Failed to load contest leaderboard.' });
  }
};

/**
 * Global contest leaderboard. Ranks every user who has at least one submitted
 * contest. Primary sort: average accuracy (overallScore averaged across all
 * their submitted contests). Tie-breaker: average time-to-submit (lower wins).
 *
 * Returned rows include the caller's flag (`isMe`) so the UI can highlight
 * the current user's row.
 */
const leaderboard = async (req, res) => {
  try {
    const ContestSubmission = require('../models/ContestSubmission');

    const rows = await ContestSubmission.aggregate([
      { $match: { status: 'submitted', submittedAt: { $ne: null }, startedAt: { $ne: null } } },
      {
        $project: {
          userId: 1,
          averageScore: 1,
          // Clamp negative durations (would only happen with clock drift).
          timeMs: {
            $max: [
              0,
              { $subtract: ['$submittedAt', '$startedAt'] },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$userId',
          contests:    { $sum: 1 },
          avgScore:    { $avg: '$averageScore' },
          bestScore:   { $max: '$averageScore' },
          avgTimeMs:   { $avg: '$timeMs' },
          totalTimeMs: { $sum: '$timeMs' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId:      '$_id',
          name:        '$user.name',
          email:       '$user.email',
          contests:    1,
          avgScore:    { $round: ['$avgScore', 1] },
          bestScore:   1,
          avgTimeMs:   { $round: ['$avgTimeMs', 0] },
          totalTimeMs: { $round: ['$totalTimeMs', 0] },
        },
      },
      // Primary: highest avg score. Tiebreaker: lowest avg submit time.
      { $sort: { avgScore: -1, avgTimeMs: 1 } },
    ]);

    const callerId = String(req.user?._id || '');
    const ranked = rows.map((r, i) => ({
      ...r,
      rank: i + 1,
      isMe: String(r.userId) === callerId,
    }));

    return res.json({ leaderboard: ranked, total: ranked.length });
  } catch (err) {
    console.error('leaderboard error:', err);
    return res.status(500).json({ message: 'Failed to load leaderboard.' });
  }
};

module.exports = {
  listAvailable,
  getContestForUser,
  startContest,
  submitContest,
  getMyResult,
  leaderboard,
  getContestLeaderboard,
};
