/**
 * Curated scenarios organized by category. The Prompt Analyzer hands one of
 * these to the user; the user then writes a prompt for it. Their prompt is
 * scored against this scenario as well as on prompt-engineering best practices.
 *
 * Add freely — each category must have at least one scenario.
 */

const SCENARIO_BANK = {
  'Academic Writing': [
    "Write a 500-word essay arguing whether artificial intelligence should be regulated by governments, with at least two real-world examples.",
    "Draft an abstract for a research paper on the impact of online learning on Indian undergraduate students during 2020-2023.",
    "Summarize the key findings of a hypothetical journal article on renewable energy adoption in developing countries.",
    "Outline a thesis chapter on the history and evolution of large language models for a Master's dissertation.",
    "Critique a research methodology that uses surveys alone to study student mental health on college campuses.",
  ],
  'Email Writing': [
    "Write a formal email to the Principal requesting permission to conduct an AI workshop for B.Tech students on the upcoming Saturday.",
    "Compose a polite follow-up email to a recruiter two weeks after an interview, asking about the status of your application.",
    "Draft an apology email to a client whose website went down for 6 hours due to a deployment issue from your team.",
    "Write an internal email announcing a new hybrid-work policy effective next month, addressed to all employees of a 200-person company.",
    "Compose an email to a professor requesting a recommendation letter for a Master's program, with a 2-week deadline.",
  ],
  'Resume and LinkedIn': [
    "Write a LinkedIn 'About' section for a final-year computer science student looking for SDE internships at product companies.",
    "Draft three resume bullet points for a backend developer who reduced API response time by 40% on a microservices system.",
    "Write a LinkedIn post announcing your promotion to Senior Product Manager and thanking your team.",
    "Compose the project section of a resume for a student who built a full-stack MERN application analyzing prompt quality.",
    "Write a one-paragraph cover letter intro for a Data Analyst role at a fintech startup, tailored to the job description.",
  ],
  'Coding and Debugging': [
    "Write a Python function that takes a list of integers and returns the longest strictly increasing subsequence. Include edge cases.",
    "Debug a React component that re-renders infinitely because of an effect missing a dependency array.",
    "Refactor a 200-line Express.js route handler into smaller, testable functions following the single-responsibility principle.",
    "Write a SQL query to find the top 5 customers by total order value in the last 90 days from an `orders` table.",
    "Explain why a Node.js process is leaking memory when a setInterval is never cleared, and propose a fix.",
  ],
  'Data Analysis': [
    "Analyze a sales dataset of an e-commerce store for Q1 2025 and report the three biggest drivers of revenue growth.",
    "Build a churn analysis for a SaaS product with 12 months of subscription data and recommend two retention experiments.",
    "Compare two A/B test variants for a checkout flow and decide which one to ship using statistical significance.",
    "Identify anomalies in daily active user counts for a mobile app over the last 30 days and propose plausible causes.",
    "Segment customers of a food-delivery app into 3-5 personas using order frequency, average order value, and city tier.",
  ],
  'Business Communication': [
    "Draft a one-page project status update for executive stakeholders summarizing progress, blockers, and asks for the next sprint.",
    "Write a meeting agenda for a 45-minute kickoff with a new client for a mobile app development engagement.",
    "Prepare talking points for a difficult conversation with a direct report about consistently missed deadlines.",
    "Compose a customer-facing announcement about a price increase taking effect in 60 days, emphasizing value and continuity.",
    "Write a proposal summary pitching an internal tooling team to senior leadership, including expected ROI in 6 months.",
  ],
  'Interview Preparation': [
    "Prepare a STAR-format answer to 'Tell me about a time you handled a conflict with a teammate' for a software engineering interview.",
    "Generate 10 likely behavioral interview questions for a Product Manager role at a B2B SaaS company.",
    "Draft a strong answer to 'Why are you leaving your current job?' without speaking negatively about the employer.",
    "Prepare a 90-second elevator pitch for a candidate transitioning from data science to ML engineering.",
    "Generate 5 system-design questions appropriate for a mid-level backend engineer, with key discussion points for each.",
  ],
  'Research and Summarization': [
    "Summarize the key arguments of a 30-page whitepaper on responsible AI deployment in healthcare in under 300 words.",
    "Compare three popular vector databases (Pinecone, Weaviate, Qdrant) across pricing, scaling, and ease of integration.",
    "Produce a literature review of the last 5 years of research on burnout among software engineers, with citations.",
    "Summarize a 60-minute earnings call transcript for a non-financial reader, highlighting forward-looking statements.",
    "Research and compare the top 3 frameworks for building agentic AI applications and recommend one for a small team.",
  ],
  'Content Creation': [
    "Write a 700-word blog post titled 'Five mistakes beginners make when writing LLM prompts' with practical examples.",
    "Draft a 90-second video script introducing a new productivity SaaS to a freelancer audience.",
    "Write a product newsletter feature highlighting three recent shipped features for a project management tool.",
    "Create a tutorial outline for a YouTube video teaching beginners how to deploy a Node.js app on a VPS.",
    "Write a landing page hero section (headline + subheadline + CTA) for a new AI-powered code review tool.",
  ],
  'Social Media Post': [
    "Write a LinkedIn post announcing the launch of an open-source prompt-analysis tool with a clear CTA to try it.",
    "Compose a Twitter/X thread (5 tweets) explaining the difference between zero-shot, few-shot, and chain-of-thought prompting.",
    "Draft an Instagram caption for a college tech-fest event happening this weekend, including relevant hashtags.",
    "Write a Reddit post for r/learnprogramming asking for honest feedback on a beginner-friendly MERN tutorial.",
    "Create a LinkedIn carousel outline (5 slides) explaining what prompt engineering is and why it matters in 2026.",
  ],
  'Image Generation Prompt': [
    "Generate a prompt for a hyper-realistic image of a cozy reading nook by a rainy window at golden hour.",
    "Create a prompt for a cyberpunk-style poster advertising a virtual prompt-engineering hackathon.",
    "Write a prompt for a minimalist flat-illustration showing a developer collaborating with an AI assistant.",
    "Generate a prompt for a watercolor portrait of a confident woman engineer leading a whiteboard discussion.",
    "Create a prompt for a 16:9 dashboard mockup illustration in a clean, modern Tailwind-style aesthetic.",
  ],
  Other: [
    "Plan a weekend self-learning schedule for a working professional preparing for a system design interview.",
    "Write a personal mission statement for someone transitioning from teaching to full-time technical writing.",
    "Draft a daily standup template for a small remote team across three time zones.",
    "Create a checklist for safely deploying a new feature behind a feature flag in production.",
    "Plan a 30-60-90 day onboarding for a new junior developer joining a 4-person startup.",
  ],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getScenario(category, { exclude } = {}) {
  const list = SCENARIO_BANK[category] || SCENARIO_BANK.Other;
  if (list.length === 1 || !exclude) return pickRandom(list);
  const remaining = list.filter((s) => s !== exclude);
  return pickRandom(remaining.length ? remaining : list);
}

function listCategories() {
  return Object.keys(SCENARIO_BANK);
}

module.exports = { SCENARIO_BANK, getScenario, listCategories };
