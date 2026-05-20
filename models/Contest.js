const mongoose = require('mongoose');

/**
 * A scheduled "contest" (weekly test). Admin creates it with a date, a list
 * of 4–5 scenarios, and an allow-list of user email addresses. On the
 * scheduled IST day each allowed user can take the contest once.
 */
const scenarioSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    expectedOutputFormat: { type: String, required: true },
    scenario: { type: String, required: true },
  },
  { _id: false }
);

const contestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    // The IST date on which this contest is live. Stored as the UTC instant of
    // the IST day's midnight. Eligibility checks compare against today's IST day.
    scheduledDate: { type: Date, required: true, index: true },
    // Exact time window during which the contest can be taken. Both are stored
    // as UTC instants computed from the admin-supplied IST date + HH:MM times.
    // Optional for backward compatibility with older contests that pre-date
    // this field — those fall back to "anywhere on the scheduled IST day".
    startsAt: { type: Date, default: null, index: true },
    endsAt:   { type: Date, default: null, index: true },
    durationMinutes: { type: Number, default: 60, min: 5, max: 480 },
    scenarios: {
      type: [scenarioSchema],
      validate: [
        (arr) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 10,
        'A contest must have between 1 and 10 scenarios.',
      ],
    },
    // Lowercased email allowlist. Empty array = nobody (admin must upload one).
    allowedEmails: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['draft', 'published', 'closed'],
      default: 'draft',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contest', contestSchema);
