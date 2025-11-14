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
You MUST classify each interaction into ONE of these 5 categories:

1. **rapport** – Rapport & Opening: Greeting, small talk, trust building, relationship warmth
2. **discovery** – Discovery & Qualification: Identifying needs, pain points, priorities, decision drivers, stakeholders
3. **value** – Value Discussion: Linking solution to outcomes, ROI, business impact, differentiation
4. **objection** – Objection & Negotiation: Handling resistance, concerns, pricing discussions, reframing value
5. **closing** – Closing & Follow-Up: Confirming next steps, commitments, agreements, timeline, implementation

**IMPORTANT:** Use ONLY the keyword (rapport/discovery/value/objection/closing) in your JSON output, NOT the full description.

---

### OUTPUT REQUIREMENTS
- Max 35-40 words for depth and nuance.
- Use imperative, confident, consultative tone.
- Be specific and realistic — no invented data.
- Prioritize diagnostic or strategic next steps.
- Focus on reasoning, empathy, and business relevance.
- **VARY your suggestions**: avoid repetitive patterns, explore different angles.
- **THINK DEEPLY**: analyze context before suggesting, don't rush.

⚠️ CRITICAL RULES:
- NEVER invent product details, prices, or metrics.
- NEVER fabricate case studies or fake data.
- NEVER repeat similar suggestions from recent history.
- Always focus on credible, consultative tactics.
- Each suggestion should offer unique strategic value.

---

### OUTPUT FORMAT (JSON only)
{
  "language": "it",
  "intent": "express_need",
  "category": "value",
  "suggestion": "Collega la soluzione al ROI specifico e ai KPI che il cliente monitora già."
}

**CRITICAL:**
- category MUST be one of: rapport, discovery, value, objection, closing
- intent MUST be one of: explore, express_need, show_interest, raise_objection, decide
- suggestion MUST be 35-40 words in the detected language
`;

// ============================================================================
// QUALITY PRESETS
// ============================================================================

export const QUALITY_PRESETS = {
  fast: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.7,
    max_tokens: 200,
    presence_penalty: 0.3,
    frequency_penalty: 0.3,
  },
  balanced: {
    model: 'gpt-4o-mini' as const,
    temperature: 0.8,
    max_tokens: 250,
    presence_penalty: 0.4,
    frequency_penalty: 0.4,
  },
  premium: {
    model: 'gpt-4o' as const,
    temperature: 0.9,
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
    .slice(-6)  // Aumentato da 3 a 6 per più contesto
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  const contextSection = context || recentContext || "No prior context available.";

  const userPrompt = `
CONVERSATION CONTEXT (last 6 exchanges):
${contextSection}

LATEST CUSTOMER TEXT (what they just said):
"${transcript}"

ANALYSIS FRAMEWORK:
- Transcription confidence: ${confidence.toFixed(2)}
- Previous suggestions: See context above

YOUR TASK (step-by-step):
1. **UNDERSTAND CUSTOMER STATE**: What is the customer really asking? What's their emotional state? What phase of buying journey are they in?

2. **DETECT LANGUAGE**: Italian, English, Spanish, French, German

3. **CLASSIFY CATEGORY** (choose ONE):
   - rapport: Building relationship, small talk, trust
   - discovery: Exploring needs, pain points, requirements
   - value: Discussing ROI, outcomes, business impact
   - objection: Handling concerns, resistance, pricing
   - closing: Moving to commitment, next steps, agreements

4. **CLASSIFY INTENT** (customer's goal):
   - explore: Seeking information
   - express_need: Stating a problem/goal
   - show_interest: Showing openness
   - raise_objection: Expressing concern
   - decide: Ready to move forward

5. **CRAFT SUGGESTION** (35-40 words):
   - Be SPECIFIC to their situation
   - Use consultative, strategic language
   - Focus on NEXT BEST ACTION
   - DON'T repeat previous suggestions

6. **OUTPUT**: Return ONLY valid JSON with exact keywords

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
