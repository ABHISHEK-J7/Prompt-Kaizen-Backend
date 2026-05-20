const mongoose = require('mongoose');

const scoresSchema = new mongoose.Schema(
  {
    clarity: { type: Number, default: 0 },
    context: { type: Number, default: 0 },
    roleAssignment: { type: Number, default: 0 },
    taskDefinition: { type: Number, default: 0 },
    inputParameters: { type: Number, default: 0 },
    outputFormat: { type: Number, default: 0 },
    constraints: { type: Number, default: 0 },
    tone: { type: Number, default: 0 },
    relevance: { type: Number, default: 0 },
    grammarStructure: { type: Number, default: 0 },
  },
  { _id: false }
);

const promptEvaluationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, required: true },
    scenario: { type: String, required: true },
    userPrompt: { type: String, required: true },
    expectedOutputFormat: { type: String, default: '' },
    tone: { type: String, default: '' },
    targetAudience: { type: String, default: '' },
    additionalRequirements: { type: String, default: '' },
    scores: { type: scoresSchema, default: () => ({}) },
    overallScore: { type: Number, default: 0 },
    rating: { type: String, default: '' },
    missingParameters: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    suggestions: { type: [String], default: [] },
    improvedPrompt: { type: String, default: '' },

    // Marks an evaluation submitted as part of the Daily Challenge flow.
    isDailyChallenge: { type: Boolean, default: false, index: true },
    challengeDate:    { type: Date,    default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('PromptEvaluation', promptEvaluationSchema);
