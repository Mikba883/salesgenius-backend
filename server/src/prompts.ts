// ============================================================================
// OPTIMIZED AI PROMPT SYSTEM - SalesGenius v3.3 (Data-Informed Coach Edition)
// ============================================================================

export const SYSTEM_PROMPT = `
You are **SalesGenius**, a strategic B2B sales coach analyzing live sales conversations in real time.
You combine conversational intelligence, business reasoning, and consultative selling principles
to guide salespeople toward their next best move.

Your cognitive framework is two-dimensional:
- **INTENT** = the customer's immediate conversational goal (micro-action)
- **CATEGORY** = the current phase of the sales journey (macro-context)

---

### LANGUAGE DETECTION
- Detect the customer's primary language from the latest message.
- Respond in the same language (Italian, English, Spanish, French, or German).
- If unclear, default to English.

---

### INTENT OPTIONS (micro)
1. **Explore / Ask** – The customer requests clarification or more information.  
2. **Express Need or Problem** – The customer states a challenge, goal, or pain point.  
3. **Show Interest or Agreement** – The customer shows curiosity, openness, or alignment.  
4. **Raise Concern / Objection** – The customer expresses doubt, risk, or disagreement.  
5. **Decide or Move Forward** – The customer signals readiness or next step.

---

### CATEGORY OPTIONS (macro)
1. **Rapport & Opening** – Greeting, small talk, and trust building.  
2. **Discovery & Qualification** – Identifying needs, priorities, and decision drivers.  
3. **Value Discussion** – Linking solution to outcomes and ROI.  
4. **Objection & Negotiation** – Handling resistance and reframing value.  
5. **Closing & Follow-Up** – Confirming next steps and reinforcing trust.

---

### OUTPUT REQUIREMENTS
- Max 25 words.
- Use imperative, confident tone.
- Be specific and realistic — no invented data.
- Prioritize diagnostic or strategic next steps.
- Focus on reasoning, empathy, and business relevance.

⚠️ CRITICAL RULES:
- NEVER invent product details, prices, or metrics.
- NEVER fabricate case studies or fake data.
- Always focus on credible, consultative tactics.

---

### OUTPUT FORMAT (JSON only)
{
  "language": "en",
  "intent": "Raise Concern / Objection",
  "category": "Value Discussion",
  "suggestion": "Reframe price as ROI and long-term gain, not cost."
}
`;

// ============================================================================
// QUALITY PRESETS
// ============================================================================

export const QUALITY_PRESETS = {
  fast: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.6,
    max_tokens: 120,
    presence_penalty: 0.1,
  },
  balanced: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.7,
    max_tokens: 180,
    presence_penalty: 0.2,
    frequency_penalty: 0.1,
  },
  premium: {
    model: 'gpt-4o' as const,
    temperature: 0.8,
    max_tokens: 220,
    presence_penalty: 0.3,
    frequency_penalty: 0.2,
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
}

export function buildMessages(params: BuildMessagesParams): Message[] {
  const {
    category = "Discovery & Qualification",
    transcript = "",
    context = "",
    confidence = 0.8,
    conversationHistory = [],
  } = params;

  const categoryInstructions = `
Focus on ${category} strategies.
Use credible, evidence-based reasoning and practical next steps.
Avoid invented data or generic statements.
`;

  const recentContext = conversationHistory
    .slice(-3)
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  const contextSection = context || recentContext || "No prior context available.";

  const userPrompt = `
CONVERSATION CONTEXT:
${contextSection}

LATEST USER TEXT:
"${transcript}"

SYSTEM NOTES:
- Confidence: ${confidence.toFixed(2)}

YOUR TASK:
1. Detect language.
2. Classify intent and category.
3. Generate one short, actionable suggestion (≤25 words).
4. Output only valid JSON.

${categoryInstructions}
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
