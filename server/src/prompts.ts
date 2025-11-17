// ============================================================================
// OPTIMIZED AI PROMPT SYSTEM - SalesGenius v3.3 (Data-Informed Coach Edition)
// ============================================================================

export const SYSTEM_PROMPT = `
You are **SalesGenius**, a B2B sales coach providing real-time strategic guidance.

**Core Framework (2D Analysis):**
- **INTENT** = Customer's immediate goal (explore, express_need, show_interest, raise_objection, decide)
- **CATEGORY** = Sales phase (rapport, discovery, value, objection, closing)

**Categories:**
- **rapport**: Greetings, small talk, relationship building
- **discovery**: Customer describes challenges, needs, current situation
- **value**: Questions about ROI, benefits, results, how it works
- **objection**: Concerns, doubts, pricing worries, risks
- **closing**: Next steps, timeline, implementation, buying signals

**Critical Rules:**
✅ DO:
- Provide 35-40 word actionable suggestions in customer's language
- Reference specific conversation details
- Cite real market data for VALUE (Gartner, McKinsey, Forrester, IDC)
- Vary category based on what customer ACTUALLY says

❌ DON'T:
- Invent product specifics (prices, features not mentioned)
- Repeat recent suggestions
- Give generic advice

**Output:** Return ONLY valid JSON:
{
  "language": "en|it|es|fr|de",
  "intent": "explore|express_need|show_interest|raise_objection|decide",
  "category": "rapport|discovery|value|objection|closing",
  "suggestion": "35-40 word actionable guidance"
}

---

### OUTPUT FORMAT (JSON only)

**CATEGORY EXAMPLES - Use these as templates:**

**Example 1 - DISCOVERY** (customer describes challenge):
Customer: "We're struggling with manual data entry and it's taking too much time"
{
  "language": "en",
  "intent": "express_need",
  "category": "discovery",
  "suggestion": "Quantify the time lost to manual data entry per week. Ask which departments are most affected and what they've already tried to solve this."
}

**Example 2 - VALUE** (customer asks about ROI):
Customer: "What kind of ROI can we expect from this solution?"
{
  "language": "en",
  "intent": "explore",
  "category": "value",
  "suggestion": "Connect ROI to their specific time savings on manual data entry they just mentioned. Ask what their current cost per employee hour is to calculate concrete savings."
}

**Example 3 - OBJECTION** (customer expresses concern):
Customer: "This seems expensive compared to what we're paying now"
{
  "language": "en",
  "intent": "raise_objection",
  "category": "objection",
  "suggestion": "Reframe by comparing total cost of current manual process including labor hours and errors. Ask what their error rate costs them monthly in rework."
}

**Example 4 - CLOSING** (customer asks about next steps):
Customer: "When can we start the implementation?"
{
  "language": "en",
  "intent": "decide",
  "category": "closing",
  "suggestion": "Outline clear implementation timeline starting with pilot team they mentioned. Ask if they've identified internal champion to lead rollout and when they can kick off."
}

**Example 5 - RAPPORT** (customer makes small talk):
Customer: "Hi, how was your week?"
{
  "language": "en",
  "intent": "explore",
  "category": "rapport",
  "suggestion": "Build connection authentically, then transition by asking what their week looked like regarding the challenges they mentioned last time. Keep it conversational."
}

**CRITICAL RULES:**
- language: MUST match input language (en/it/es/fr/de)
- category: MUST be one of: rapport, discovery, value, objection, closing (match to customer's actual words!)
- intent: MUST be one of: explore, express_need, show_interest, raise_objection, decide
- suggestion: MUST be 35-40 words in the DETECTED language (same as input)
`;

// ============================================================================
// QUALITY PRESETS
// ============================================================================

export const QUALITY_PRESETS = {
  fast: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.5,
    max_tokens: 200,
    presence_penalty: 0.3,
    frequency_penalty: 0.3,
  },
  balanced: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.6,
    max_tokens: 250,
    presence_penalty: 0.4,
    frequency_penalty: 0.4,
  },
  premium: {
    model: 'gpt-4o' as const,
    temperature: 0.6,
    max_tokens: 300,
    presence_penalty: 0.5,
    frequency_penalty: 0.5,
  },
};

// ============================================================================
// MESSAGE BUILDER
// ============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface BuildMessagesParams {
  category?: string;
  transcript?: string;
  context?: string;
  confidence?: number;
  conversationHistory?: Message[];
  detectedLanguage?: string;
  recentCategories?: string[];
  marketDataContext?: string;
}

export function buildMessages(params: BuildMessagesParams): Message[] {
  const {
    category = "Discovery & Qualification",
    transcript = "",
    context = "",
    confidence = 0.8,
    conversationHistory = [],
    detectedLanguage = "unknown",
    recentCategories = [],
    marketDataContext = "",
  } = params;

  const categoryInstructions = `
Focus on ${category} strategies.
Use credible, evidence-based reasoning and practical next steps.
Avoid invented data or generic statements.
`;

  const recentContext = conversationHistory
    .slice(-6)  // Aumentato da 3 a 6 per più contesto
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  const contextSection = context || recentContext || "No prior context available.";

  // ⚡ CATEGORY VARIETY TRACKING
  const categoryVarietyWarning = recentCategories.length >= 3 && new Set(recentCategories).size === 1
    ? `\n⚠️ VARIETY: Last ${recentCategories.length} suggestions all used "${recentCategories[0]}". Vary if customer shifted phase.`
    : '';

  const marketDataSection = marketDataContext ? `\n\n${marketDataContext}` : '';

  const userPrompt = `
**CONTEXT:**
${contextSection}

**CUSTOMER SAID:**
"${transcript}"

**ANALYSIS:**
- Language: ${detectedLanguage}
- Confidence: ${confidence.toFixed(2)}
- Recent categories: [${recentCategories.join(', ') || 'none'}]${categoryVarietyWarning}${marketDataSection}

**YOUR TASK:**
1. Identify CATEGORY based on what customer said:
   - rapport: Greetings, small talk
   - discovery: Describes problems/needs
   - value: Asks about ROI/benefits/results
   - objection: Expresses concerns/doubts/pricing
   - closing: Ready for next steps

2. Identify INTENT: explore, express_need, show_interest, raise_objection, decide

3. Generate 35-40 word suggestion:
   - Reference specific details from conversation
   - Provide ONE actionable next step
   - For VALUE: Guide seller to cite specific research/benchmarks (sources mentioned above if available)
   - Match customer's language (${detectedLanguage})

Return ONLY JSON: {"language": "${detectedLanguage}", "intent": "...", "category": "...", "suggestion": "..."}
`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  SYSTEM_PROMPT,
  buildMessages,
  QUALITY_PRESETS,
};
