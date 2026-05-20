const User = require('../models/User');
const PromptEvaluation = require('../models/PromptEvaluation');

const stats = async (req, res) => {
  try {
    const [totalUsers, totalPrompts, all] = await Promise.all([
      User.countDocuments(),
      PromptEvaluation.countDocuments(),
      PromptEvaluation.find({}, 'overallScore category createdAt').lean(),
    ]);

    const averagePlatformScore = all.length
      ? Math.round((all.reduce((a, b) => a + (b.overallScore || 0), 0) / all.length) * 10) / 10
      : 0;

    const categoryCount = {};
    for (const it of all) {
      categoryCount[it.category] = (categoryCount[it.category] || 0) + 1;
    }

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .select('-password')
      .lean();

    const recentPrompts = await PromptEvaluation.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email')
      .lean();

    return res.json({
      totalUsers,
      totalPrompts,
      averagePlatformScore,
      categoryCount,
      recentUsers,
      recentPrompts,
    });
  } catch (err) {
    console.error('admin stats error:', err);
    return res.status(500).json({ message: 'Failed to load admin stats.' });
  }
};

const listUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select('-password').lean();
    return res.json({ users });
  } catch (err) {
    console.error('admin listUsers error:', err);
    return res.status(500).json({ message: 'Failed to list users.' });
  }
};

const listPrompts = async (req, res) => {
  try {
    const prompts = await PromptEvaluation.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .lean();
    return res.json({ prompts });
  } catch (err) {
    console.error('admin listPrompts error:', err);
    return res.status(500).json({ message: 'Failed to list prompts.' });
  }
};

module.exports = { stats, listUsers, listPrompts };
