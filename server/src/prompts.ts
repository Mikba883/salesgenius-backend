// ============================================================================
// OPTIMIZED AI PROMPT SYSTEM - SalesGenius
// ============================================================================

// SYSTEM PROMPT (Core Instructions)
export const SYSTEM_PROMPT = `You are an expert B2B sales coach analyzing live sales calls in real-time.

LANGUAGE DETECTION:
- Analyze the LATEST USER TEXT to detect the customer's language
- Respond in the SAME language detected (Italian, English, Spanish, French, German, etc.)
- If conversation is mixed, prioritize the customer's language
- If uncertain or multiple languages, default to English
- Maintain language consistency throughout the suggestion

OUTPUT REQUIREMENTS:
- Maximum 25 words (strict limit)
- Be specific and actionable - suggest the NEXT best move
- Use imperative verbs (Ask, Propose, Highlight, Quantify, etc.)
- No generic motivation or filler phrases
- No preambles like "You could..." or "Consider..."
- Professional yet conversational tone
- Avoid repeating what was just said

⚠️ CRITICAL: NEVER INVENT PRODUCT DATA
- NEVER make up prices, features, metrics, or ROI numbers for the seller's product
- NEVER invent specific savings amounts, time savings, or performance metrics
- NEVER cite fake case studies or customer names
- NEVER claim "our product does X" without knowing if it's true

WHAT TO DO INSTEAD:
✅ Suggest STRATEGIES and QUESTIONS to uncover customer's situation
✅ Guide seller to QUANTIFY based on customer's own data
✅ Suggest HOW to frame value, not specific values
✅ Reference PUBLICLY KNOWN market data/trends (when genuinely known)
✅ Suggest REASONING frameworks and objection-handling techniques

If you cannot determine language from USER TEXT, default to English.`;

// ============================================================================
// CONFIGURATION PRESETS
// ============================================================================

export const QUALITY_PRESETS = {
  fast: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.6,
    max_tokens: 80,
    presence_penalty: 0.1,
  },
  
  balanced: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.7,
    max_tokens: 150,
    presence_penalty: 0.2,
    frequency_penalty: 0.1,
  },
  
  premium: {
    model: 'gpt-4o' as const,
    temperature: 0.8,
    max_tokens: 200,
    presence_penalty: 0.3,
    frequency_penalty: 0.2,
  }
};

// ============================================================================
// DYNAMIC PROMPT BUILDER
// ============================================================================

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface BuildMessagesParams {
  category?: string;
  transcript?: string;
  context?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export function buildMessages(params: BuildMessagesParams): Message[] {
  const {
    category = "conversational",
    transcript = "",
    context = "",
    conversationHistory = []
  } = params;

  const categoryInstructions = `
Focus on ${category} techniques.
Suggest strategic questions and approaches.
Never invent specific product data.
`;

  const recentContext = conversationHistory
    .slice(-3)
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  const contextSection = context || recentContext || "No prior context available";

  const userPrompt = `
CONVERSATION CONTEXT:
${contextSection}

LATEST USER TEXT:
"${transcript}"

YOUR TASK:
1. Detect language from the text above
2. Generate ONE specific suggestion in that language
3. Focus on ${category} category
4. Maximum 25 words
5. Use imperative form
6. Don't repeat context

${categoryInstructions}

OUTPUT (suggestion only):`;

  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt }
  ];
}

// ============================================================================
// HELPER: Language Detection
// ============================================================================

export function detectLanguage(text: string): string {
  const languagePatterns: Record<string, RegExp> = {
    it: /\b(che|sono|della|questo|nostro|vostra|può|fare|siamo|hanno)\b/i,
    es: /\b(que|para|con|esta|nuestro|puede|hacer|somos|tienen)\b/i,
    fr: /\b(que|pour|avec|cette|notre|peut|faire|sommes|ont)\b/i,
    de: /\b(das|ist|und|mit|können|machen|sind|haben|wir)\b/i,
    en: /\b(that|what|can|have|are|this|our|your|make)\b/i,
  };

  let maxMatches = 0;
  let detectedLang = 'en';

  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    const matches = (text.match(pattern) || []).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedLang = lang;
    }
  }

  return maxMatches > 0 ? detectedLang : 'en';
}

export default {
  buildMessages,
  detectLanguage,
  SYSTEM_PROMPT,
  QUALITY_PRESETS,
};