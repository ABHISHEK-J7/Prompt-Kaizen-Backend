const PromptEvaluation = require('../models/PromptEvaluation');
const { evaluateBadges } = require('../utils/badges');
const { istMidnightToday, isSameIstDay } = require('../utils/dailyChallenge');

const stats = async (req, res) => {
  try {
    const userId = req.user._id;
    const items = await PromptEvaluation.find({ userId }).sort({ createdAt: 1 }).lean();

    const total = items.length;
    const scores = items.map((i) => i.overallScore || 0);
    const average = total ? Math.round((scores.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;
    const best   = total ? Math.max(...scores) : 0;
    const lowest = total ? Math.min(...scores) : 0;

    // Daily streak + freeze inventory maintained by authMiddleware.
    const dailyStreak     = req.user?.dailyStreak     || 0;
    const bestDailyStreak = req.user?.bestDailyStreak || 0;
    const streakFreezes   = req.user?.streakFreezes   || 0;

    // Daily challenge participation snapshot.
    const completedChallengeToday = isSameIstDay(req.user?.lastChallengeDate, istMidnightToday());
    const dailyChallengesCompleted = req.user?.dailyChallengesCompleted || 0;

    const categoryCount = {};
    for (const it of items) {
      categoryCount[it.category] = (categoryCount[it.category] || 0) + 1;
    }

    const parameterAverages = {
      clarity: 0, context: 0, roleAssignment: 0, taskDefinition: 0, inputParameters: 0,
      outputFormat: 0, constraints: 0, tone: 0, relevance: 0, grammarStructure: 0,
    };
    if (total) {
      for (const k of Object.keys(parameterAverages)) {
        const sum = items.reduce((acc, it) => acc + ((it.scores && it.scores[k]) || 0), 0);
        parameterAverages[k] = Math.round((sum / total) * 10) / 10;
      }
    }

    const trend = items.map((i) => ({
      date: i.createdAt, score: i.overallScore, category: i.category,
    }));

    const recent = items
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8)
      .map((i) => ({
        _id: i._id,
        category: i.category,
        scenario: i.scenario,
        overallScore: i.overallScore,
        rating: i.rating,
        createdAt: i.createdAt,
      }));

    return res.json({
      total,
      average,
      best,
      lowest,
      dailyStreak,
      bestDailyStreak,
      streakFreezes,
      completedChallengeToday,
      dailyChallengesCompleted,
      categoryCount,
      parameterAverages,
      trend,
      recent,
    });
  } catch (err) {
    console.error('dashboard stats error:', err);
    return res.status(500).json({ message: 'Failed to load dashboard stats.' });
  }
};

const badges = async (req, res) => {
  try {
    const userId = req.user._id;
    const items = await PromptEvaluation.find({ userId }, 'overallScore category').lean();

    const totalPrompts = items.length;
    const distinctCategories = new Set(items.map((i) => i.category)).size;
    const bestScore = items.length ? Math.max(...items.map((i) => i.overallScore || 0)) : 0;
    const bestDailyStreak = req.user?.bestDailyStreak || 0;
    const dailyChallengesCompleted = req.user?.dailyChallengesCompleted || 0;

    const list = evaluateBadges({
      totalPrompts,
      distinctCategories,
      bestScore,
      bestDailyStreak,
      dailyChallengesCompleted,
    });

    const earned = list.filter((b) => b.unlocked).length;
    return res.json({ total: list.length, earned, badges: list });
  } catch (err) {
    console.error('badges error:', err);
    return res.status(500).json({ message: 'Failed to load badges.' });
  }
};

/**
 * Last 7 UTC days summary, used for the Weekly Recap modal.
 */
const weeklyRecap = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = istMidnightToday();
    const since = new Date(today.getTime() - 6 * 86_400_000); // 7 IST-day window inclusive

    const items = await PromptEvaluation.find({
      userId,
      createdAt: { $gte: since },
    }).sort({ createdAt: 1 }).lean();

    const total = items.length;
    const scores = items.map((i) => i.overallScore || 0);
    const average = total ? Math.round((scores.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;
    const best = total ? Math.max(...scores) : 0;

    let topCategory = null;
    let topCount = 0;
    const catCount = {};
    for (const it of items) {
      catCount[it.category] = (catCount[it.category] || 0) + 1;
      if (catCount[it.category] > topCount) {
        topCount = catCount[it.category];
        topCategory = it.category;
      }
    }

    // Active days within the 7-day window.
    const dayKeys = new Set();
    for (const it of items) {
      const d = new Date(it.createdAt);
      dayKeys.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
    }

    // Improvement: latest score minus first score in the window.
    const improvement = total >= 2 ? scores[scores.length - 1] - scores[0] : 0;

    const topPrompt = items.length
      ? items.slice().sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))[0]
      : null;

    return res.json({
      windowStart: since,
      windowEnd: today,
      total,
      average,
      best,
      activeDays: dayKeys.size,
      improvement,
      topCategory,
      currentStreak: req.user?.dailyStreak || 0,
      streakFreezes: req.user?.streakFreezes || 0,
      topPrompt: topPrompt
        ? {
            _id: topPrompt._id,
            category: topPrompt.category,
            scenario: topPrompt.scenario,
            overallScore: topPrompt.overallScore,
            rating: topPrompt.rating,
            createdAt: topPrompt.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error('weeklyRecap error:', err);
    return res.status(500).json({ message: 'Failed to load weekly recap.' });
  }
};

module.exports = { stats, badges, weeklyRecap };
