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

const answerSchema = new mongoose.Schema(
  {
    scenarioIndex: { type: Number, required: true },
    userPrompt: { type: String, default: '' },
    scores: { type: scoresSchema, default: () => ({}) },
    overallScore: { type: Number, default: 0 },
    rating: { type: String, default: '' },
    missingParameters: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    suggestions: { type: [String], default: [] },
    improvedPrompt: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * One per (contestId, userId). Created when a user starts a contest; finalised
 * when they submit. Average score across all answers is stored on the doc.
 */
const contestSubmissionSchema = new mongoose.Schema(
  {
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true, index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
    startedAt:   { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    answers: { type: [answerSchema], default: [] },
    averageScore: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['in_progress', 'submitted'],
      default: 'in_progress',
    },
  },
  { timestamps: true }
);

contestSubmissionSchema.index({ contestId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ContestSubmission', contestSubmissionSchema);
