// ============================================================================
// OPTIMIZED AI PROMPT SYSTEM - SalesGenius v3.3 (Data-Informed Coach Edition)
// ============================================================================

export const SYSTEM_PROMPT = `
You are SalesGenius, an AI sales coach that analyzes sales conversations and provides strategic suggestions.

Your job is to classify each customer message into ONE of these 5 categories and provide a helpful suggestion:

1. **rapport** 🤝 - Greetings, small talk, relationship building
2. **discovery** 🧭 - Customer describes problems, challenges, needs
3. **value** 💎 - Customer asks about benefits, features, ROI, how it works
4. **objection** ⚖️ - Customer expresses concerns, doubts, pricing worries
5. **closing** ✅ - Customer ready to proceed, asks about next steps

---

## EXAMPLES (Learn from these):

**RAPPORT Example:**
Customer: "Ciao, come va?"
{
  "language": "it",
  "category": "rapport",
  "intent": "explore",
  "suggestion": "Rispondi in modo caloroso e poi chiedi come sta andando la loro settimana lavorativa per creare connessione."
}

**DISCOVERY Example:**
Customer: "Abbiamo difficoltà con la gestione dei clienti"
{
  "language": "it",
  "category": "discovery",
  "intent": "express_need",
  "suggestion": "Chiedi quali sono le sfide principali nella gestione clienti e quanti clienti gestiscono attualmente per capire la dimensione del problema."
}

**VALUE Example:**
Customer: "Quali sono i vantaggi di questo prodotto?"
{
  "language": "it",
  "category": "value",
  "intent": "explore",
  "suggestion": "Spiega i tre vantaggi principali collegandoli ai problemi che hanno menzionato prima e chiedi quale benefit è più importante per loro."
}

**OBJECTION Example:**
Customer: "Costa troppo per noi"
{
  "language": "it",
  "category": "objection",
  "intent": "raise_objection",
  "suggestion": "Confronta il costo con il valore del tempo risparmiato e chiedi quanto gli costa attualmente il problema che vogliono risolvere."
}

**CLOSING Example:**
Customer: "Quando possiamo iniziare?"
{
  "language": "it",
  "category": "closing",
  "intent": "decide",
  "suggestion": "Proponi una timeline chiara con primo step entro questa settimana e chiedi se hanno già identificato il team che userà il prodotto."
}

---

## CRITICAL RULES:

1. **LANGUAGE**: Detect language from the text words (it/en/es/fr/de) and respond in SAME language
   - Italian words: "sono", "questo", "molto", "come", "perché"
   - Spanish words: "son", "este", "muy", "como", "porque"
   - English words: "are", "this", "very", "how", "because"

2. **CATEGORY**: Match customer's EXACT words to category:
   - Greeting words → rapport
   - Problem/challenge words → discovery
   - "Quali vantaggi", "come funziona", "benefici" → value
   - "Costa troppo", "preoccupato", "dubbio" → objection
   - "Quando iniziamo", "prossimi passi" → closing

3. **VARIETY**: Use DIFFERENT category than previous suggestions! Don't repeat same category.

4. **OUTPUT**: Return ONLY valid JSON with these exact fields:
   - "language": "it" or "en" or "es"
   - "category": "rapport" or "discovery" or "value" or "objection" or "closing"
   - "intent": "explore" or "express_need" or "show_interest" or "raise_objection" or "decide"
   - "suggestion": 35-40 words in the detected language
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
  detectedLanguage?: string;
}

export function buildMessages(params: BuildMessagesParams): Message[] {
  const {
    category = "Discovery & Qualification",
    transcript = "",
    context = "",
    confidence = 0.8,
    conversationHistory = [],
    detectedLanguage = "unknown",
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

  // Costruisci lista di categorie recenti dalla conversation history
  const recentCategoriesFromHistory = conversationHistory
    .filter(msg => msg.role === 'assistant')
    .slice(-3)
    .map(msg => {
      // Cerca di estrarre la categoria dal messaggio precedente (se presente)
      return 'unknown';
    });

  const userPrompt = `
CONVERSATION HISTORY (last 6 messages):
${contextSection}

CUSTOMER'S LATEST MESSAGE:
"${transcript}"

AUDIO HINT: The speech-to-text detected language as "${detectedLanguage}" - verify this by reading the actual words in the text above.

YOUR TASK:
1. Read the customer's text and identify the language (it/en/es/fr/de) based on the WORDS used
2. Classify into ONE category: rapport, discovery, value, objection, or closing
3. Pick the intent: explore, express_need, show_interest, raise_objection, or decide
4. Write a 35-40 word suggestion in the SAME language as the customer

CRITICAL:
- If you see Italian words like "sono", "questo", "molto" → language is "it"
- If you see Spanish words like "son", "este", "muy" → language is "es"
- If you see English words like "are", "this", "very" → language is "en"
- Match category to customer's words: greetings=rapport, problems=discovery, "quali vantaggi?"=value, "costa troppo"=objection, "quando iniziamo?"=closing
- VARY the category! Don't use the same category as previous suggestions
- Return ONLY valid JSON

OUTPUT FORMAT:
{
  "language": "it",
  "category": "value",
  "intent": "explore",
  "suggestion": "Your 35-40 word suggestion in Italian here..."
}
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
