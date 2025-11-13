"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGPTSuggestion = handleGPTSuggestion;
exports.getHistoricalSuggestions = getHistoricalSuggestions;
exports.analyzeSuggestionPerformance = analyzeSuggestionPerformance;
const openai_1 = __importDefault(require("openai"));
const supabase_js_1 = require("@supabase/supabase-js");
const prompts_1 = require("./prompts");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const CATEGORY_EMOJI = {
    rapport: '🤝',
    discovery: '🧭',
    value: '💎',
    objection: '⚖️',
    closing: '✅',
};
const recentSuggestions = new Set();
const CACHE_DURATION_MS = 30000;
const conversationHistory = [];
const MAX_HISTORY = 5;
async function handleGPTSuggestion(transcript, ws, onSuggestionGenerated) {
    try {
        const messages = (0, prompts_1.buildMessages)({
            transcript,
            confidence: 0.8,
            conversationHistory,
        });
        const qualityMode = process.env.QUALITY_MODE || 'balanced';
        const qualitySettings = prompts_1.QUALITY_PRESETS[qualityMode] || prompts_1.QUALITY_PRESETS.balanced;
        const suggestionId = `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const OPENAI_TIMEOUT_MS = 8000;
        const completion = await Promise.race([
            openai.chat.completions.create({
                model: qualitySettings.model,
                messages: messages,
                temperature: qualitySettings.temperature,
                max_tokens: qualitySettings.max_tokens,
                presence_penalty: qualitySettings.presence_penalty,
                frequency_penalty: qualitySettings.frequency_penalty ?? 0,
                response_format: { type: 'json_object' },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout after 8s')), OPENAI_TIMEOUT_MS))
        ]);
        const responseText = completion.choices[0]?.message?.content || '{}';
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseText);
        }
        catch (e) {
            console.error('Failed to parse GPT response:', responseText);
            throw new Error('Invalid response format from GPT');
        }
        const category = parsedResponse.category?.toLowerCase() || 'discovery';
        const suggestion = parsedResponse.suggestion || '';
        const intent = parsedResponse.intent?.toLowerCase() || 'explore';
        const language = parsedResponse.language || 'en';
        if (!suggestion.trim()) {
            console.log('Empty suggestion received, skipping');
            return;
        }
        const suggestionKey = `${category}:${suggestion.substring(0, 30)}`;
        if (recentSuggestions.has(suggestionKey)) {
            console.log('Duplicate suggestion, skipping');
            return;
        }
        recentSuggestions.add(suggestionKey);
        setTimeout(() => recentSuggestions.delete(suggestionKey), CACHE_DURATION_MS);
        conversationHistory.push({ role: 'user', content: transcript });
        conversationHistory.push({ role: 'assistant', content: suggestion });
        if (conversationHistory.length > MAX_HISTORY * 2)
            conversationHistory.splice(0, 2);
        const emoji = CATEGORY_EMOJI[category] || '💡';
        ws.send(JSON.stringify({
            type: 'suggestion.start',
            id: suggestionId,
            category,
            intent,
            language,
            emoji,
        }));
        const words = suggestion.split(' ');
        for (let i = 0; i < words.length; i++) {
            ws.send(JSON.stringify({
                type: 'suggestion.delta',
                id: suggestionId,
                textChunk: (i > 0 ? ' ' : '') + words[i],
            }));
            await new Promise((r) => setTimeout(r, 50));
        }
        ws.send(JSON.stringify({
            type: 'suggestion.end',
            id: suggestionId,
            fullText: suggestion,
            category,
            intent,
        }));
        console.log(`🤖 [${category}/${intent}] ${language}: ${suggestion}`);
        if (onSuggestionGenerated)
            await onSuggestionGenerated(category, suggestion);
    }
    catch (error) {
        const isTimeout = error?.message?.includes('timeout');
        console.error(`Error generating GPT suggestion${isTimeout ? ' (timeout)' : ''}:`, error);
        ws.send(JSON.stringify({
            type: 'error',
            message: isTimeout
                ? 'Timeout generazione suggerimento - riprova tra poco'
                : 'Errore nella generazione del suggerimento',
            reason: isTimeout ? 'timeout' : 'unknown'
        }));
    }
}
async function getHistoricalSuggestions(userId, sessionId, limit = 10) {
    try {
        let query = supabase
            .from('sales_events')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (sessionId)
            query = query.eq('session_id', sessionId);
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching historical suggestions:', error);
            return [];
        }
        return data || [];
    }
    catch (error) {
        console.error('Error in getHistoricalSuggestions:', error);
        return [];
    }
}
async function analyzeSuggestionPerformance(userId) {
    try {
        const { data, error } = await supabase
            .from('sales_events')
            .select('category, confidence, feedback')
            .eq('user_id', userId);
        if (error || !data)
            return null;
        const stats = {
            total: data.length,
            byCategory: {},
            averageConfidence: 0,
            withPositiveFeedback: 0,
        };
        let totalConfidence = 0;
        for (const event of data) {
            if (!stats.byCategory[event.category])
                stats.byCategory[event.category] = 0;
            stats.byCategory[event.category]++;
            totalConfidence += event.confidence || 0;
            if (event.feedback === true)
                stats.withPositiveFeedback++;
        }
        stats.averageConfidence = data.length > 0 ? totalConfidence / data.length : 0;
        stats.feedbackRate = data.length > 0 ? stats.withPositiveFeedback / data.length : 0;
        return stats;
    }
    catch (error) {
        console.error('Error analyzing performance:', error);
        return null;
    }
}
exports.default = {
    handleGPTSuggestion,
    getHistoricalSuggestions,
    analyzeSuggestionPerformance,
};
//# sourceMappingURL=gpt-handler.js.map