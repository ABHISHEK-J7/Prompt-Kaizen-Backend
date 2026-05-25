/**
 * Rule-based Prompt Analyzer.
 *
 * Evaluates a user's prompt against a real-world scenario across 10 parameters,
 * producing per-parameter scores, an overall score (out of 100), a rating,
 * strengths/weaknesses, missing parameters and suggestions.
 *
 * Designed so it can later be augmented by an LLM (OpenAI/Gemini/Claude).
 */

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','of','for','to','in','on','at','by','with',
  'is','are','was','were','be','been','being','it','its','this','that','these','those',
  'as','from','i','you','he','she','we','they','my','your','our','their','me','us',
  'so','do','does','did','have','has','had','will','would','can','could','should',
  'about','into','than','then','there','here','what','which','who','whom','how','why',
  'when','where','not','no','yes','please','kindly'
]);

const ACTION_WORDS = [
  'write','generate','explain','create','analyze','summarize','compare','prepare',
  'develop','design','build','draft','compose','review','translate','rewrite','outline',
  'plan','describe','list','classify','recommend','suggest','evaluate','optimize',
  'refactor','debug','implement','solve','calculate','predict'
];

const ROLE_PHRASES = [
  'act as','you are','behave like','as a','as an','pretend to be','assume the role of',
  'imagine you are','take on the role','play the role'
];

const FORMAT_KEYWORDS = [
  'paragraph','email','table','bullet','bullets','bullet points','code','report',
  'social media','step-by-step','step by step','list','json','markdown','outline',
  'essay','letter','memo','summary','presentation','document','article','format'
];

const TONE_KEYWORDS = [
  'professional','friendly','formal','simple','academic','creative','technical',
  'persuasive','respectful','polite','enthusiastic','neutral','casual','informal',
  'serious','witty','warm','authoritative','tone'
];

const AUDIENCE_KEYWORDS = [
  'student','students','principal','hr','recruiter','developer','developers',
  'customer','customers','client','clients','team','manager','manager','employees',
  'audience','readers','users','beginners','experts','children','professor','teacher',
  'investors','stakeholders'
];

const CONSTRAINT_KEYWORDS = [
  'word limit','words','characters','character limit','format','deadline','example',
  'examples','language','steps','bullet points','sections','headings','length',
  'minimum','maximum','at least','no more than','within','include','exclude','must',
  'should','must not','should not','avoid','platform','reference','citation'
];

const tokenize = (text = '') =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const meaningfulWords = (text = '') =>
  tokenize(text).filter((w) => !STOPWORDS.has(w) && w.length > 2);

const containsAny = (haystack, needles) => {
  const lower = String(haystack).toLowerCase();
  return needles.some((n) => lower.includes(n));
};

const round = (n) => Math.round(n * 10) / 10;

const ratingFromScore = (score) => {
  if (score >= 90) return 'Excellent Prompt';
  if (score >= 75) return 'Good Prompt';
  if (score >= 60) return 'Average Prompt';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor Prompt';
};

/**
 * Main analyzer.
 * @param {object} input
 * @returns {object} evaluation
 */
