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
✅ MANDATORY FORMAT:
- **VALUE category ONLY**: "Tell them: [Concrete data/stat with source]"
  Example: "Tell them: Gartner 2024 shows 35-45% cost reduction in year one."

- **DISCOVERY/RAPPORT/OBJECTION/CLOSING categories**: "Direct script in quotes" + Explanation
  Example: "\"How many hours weekly do you spend on this?\" This quantifies the pain."

✅ DO:
- Provide 35-40 word actionable suggestions in customer's language
- Reference specific conversation details from what customer said
- Vary category based on what customer ACTUALLY says
- Check AVOID REPEATING section - provide DIFFERENT approaches

❌ DON'T:
- Invent product specifics (prices, features not mentioned)
- Repeat recent suggestions
- Use wrong format for category

**Output:** Return ONLY valid JSON with EXACTLY these 4 fields:
{
  "language": "en|it|es|fr|de",
  "intent": "explore|express_need|show_interest|raise_objection|decide",
  "category": "rapport|discovery|value|objection|closing",
  "suggestion": "35-40 word actionable guidance"
}

**CRITICAL JSON RULES:**
- The "suggestion" field MUST contain the full text
- Use escaped quotes inside suggestion: \"like this\"
- DO NOT create extra fields beyond these 4
- DO NOT put suggestion text as a JSON key

---

### OUTPUT FORMAT (JSON only)

**CATEGORY EXAMPLES - Use these as templates:**

**Example 1 - DISCOVERY** (customer describes challenge):
Customer: "We're struggling with manual data entry and it's taking too much time"
{
  "language": "en",
  "intent": "express_need",
  "category": "discovery",
  "suggestion": "\"How many hours per week does your team spend on manual data entry?\" This quantifies the pain and gives you concrete numbers to calculate time savings."
}
⚠️ NOTE: Quotes inside suggestion must be escaped with backslash: \"like this\"

**Example 2 - VALUE** (customer asks about ROI, WITH market data):
Customer: "What kind of ROI can we expect from automation?"
{
  "language": "en",
  "intent": "explore",
  "category": "value",
  "suggestion": "Tell them: Based on Gartner 2024 research, companies typically see 35-45% cost reduction in the first year with automation. For a team of 10 people, that's often €50K-100K in annual savings."
}

**Example 3 - OBJECTION** (customer expresses concern):
Customer: "This seems expensive compared to what we're paying now"
{
  "language": "en",
  "intent": "raise_objection",
  "category": "objection",
  "suggestion": "\"What does your current process cost you in labor hours and error rework per month?\" This reframes the discussion to total cost of ownership, not just price tag."
}

**Example 4 - CLOSING** (customer asks about next steps):
Customer: "When can we start the implementation?"
{
  "language": "en",
  "intent": "decide",
  "category": "closing",
  "suggestion": "\"Have you identified an internal champion to lead the rollout?\" This ensures someone drives adoption internally, critical for successful implementation."
}

**Example 5 - RAPPORT** (customer makes small talk):
Customer: "Hi, how was your week?"
{
  "language": "en",
  "intent": "explore",
  "category": "rapport",
  "suggestion": "\"Good! How has your week been handling the data entry challenges you mentioned?\" This builds rapport while transitioning back to business naturally."
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
  recentSuggestions?: string[];
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
    recentSuggestions = [],
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

  // ⚡ RECENT SUGGESTIONS: Pass to GPT to avoid repeats
  const recentSuggestionsSection = recentSuggestions.length > 0
    ? `\n⚠️ AVOID REPEATING: Recent suggestions you gave:
${recentSuggestions.map((s, i) => `   ${i + 1}. "${s}"`).join('\n')}
Do NOT repeat these - provide a DIFFERENT approach/angle.`
    : '';

  const userPrompt = `
**CONTEXT:**
${contextSection}

**CUSTOMER SAID:**
"${transcript}"

**ANALYSIS:**
- Language: ${detectedLanguage}
- Confidence: ${confidence.toFixed(2)}
- Recent categories: [${recentCategories.join(', ') || 'none'}]${categoryVarietyWarning}${marketDataSection}${recentSuggestionsSection}

**YOUR TASK:**
1. Identify CATEGORY based on what customer said:
   - rapport: Greetings, small talk
   - discovery: Describes problems/needs
   - value: Asks about ROI/benefits/results
   - objection: Expresses concerns/doubts/pricing
   - closing: Ready for next steps

2. Identify INTENT: explore, express_need, show_interest, raise_objection, decide

3. Generate 35-40 word suggestion with MANDATORY FORMAT:

   **IF category is VALUE:**
   - Format: "Tell them: [Concrete data/numbers/stat from MARKET DATA if available]"
   - Example: "Tell them: Gartner 2024 shows 35-45% cost reduction year one. For a team of 10, that's €50K-100K savings."
   - NO questions, only statements with data

   **IF category is DISCOVERY, RAPPORT, OBJECTION, or CLOSING:**
   - Format: "\"Direct script to say?\" Explanation why it works."
   - DISCOVERY example: "\"How many hours weekly do you spend on this?\" Quantifies pain for time savings calculation."
   - OBJECTION example: "\"What does your current process cost in labor hours per month?\" Reframes to total cost of ownership."
   - RAPPORT example: "\"How has your week been with those challenges?\" Transitions naturally to business."
   - CLOSING example: "\"Have you identified an internal champion?\" Ensures someone drives adoption."

   **ALWAYS:**
   - Match customer's language (${detectedLanguage})
   - Reference specific details from what they said
   - Check AVOID REPEATING section - provide DIFFERENT approach

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
