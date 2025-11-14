"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUALITY_PRESETS = exports.SYSTEM_PROMPT = void 0;
exports.buildMessages = buildMessages;
exports.SYSTEM_PROMPT = `
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
  "language": "en",
  "intent": "Raise Concern / Objection",
  "category": "Value Discussion",
  "suggestion": "Reframe price as ROI and long-term gain, not cost."
}
`;
exports.QUALITY_PRESETS = {
    fast: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 200,
        presence_penalty: 0.3,
        frequency_penalty: 0.3,
    },
    balanced: {
        model: 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 250,
        presence_penalty: 0.4,
        frequency_penalty: 0.4,
    },
    premium: {
        model: 'gpt-4o',
        temperature: 0.9,
        max_tokens: 300,
        presence_penalty: 0.5,
        frequency_penalty: 0.5,
    },
};
function buildMessages(params) {
    const { category = "Discovery & Qualification", transcript = "", context = "", confidence = 0.8, conversationHistory = [], } = params;
    const categoryInstructions = `
Focus on ${category} strategies.
Use credible, evidence-based reasoning and practical next steps.
Avoid invented data or generic statements.
`;
    const recentContext = conversationHistory
        .slice(-6)
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
    const contextSection = context || recentContext || "No prior context available.";
    const userPrompt = `
CONVERSATION CONTEXT (last 6 exchanges):
${contextSection}

LATEST USER TEXT:
"${transcript}"

SYSTEM NOTES:
- Confidence: ${confidence.toFixed(2)}
- Previous suggestions are in the context above

YOUR TASK:
1. **ANALYZE** the full conversation context deeply before responding.
2. **DETECT** the customer's language (Italian, English, etc.).
3. **CLASSIFY** their intent and the current sales category.
4. **GENERATE** one strategic, actionable suggestion (35-40 words).
5. **ENSURE VARIABILITY**: Don't repeat similar advice from recent context.
6. **OUTPUT** only valid JSON format.

${categoryInstructions}
`;
    return [
        { role: 'system', content: exports.SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ];
}
exports.default = {
    SYSTEM_PROMPT: exports.SYSTEM_PROMPT,
    buildMessages,
    QUALITY_PRESETS: exports.QUALITY_PRESETS,
};
//# sourceMappingURL=prompts.js.map