function analyzePrompt(input) {
  const {
    category = '',
    scenario = '',
    userPrompt = '',
    expectedOutputFormat = '',
    tone = '',
    targetAudience = '',
    additionalRequirements = '',
  } = input || {};

  const promptText = String(userPrompt || '');
  const promptLower = promptText.toLowerCase();
  const scenarioLower = String(scenario || '').toLowerCase();

  const promptTokens = tokenize(promptText);
  const wordCount = promptTokens.length;

  const strengths = [];
  const weaknesses = [];
  const missing = [];
  const suggestions = [];

  // 1) Clarity (10) — based on length, action words, sentence structure
  let clarity = 0;
  if (wordCount >= 8) clarity += 4;
  else if (wordCount >= 4) clarity += 2;

  const hasAction = ACTION_WORDS.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(promptText));
  if (hasAction) {
    clarity += 4;
    strengths.push('Uses a clear action verb (e.g., write/generate/analyze).');
  } else {
    weaknesses.push('No clear action verb (e.g., write, generate, explain).');
    suggestions.push('Start with a strong action verb so the model knows what to do.');
  }

  if (/[?.!]/.test(promptText)) clarity += 2;
  clarity = Math.min(10, clarity);
  if (clarity >= 8) strengths.push('Prompt is reasonably clear.');
  if (clarity < 5) weaknesses.push('Prompt lacks clarity; it is too short or vague.');

  // 2) Context (15) — does prompt reference scenario context?
  const scenarioWords = meaningfulWords(scenarioLower);
  const promptMeaningful = new Set(meaningfulWords(promptLower));
  const overlap = scenarioWords.filter((w) => promptMeaningful.has(w));
  const overlapRatio = scenarioWords.length === 0 ? 0 : overlap.length / scenarioWords.length;

  let context = Math.round(overlapRatio * 15);
  if (wordCount >= 25) context = Math.min(15, context + 2);
  context = Math.max(0, Math.min(15, context));

  if (overlapRatio >= 0.4) {
    strengths.push('Prompt reflects the scenario context well.');
  } else if (overlapRatio >= 0.15) {
    weaknesses.push('Prompt partially captures the scenario context.');
    suggestions.push('Include more details from the scenario (purpose, who, what, when).');
  } else {
    weaknesses.push('Prompt does not reflect the scenario context.');
    missing.push('Scenario Context');
    suggestions.push('Restate the situation briefly inside the prompt itself.');
  }

  // 3) Role Assignment (10)
  const hasRole = ROLE_PHRASES.some((p) => promptLower.includes(p));
  let role = hasRole ? 10 : 0;
  if (hasRole) strengths.push('Assigns a role to the model (e.g., "Act as...").');
  else {
    weaknesses.push('No role assigned to the model.');
    missing.push('Role Assignment');
    suggestions.push('Begin with "Act as a [role]" to set expertise and perspective.');
  }

  // 4) Task Definition (15)
  let task = 0;
  if (hasAction) task += 8;
  if (wordCount >= 12) task += 4;
  if (overlapRatio >= 0.25) task += 3;
  task = Math.min(15, task);
  if (task >= 10) strengths.push('Task is reasonably defined.');
  else {
    weaknesses.push('Task is not clearly defined.');
    missing.push('Clear Task Definition');
    suggestions.push('Spell out the exact deliverable (what to produce, for whom, why).');
  }

  // Detect constraint / "specifics" keywords inside the prompt text once,
  // so Input Parameters, Constraints, and other rules can award credit when
  // those details are written into the prompt itself (rather than carried in
  // separate form fields that the current frontend no longer collects).
  const constraintMatches = CONSTRAINT_KEYWORDS.filter((k) => promptLower.includes(k));
  const constraintMatchCount = constraintMatches.length;
  const specificsInPrompt = constraintMatchCount > 0;

  // 5) Input Parameters (15) — audience + specifics + scenario specificity.
  // A prompt that names its audience and lists details (word limit / examples
  // / deadline / etc.) inside the text should reach the full 15 — the form
  // fields (`targetAudience`, `additionalRequirements`) are still honored if
  // an API caller supplies them directly.
  let inputs = 0;
  const audienceProvided = !!String(targetAudience).trim();
  const additionalProvided = !!String(additionalRequirements).trim();
  const audienceMentioned =
    audienceProvided ||
    AUDIENCE_KEYWORDS.some((k) => promptLower.includes(k));
  if (audienceMentioned) inputs += 6;
  else {
    missing.push('Target Audience');
    suggestions.push('Mention the target audience (e.g., students, HR, developers).');
  }
  if (additionalProvided || specificsInPrompt) inputs += 5;
  else suggestions.push('Add specifics like word limit, examples, deadline or language.');

  if (wordCount >= 30) inputs += 4;
  inputs = Math.min(15, inputs);
  if (inputs >= 10) strengths.push('Provides useful input parameters / audience info.');
  else weaknesses.push('Important input parameters are missing.');

  // 6) Output Format (10). Full marks if the format is named explicitly,
  // either via the dropdown or anywhere inside the prompt text.
  const formatProvided = !!String(expectedOutputFormat).trim();
  const formatMentioned =
    formatProvided ||
    FORMAT_KEYWORDS.some((k) => promptLower.includes(k));
  let outputFormat = 0;
  if (formatMentioned) {
    outputFormat = 10;
    strengths.push('Specifies an output format.');
  } else {
    missing.push('Expected Output Format');
    suggestions.push('State the format clearly (e.g., email, table, bullet points).');
  }

  // 7) Constraints (10). Tiered by how many distinct constraint keywords show
  // up in the prompt — a single mention is partial credit, two or more is
  // full marks. An explicit `additionalRequirements` field also earns full.
  const constraintProvided = !!String(additionalRequirements).trim();
  let constraints = 0;
  if (constraintProvided || constraintMatchCount >= 7) {
    constraints = 10;
    strengths.push('Includes constraints / requirements.');
  } else if (constraintMatchCount === 4) {
    constraints = 6;
    strengths.push('Includes at least three constraint / requirement.');
    suggestions.push('Add more constraints (length, examples, sections...) for full credit.');
  }else if (constraintMatchCount === 1) {
    constraints = 3;
    strengths.push('Includes at least one constraint / requirement.');
    suggestions.push('Add more constraints (length, examples, sections...) for full credit.');
  }
   else {
    missing.push('Constraints');
    suggestions.push('Add constraints such as word limit, sections, or tone limits.');
  }

  // 8) Tone (5). Any tone keyword in the prompt text earns full marks — the
  // earlier "3 if only mentioned in text" penalty was a relic of the removed
  // tone form field.
  const toneProvided = !!String(tone).trim();
  const toneMentioned =
    toneProvided || TONE_KEYWORDS.some((k) => promptLower.includes(k));
  let toneScore = 0;
  if (toneMentioned) {
    toneScore = 5;
    strengths.push('Tone is specified.');
  } else {
    missing.push('Tone');
    suggestions.push('Mention the desired tone (professional, formal, friendly...).');
  }

  // 9) Relevance (5) — keyword overlap with scenario
  let relevance = Math.round(overlapRatio * 5);
  relevance = Math.max(0, Math.min(5, relevance));
  if (relevance >= 4) strengths.push('Prompt is highly relevant to the scenario.');
  else if (relevance <= 2) {
    weaknesses.push('Prompt is loosely relevant to the scenario.');
    suggestions.push('Use key terms from the scenario directly in the prompt.');
  }

  // 10) Grammar & Structure (5)
  let grammar = 0;
  if (wordCount > 0) grammar += 1;
  if (/^[A-Z]/.test(promptText.trim())) grammar += 1;
  if (/[.!?]\s*$/.test(promptText.trim())) grammar += 1;
  // simple sentence count heuristic
  const sentences = promptText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 2) grammar += 1;
  if (wordCount >= 15) grammar += 1;
  grammar = Math.min(5, grammar);
  if (grammar >= 4) strengths.push('Good grammar and structure.');
  else if (grammar <= 3) {
    weaknesses.push('Grammar or structure could be improved.');
    suggestions.push('Use proper capitalization, punctuation, and multiple sentences.');
  }

  const scores = {
    clarity,
    context,
    roleAssignment: role,
    taskDefinition: task,
    inputParameters: inputs,
    outputFormat,
    constraints,
    tone: toneScore,
    relevance,
    grammarStructure: grammar,
  };

  const overallScore = Math.round(
    scores.clarity +
      scores.context +
      scores.roleAssignment +
      scores.taskDefinition +
      scores.inputParameters +
      scores.outputFormat +
      scores.constraints +
      scores.tone +
      scores.relevance +
      scores.grammarStructure
  );

  const rating = ratingFromScore(overallScore);

  // Deduplicate arrays
  const dedupe = (arr) => Array.from(new Set(arr));
  return {
    scores,
    overallScore,
    rating,
    missingParameters: dedupe(missing),
    strengths: dedupe(strengths),
    weaknesses: dedupe(weaknesses),
    suggestions: dedupe(suggestions),
    meta: {
      wordCount,
      overlapRatio: round(overlapRatio),
      hasAction,
      hasRole,
      category,
    },
  };
}

module.exports = { analyzePrompt, ratingFromScore };
