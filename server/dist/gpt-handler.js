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
const core_1 = require("@tavily/core");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const tavilyClient = (0, core_1.tavily)({ apiKey: process.env.TAVILY_API_KEY });
const CATEGORY_EMOJI = {
    rapport: '🤝',
    discovery: '🧭',
    value: '💎',
    objection: '⚖️',
    closing: '✅',
};
const recentSuggestions = new Set();
const CACHE_DURATION_MS = 300000;
const conversationHistory = [];
const MAX_HISTORY = 10;
const recentCategories = [];
const MAX_CATEGORY_HISTORY = 5;
const recentSuggestionTexts = [];
const MAX_RECENT_SUGGESTIONS = 10;
function detectIfValueQuestion(transcript) {
    const valueKeywords = [
        'roi', 'return on investment', 'benefit', 'result', 'outcome', 'advantage', 'value proposition',
        'savings', 'efficiency gains', 'productivity improvement', 'performance metrics',
        'comparison', 'compare to', 'versus', 'better than', 'how does it compare',
        'statistics', 'metrics', 'research', 'study', 'prove', 'evidence', 'data shows',
        'worth it', 'justify', 'impact', 'business case', 'improvement',
        'what can we expect', 'what will we get', 'show me', 'demonstrate', 'proof',
        'vantaggi', 'risultati attesi', 'benefici', 'ritorno investimento', 'valore',
        'risparmio', 'efficienza', 'produttività', 'prestazioni',
        'confronto con', 'paragone', 'meglio di', 'come si confronta',
        'dati', 'metriche', 'ricerca', 'studio', 'statistiche', 'prove', 'evidenze',
        'vale la pena', 'giustificare', 'impatto', 'miglioramento',
        'cosa possiamo aspettarci', 'cosa otterremo', 'mostrami', 'dimostra', 'prova',
    ];
    const lowerTranscript = transcript.toLowerCase();
    const matched = valueKeywords.some(keyword => lowerTranscript.includes(keyword));
    if (matched) {
        console.log(`✅ VALUE keywords detected in: "${transcript.substring(0, 80)}..."`);
    }
    return matched;
}
async function handleGPTSuggestion(transcript, ws, detectedLanguage, onSuggestionGenerated) {
    console.log(`💬 Generating suggestion for transcript: "${transcript.substring(0, 100)}..."`);
    console.log(`🌍 Deepgram detected language: ${detectedLanguage || 'unknown'}`);
    try {
        const isValueQuestion = detectIfValueQuestion(transcript);
        let marketDataContext = '';
        console.log(`🔎 VALUE question check: ${isValueQuestion ? 'YES - Will fetch Tavily data' : 'NO - Skipping Tavily'}`);
        if (isValueQuestion) {
            console.log('🔍 VALUE question detected - fetching real market data from Tavily...');
            console.log(`🔑 Tavily API Key present: ${process.env.TAVILY_API_KEY ? 'YES' : 'NO'}`);
            try {
                const searchQuery = `B2B sales ROI statistics industry benchmarks ${transcript.substring(0, 100)}`;
                console.log(`📡 Tavily search query: "${searchQuery}"`);
                console.log(`⏱️  Starting Tavily API call with 5s timeout...`);
                const searchPromise = tavilyClient.search(searchQuery, {
                    searchDepth: 'basic',
                    maxResults: 3,
                    includeAnswer: true,
                });
                const searchTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Tavily search timeout')), 5000));
                const response = await Promise.race([searchPromise, searchTimeout]);
                console.log(`✅ Tavily API call completed successfully`);
                console.log(`✅ Tavily returned ${response.results?.length || 0} results`);
                if (response.results && response.results.length > 0) {
                    const sources = response.results.map((r) => ({
                        title: r.title,
                        url: r.url,
                        content: r.content?.substring(0, 200) || '',
                        score: r.score
                    }));
                    marketDataContext = `
📊 REAL MARKET DATA (from Tavily Web Search):

${response.answer ? `Quick Answer: ${response.answer}\n` : ''}
Sources found:
${sources.map((s, i) => `${i + 1}. ${s.title}
   Source: ${s.url}
   Data: ${s.content}
`).join('\n')}

⚠️ IMPORTANT: Use these REAL statistics in your suggestion. Cite the source URLs.
Guide seller to reference these specific data points when answering customer.
`;
                    console.log('✅ Market data context prepared with real Tavily results');
                }
                else {
                    marketDataContext = `
📊 MARKET DATA: Guide seller to reference recent industry research.
Common sources: Gartner, McKinsey, Forrester, IDC, industry-specific reports.
Remind seller to look up specific statistics relevant to customer's industry.
`;
                    console.log('⚠️ Tavily returned no results, using generic guidance');
                }
            }
            catch (error) {
                console.error(`❌ Tavily search FAILED!`);
                console.error(`   Error type: ${error.constructor.name}`);
                console.error(`   Error message: ${error.message}`);
                console.error(`   Full error:`, error);
                console.log(`⚠️ Proceeding without market data`);
                marketDataContext = '';
            }
        }
        else {
            console.log(`ℹ️  No VALUE keywords detected, skipping Tavily search`);
        }
        const messages = (0, prompts_1.buildMessages)({
            transcript,
            confidence: 0.8,
            conversationHistory,
            detectedLanguage: detectedLanguage || 'unknown',
            recentCategories: recentCategories,
            marketDataContext,
            recentSuggestions: recentSuggestionTexts,
        });
        const qualityMode = process.env.QUALITY_MODE || 'balanced';
        const qualitySettings = prompts_1.QUALITY_PRESETS[qualityMode] || prompts_1.QUALITY_PRESETS.balanced;
        const suggestionId = `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const GPT_TIMEOUT_MS = 8000;
        console.log(`🔄 Calling OpenAI API (model: ${qualitySettings.model}, timeout: ${GPT_TIMEOUT_MS}ms)...`);
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI request timeout')), GPT_TIMEOUT_MS))
        ]);
        console.log(`✅ OpenAI API response received`);
        const responseText = completion.choices[0]?.message?.content || '{}';
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseText);
            console.log(`📋 GPT Raw Response:`, JSON.stringify(parsedResponse, null, 2));
        }
        catch (e) {
            console.error('❌ Failed to parse GPT response:', responseText);
            throw new Error('Invalid response format from GPT');
        }
        const VALID_CATEGORIES = ['rapport', 'discovery', 'value', 'objection', 'closing'];
        const VALID_INTENTS = ['explore', 'express_need', 'show_interest', 'raise_objection', 'decide'];
        let rawCategory = parsedResponse.category?.toLowerCase() || '';
        let category;
        if (VALID_CATEGORIES.includes(rawCategory)) {
            category = rawCategory;
        }
        else {
            console.warn(`⚠️ Invalid category "${parsedResponse.category}" received from GPT. Defaulting to 'discovery'. Valid categories: ${VALID_CATEGORIES.join(', ')}`);
            category = 'discovery';
        }
        let rawIntent = parsedResponse.intent?.toLowerCase() || '';
        let intent;
        if (VALID_INTENTS.includes(rawIntent)) {
            intent = rawIntent;
        }
        else {
            console.warn(`⚠️ Invalid intent "${parsedResponse.intent}" received from GPT. Defaulting to 'explore'. Valid intents: ${VALID_INTENTS.join(', ')}`);
            intent = 'explore';
        }
        const suggestion = parsedResponse.suggestion || '';
        const language = parsedResponse.language || 'en';
        console.log(`✅ Validated: category="${category}", intent="${intent}", language="${language}"`);
        recentCategories.push(category);
        if (recentCategories.length > MAX_CATEGORY_HISTORY) {
            recentCategories.shift();
        }
        if (recentCategories.length >= 3) {
            const uniqueCategories = new Set(recentCategories);
            if (uniqueCategories.size === 1) {
                console.warn(`⚠️⚠️⚠️ VARIETY PROBLEM: Last ${recentCategories.length} suggestions all used category "${category}"!`);
                console.warn(`   Recent categories: [${recentCategories.join(', ')}]`);
                console.warn(`   GPT is not varying categories! Check if prompts are too generic.`);
            }
        }
        if (!suggestion.trim()) {
            console.log('Empty suggestion received, skipping');
            return;
        }
        const suggestionKey = `${category}:${suggestion.substring(0, 60)}`;
        if (recentSuggestions.has(suggestionKey)) {
            console.log(`⚠️ Duplicate suggestion detected, skipping: "${suggestion.substring(0, 50)}..."`);
            return;
        }
        recentSuggestions.add(suggestionKey);
        setTimeout(() => recentSuggestions.delete(suggestionKey), CACHE_DURATION_MS);
        recentSuggestionTexts.push(suggestion);
        if (recentSuggestionTexts.length > MAX_RECENT_SUGGESTIONS) {
            recentSuggestionTexts.shift();
        }
        conversationHistory.push({ role: 'user', content: transcript });
        conversationHistory.push({ role: 'assistant', content: suggestion });
        if (conversationHistory.length > MAX_HISTORY * 2)
            conversationHistory.splice(0, 2);
        const emoji = CATEGORY_EMOJI[category] || '💡';
        const startMessage = {
            type: 'suggestion.start',
            id: suggestionId,
            category,
            intent,
            language,
            emoji,
        };
        console.log(`📤 Sending to FRONTEND - suggestion.start:`, JSON.stringify(startMessage, null, 2));
        ws.send(JSON.stringify(startMessage));
        const words = suggestion.split(' ');
        for (let i = 0; i < words.length; i++) {
            ws.send(JSON.stringify({
                type: 'suggestion.delta',
                id: suggestionId,
                textChunk: (i > 0 ? ' ' : '') + words[i],
            }));
            await new Promise((r) => setTimeout(r, 50));
        }
        const endMessage = {
            type: 'suggestion.end',
            id: suggestionId,
            fullText: suggestion,
            category,
            intent,
        };
        console.log(`📤 Sending to FRONTEND - suggestion.end:`, JSON.stringify(endMessage, null, 2));
        ws.send(JSON.stringify(endMessage));
        console.log(`🤖 [${category}/${intent}] ${language}: ${suggestion}`);
        console.log('\n' + '='.repeat(80));
        console.log('🤖 CHIAMATA GPT - COMPLETATA');
        console.log('='.repeat(80));
        console.log(`✅ Category: ${category}`);
        console.log(`✅ Intent: ${intent}`);
        console.log(`✅ Language (GPT detected): ${language}`);
        console.log(`   ℹ️  GPT analyzed the TEXT content to determine this language`);
        console.log(`   ℹ️  If Deepgram detected different language, GPT correction is applied`);
        console.log(`✅ Suggestion: "${suggestion}"`);
        console.log(`📊 Recent categories (variety check): [${recentCategories.join(', ')}]`);
        console.log('='.repeat(80) + '\n');
        if (onSuggestionGenerated)
            await onSuggestionGenerated(category, suggestion);
    }
    catch (error) {
        if (error.message === 'OpenAI request timeout') {
            console.error('⏱️ OpenAI API timeout after 8 seconds');
        }
        else if (error.code === 'insufficient_quota') {
            console.error('💳 OpenAI API quota exceeded - check billing');
        }
        else if (error.code === 'rate_limit_exceeded') {
            console.error('🚫 OpenAI API rate limit exceeded');
        }
        else {
            console.error('❌ Error generating GPT suggestion:', error.message || error);
        }
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Errore nella generazione del suggerimento',
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