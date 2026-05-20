/**
 * Badge catalog + evaluator.
 *
 * Badges are computed deterministically from existing data (no persistence
 * needed) so users can never "lose" an earned badge accidentally and the
 * catalog can evolve without migrations.
 *
 * Each badge declares:
 *   id          – stable identifier
 *   name        – display name
 *   description – short blurb shown in tooltip / unlock card
 *   icon        – lucide icon name (frontend maps this to a component)
 *   tier        – 'bronze' | 'silver' | 'gold'  (purely visual)
 *   evaluate(s) – returns { unlocked, progress: { current, target } }
 */

const BADGES = [
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Analyzed your very first prompt.',
    icon: 'Sparkles',
    tier: 'bronze',
    evaluate: (s) => unlockedAt(s.totalPrompts, 1),
  },
  {
    id: 'wordsmith',
    name: 'Wordsmith',
    description: 'Explored 5 different prompt categories.',
    icon: 'Layers',
    tier: 'bronze',
    evaluate: (s) => unlockedAt(s.distinctCategories, 5),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Explored 10 different prompt categories.',
    icon: 'Compass',
    tier: 'silver',
    evaluate: (s) => unlockedAt(s.distinctCategories, 10),
  },
  {
    id: 'polished',
    name: 'Polished',
    description: 'Earned 80+ on a single prompt.',
    icon: 'Award',
    tier: 'bronze',
    evaluate: (s) => unlockedAt(s.bestScore, 80),
  },
  {
    id: 'excellence',
    name: 'Excellence',
    description: 'Earned 90+ on a single prompt.',
    icon: 'Trophy',
    tier: 'silver',
    evaluate: (s) => unlockedAt(s.bestScore, 90),
  },
  {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Earned a perfect 100 on a single prompt.',
    icon: 'Crown',
    tier: 'gold',
    evaluate: (s) => unlockedAt(s.bestScore, 100),
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Analyzed 25 prompts.',
    icon: 'ShieldCheck',
    tier: 'silver',
    evaluate: (s) => unlockedAt(s.totalPrompts, 25),
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Analyzed 100 prompts.',
    icon: 'Medal',
    tier: 'gold',
    evaluate: (s) => unlockedAt(s.totalPrompts, 100),
  },
  {
    id: 'week-warrior',
    name: 'Week Warrior',
    description: 'Maintained a 7-day login streak.',
    icon: 'Flame',
    tier: 'silver',
    evaluate: (s) => unlockedAt(s.bestDailyStreak, 7),
  },
  {
    id: 'month-master',
    name: 'Month Master',
    description: 'Maintained a 30-day login streak.',
    icon: 'Star',
    tier: 'gold',
    evaluate: (s) => unlockedAt(s.bestDailyStreak, 30),
  },
  {
    id: 'daily-devotee',
    name: 'Daily Devotee',
    description: 'Completed 5 Daily Challenges.',
    icon: 'Calendar',
    tier: 'silver',
    evaluate: (s) => unlockedAt(s.dailyChallengesCompleted, 5),
  },
  {
    id: 'trailblazer',
    name: 'Trailblazer',
    description: 'Completed 30 Daily Challenges.',
    icon: 'Zap',
    tier: 'gold',
    evaluate: (s) => unlockedAt(s.dailyChallengesCompleted, 30),
  },
];

function unlockedAt(current, target) {
  const cur = Math.max(0, Number(current) || 0);
  return {
    unlocked: cur >= target,
    progress: { current: Math.min(cur, target), target },
  };
}

/**
 * Computes badge state for a given stats snapshot.
 * @param {object} stats { totalPrompts, distinctCategories, bestScore, bestDailyStreak, dailyChallengesCompleted }
 */
function evaluateBadges(stats) {
  return BADGES.map((b) => {
    const { unlocked, progress } = b.evaluate(stats);
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      tier: b.tier,
      unlocked,
      progress,
    };
  });
}

module.exports = { BADGES, evaluateBadges };
