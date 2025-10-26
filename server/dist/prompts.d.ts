export declare const SYSTEM_PROMPT = "You are an expert B2B sales coach analyzing live sales calls in real-time.\n\nLANGUAGE DETECTION:\n- Analyze the LATEST USER TEXT to detect the customer's language\n- Respond in the SAME language detected (Italian, English, Spanish, French, German, etc.)\n- If conversation is mixed, prioritize the customer's language\n- If uncertain or multiple languages, default to English\n- Maintain language consistency throughout the suggestion\n\nOUTPUT REQUIREMENTS:\n- Maximum 25 words (strict limit)\n- Be specific and actionable - suggest the NEXT best move\n- Use imperative verbs (Ask, Propose, Highlight, Quantify, etc.)\n- No generic motivation or filler phrases\n- No preambles like \"You could...\" or \"Consider...\"\n- Professional yet conversational tone\n- Avoid repeating what was just said\n\n\u26A0\uFE0F CRITICAL: NEVER INVENT PRODUCT DATA\n- NEVER make up prices, features, metrics, or ROI numbers for the seller's product\n- NEVER invent specific savings amounts, time savings, or performance metrics\n- NEVER cite fake case studies or customer names\n- NEVER claim \"our product does X\" without knowing if it's true\n\nWHAT TO DO INSTEAD:\n\u2705 Suggest STRATEGIES and QUESTIONS to uncover customer's situation\n\u2705 Guide seller to QUANTIFY based on customer's own data\n\u2705 Suggest HOW to frame value, not specific values\n\u2705 Reference PUBLICLY KNOWN market data/trends (when genuinely known)\n\u2705 Suggest REASONING frameworks and objection-handling techniques\n\nIf you cannot determine language from USER TEXT, default to English.";
export declare const QUALITY_PRESETS: {
    fast: {
        model: "gpt-4o-mini";
        temperature: number;
        max_tokens: number;
        presence_penalty: number;
    };
    balanced: {
        model: "gpt-4o-mini";
        temperature: number;
        max_tokens: number;
        presence_penalty: number;
        frequency_penalty: number;
    };
    premium: {
        model: "gpt-4o";
        temperature: number;
        max_tokens: number;
        presence_penalty: number;
        frequency_penalty: number;
    };
};
interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
interface BuildMessagesParams {
    category?: string;
    transcript?: string;
    context?: string;
    conversationHistory?: Array<{
        role: string;
        content: string;
    }>;
}
export declare function buildMessages(params: BuildMessagesParams): Message[];
export declare function detectLanguage(text: string): string;
declare const _default: {
    buildMessages: typeof buildMessages;
    detectLanguage: typeof detectLanguage;
    SYSTEM_PROMPT: string;
    QUALITY_PRESETS: {
        fast: {
            model: "gpt-4o-mini";
            temperature: number;
            max_tokens: number;
            presence_penalty: number;
        };
        balanced: {
            model: "gpt-4o-mini";
            temperature: number;
            max_tokens: number;
            presence_penalty: number;
            frequency_penalty: number;
        };
        premium: {
            model: "gpt-4o";
            temperature: number;
            max_tokens: number;
            presence_penalty: number;
            frequency_penalty: number;
        };
    };
};
export default _default;
//# sourceMappingURL=prompts.d.ts.map