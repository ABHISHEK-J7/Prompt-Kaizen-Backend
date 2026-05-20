/**
 * Generates an improved version of the user's prompt using a deterministic
 * template, informed by the scenario, category, format, tone, audience and
 * additional requirements.
 */

const ROLE_BY_CATEGORY = {
  'Academic Writing': 'expert academic writer and editor',
  'Email Writing': 'professional communication specialist',
  'Resume and LinkedIn': 'career coach and resume strategist',
  'Coding and Debugging': 'senior software engineer',
  'Data Analysis': 'experienced data analyst',
  'Business Communication': 'business communication consultant',
  'Interview Preparation': 'seasoned interview coach',
  'Research and Summarization': 'meticulous research analyst',
  'Content Creation': 'creative content strategist',
  'Social Media Post': 'social media marketing expert',
  'Image Generation Prompt': 'creative visual prompt engineer',
  Other: 'subject-matter expert',
};

const FORMAT_INSTRUCTIONS = {
  Email: 'a well-structured email with subject line, greeting, body, and sign-off',
  Paragraph: 'well-formed paragraphs',
  Table: 'a clear, well-labeled table',
  'Bullet Points': 'concise bullet points',
  Code: 'clean, commented code with explanations',
  Report: 'a structured report with sections and headings',
  'Social Media Post': 'an engaging social media post with hooks and hashtags',
  'Step-by-step Explanation': 'a numbered, step-by-step explanation',
  Other: 'a clean, well-formatted response',
};

const cleanScenario = (scenario = '') =>
  String(scenario).trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');

function generateImprovedPrompt(input = {}) {
  const {
    category = 'Other',
    scenario = '',
    expectedOutputFormat = '',
    tone = '',
    targetAudience = '',
    additionalRequirements = '',
  } = input;

  const role = ROLE_BY_CATEGORY[category] || ROLE_BY_CATEGORY.Other;
  const cleanedScenario = cleanScenario(scenario);
  const task = cleanedScenario
    ? cleanedScenario.charAt(0).toLowerCase() + cleanedScenario.slice(1)
    : 'complete the task described above';

  const toneText = tone ? `${tone.toLowerCase()}` : 'clear and professional';
  const audienceText = targetAudience
    ? targetAudience.trim()
    : 'a general audience appropriate for this task';

  const formatText =
    FORMAT_INSTRUCTIONS[expectedOutputFormat] ||
    (expectedOutputFormat
      ? `the ${expectedOutputFormat.toLowerCase()} format`
      : 'a clean, well-formatted response');

  const extras = additionalRequirements
    ? additionalRequirements.trim()
    : 'word limits, clear structure, examples where helpful, and any necessary constraints';

  const improved = [
    `Act as a ${role}.`,
    `Your task is to ${task}.`,
    `Use a ${toneText} tone.`,
    `The target audience is ${audienceText}.`,
    `Generate the output as ${formatText}.`,
    `Include the following important details: ${extras}.`,
    `Make the response clear, structured, and useful. If anything is ambiguous, state your assumptions before answering.`,
  ].join(' ');

  return improved;
}

module.exports = { generateImprovedPrompt, ROLE_BY_CATEGORY };
