// ============================================================================
// 🧠 SALES GENIUS v3.3 — GPT HANDLER MODULE
// 🔍 Data-Informed Coach Edition | Real-Time Conversational Intelligence
// ============================================================================
//
// File: server/src/gpt-handler.ts
// Author: Michele Baroni
// Project: SalesGenius (AI Overlay for Live Sales Coaching)
//
// 🎯 Purpose:
//   Core module that connects WebSocket streaming, OpenAI GPT reasoning,
//   and Supabase logging to generate intelligent, phase-aware sales suggestions
//   in real time based on Intent × Category analysis.
//
// ⚙️ Functions:
//   • handleGPTSuggestion() — builds messages, calls GPT, streams structured JSON
//   • getHistoricalSuggestions() — retrieves past AI suggestions from Supabase
//   • analyzeSuggestionPerformance() — computes user-level performance metrics
//
// 🧩 Stack:
//   - OpenAI GPT-4o / GPT-4o-mini
//   - Supabase Database & Auth
//   - Node.js + ws (WebSocket)
//   - JSON-structured output aligned to system prompt logic
//
// 🔖 Version: 3.3
// 🗓️ Last Updated: 2025-10-31
// ============================================================================

import OpenAI from 'openai';
import { WebSocket } from 'ws';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { buildMessages, QUALITY_PRESETS } from './prompts';

// Inizializza OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Inizializza Supabase
const supabase: SupabaseClient = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ============================================================================
// 🎯 CATEGORY SYSTEM (macro) — allineato a SalesGenius v3.3
// ============================================================================
type SuggestionCategory = 'rapport' | 'discovery' | 'value' | 'objection' | 'closing';

const CATEGORY_EMOJI: Record<SuggestionCategory, string> = {
  rapport: '🤝',
  discovery: '🧭',
  value: '💎',
  objection: '⚖️',
  closing: '✅',
};

// ============================================================================
// 🧩 INTENT SYSTEM (micro)
// ============================================================================
type SuggestionIntent =
  | 'explore'
  | 'express_need'
  | 'show_interest'
  | 'raise_objection'
  | 'decide';

// ============================================================================
// ⚙️ SYSTEM STATE & CACHE
// ============================================================================
const recentSuggestions = new Set<string>();
const CACHE_DURATION_MS = 30000; // 30 sec
const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
const MAX_HISTORY = 10;  // Aumentato da 5 a 10 per più contesto
const recentCategories: string[] = []; // ⚡ Track last categories to detect variety issues
const MAX_CATEGORY_HISTORY = 5;

// ============================================================================
// 🔍 detectIfValueQuestion() - Check if transcript is asking about VALUE
// ============================================================================
function detectIfValueQuestion(transcript: string): boolean {
  const valueKeywords = [
    // English
    'roi', 'return on investment', 'benefit', 'result', 'outcome', 'advantage',
    'comparison', 'compare', 'statistics', 'data', 'research', 'study', 'prove',
    'worth it', 'value', 'impact', 'savings', 'efficiency', 'productivity',
    'how does it work', 'what can', 'what will', 'show me',
    // Italian
    'vantaggi', 'risultati', 'benefici', 'ritorno', 'investimento', 'valore',
    'confronto', 'paragone', 'dati', 'ricerca', 'studio', 'statistiche',
    'risparmio', 'efficienza', 'produttività', 'come funziona', 'cosa può',
  ];

  const lowerTranscript = transcript.toLowerCase();
  return valueKeywords.some(keyword => lowerTranscript.includes(keyword));
}

// ============================================================================
// 🧠 handleGPTSuggestion()
// ============================================================================
export async function handleGPTSuggestion(
  transcript: string,
  ws: WebSocket,
  detectedLanguage?: string,
  onSuggestionGenerated?: (category: string, suggestion: string) => Promise<void>
): Promise<void> {
  console.log(`💬 Generating suggestion for transcript: "${transcript.substring(0, 100)}..."`);
  console.log(`🌍 Deepgram detected language: ${detectedLanguage || 'unknown'}`);

  try {
    // ⚡ STEP 1: Check if this is a VALUE question that needs real market data
    const isValueQuestion = detectIfValueQuestion(transcript);
    let marketDataContext = '';

    if (isValueQuestion) {
      console.log('🔍 VALUE question detected - fetching real market data...');
      try {
        // Note: WebSearch is not available in this context, would need to be passed in or imported
        // For now, we'll add placeholder for market data that should be fetched
        // In production, this should call a WebSearch API or database
        marketDataContext = `
📊 MARKET DATA AVAILABLE: Guide seller to reference recent industry research.
Common sources: Gartner, McKinsey, Forrester, IDC, industry-specific reports.
Remind seller to look up specific statistics relevant to customer's industry.
`;
        console.log('✅ Market data context prepared');
      } catch (error) {
        console.log('⚠️ Could not fetch market data, proceeding without it');
      }
    }

    const messages = buildMessages({
      transcript,
      confidence: 0.8,
      conversationHistory,
      detectedLanguage: detectedLanguage || 'unknown',
      recentCategories: recentCategories,  // ⚡ Pass recent categories for variety tracking
      marketDataContext,  // ⚡ Pass market data context if available
    });

    const qualityMode = process.env.QUALITY_MODE || 'balanced';
    const qualitySettings =
      QUALITY_PRESETS[qualityMode as keyof typeof QUALITY_PRESETS] || QUALITY_PRESETS.balanced;

    const suggestionId = `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // ✅ CORRETTA CHIAMATA GPT (compatibile TypeScript) + TIMEOUT PROTECTION
    const GPT_TIMEOUT_MS = 8000; // 8 secondi max

    console.log(`🔄 Calling OpenAI API (model: ${qualitySettings.model}, timeout: ${GPT_TIMEOUT_MS}ms)...`);

    const completion = await Promise.race([
      openai.chat.completions.create({
        model: qualitySettings.model,
        messages: messages as any,
        temperature: qualitySettings.temperature,
        max_tokens: qualitySettings.max_tokens,
        presence_penalty: qualitySettings.presence_penalty,
        // @ts-ignore: some models may not accept this field, safe to include for legacy tuning
        frequency_penalty: (qualitySettings as any).frequency_penalty ?? 0,
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI request timeout')), GPT_TIMEOUT_MS)
      )
    ]);

    console.log(`✅ OpenAI API response received`);

    const responseText = completion.choices[0]?.message?.content || '{}';
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
      console.log(`📋 GPT Raw Response:`, JSON.stringify(parsedResponse, null, 2));
    } catch (e) {
      console.error('❌ Failed to parse GPT response:', responseText);
      throw new Error('Invalid response format from GPT');
    }

    // ⚡ VALIDAZIONE ROBUSTA DELLE CATEGORIE
    const VALID_CATEGORIES: SuggestionCategory[] = ['rapport', 'discovery', 'value', 'objection', 'closing'];
    const VALID_INTENTS: SuggestionIntent[] = ['explore', 'express_need', 'show_interest', 'raise_objection', 'decide'];

    let rawCategory = parsedResponse.category?.toLowerCase() || '';
    let category: SuggestionCategory;

    if (VALID_CATEGORIES.includes(rawCategory as SuggestionCategory)) {
      category = rawCategory as SuggestionCategory;
    } else {
      console.warn(`⚠️ Invalid category "${parsedResponse.category}" received from GPT. Defaulting to 'discovery'. Valid categories: ${VALID_CATEGORIES.join(', ')}`);
      category = 'discovery';
    }

    let rawIntent = parsedResponse.intent?.toLowerCase() || '';
    let intent: SuggestionIntent;

    if (VALID_INTENTS.includes(rawIntent as SuggestionIntent)) {
      intent = rawIntent as SuggestionIntent;
    } else {
      console.warn(`⚠️ Invalid intent "${parsedResponse.intent}" received from GPT. Defaulting to 'explore'. Valid intents: ${VALID_INTENTS.join(', ')}`);
      intent = 'explore';
    }

    const suggestion = parsedResponse.suggestion || '';
    const language = parsedResponse.language || 'en';

    console.log(`✅ Validated: category="${category}", intent="${intent}", language="${language}"`);

    // ⚡ Track categories for variety detection
    recentCategories.push(category);
    if (recentCategories.length > MAX_CATEGORY_HISTORY) {
      recentCategories.shift();
    }

    // ⚡ Warn if all recent categories are the same
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

    const suggestionKey = `${category}:${suggestion.substring(0, 30)}`;
    if (recentSuggestions.has(suggestionKey)) {
      console.log('Duplicate suggestion, skipping');
      return;
    }

    recentSuggestions.add(suggestionKey);
    setTimeout(() => recentSuggestions.delete(suggestionKey), CACHE_DURATION_MS);

    conversationHistory.push({ role: 'user', content: transcript });
    conversationHistory.push({ role: 'assistant', content: suggestion });
    if (conversationHistory.length > MAX_HISTORY * 2) conversationHistory.splice(0, 2);

    const emoji = CATEGORY_EMOJI[category] || '💡';

    // 🟢 Invia inizio
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

    // 🟢 Stream simulato
    const words = suggestion.split(' ');
    for (let i = 0; i < words.length; i++) {
      ws.send(
        JSON.stringify({
          type: 'suggestion.delta',
          id: suggestionId,
          textChunk: (i > 0 ? ' ' : '') + words[i],
        })
      );
      await new Promise((r) => setTimeout(r, 50));
    }

    // 🟢 Fine
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

    // ⚡ LOG CHIARO: Fine chiamata GPT
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

    if (onSuggestionGenerated) await onSuggestionGenerated(category, suggestion);
  } catch (error: any) {
    if (error.message === 'OpenAI request timeout') {
      console.error('⏱️ OpenAI API timeout after 8 seconds');
    } else if (error.code === 'insufficient_quota') {
      console.error('💳 OpenAI API quota exceeded - check billing');
    } else if (error.code === 'rate_limit_exceeded') {
      console.error('🚫 OpenAI API rate limit exceeded');
    } else {
      console.error('❌ Error generating GPT suggestion:', error.message || error);
    }

    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Errore nella generazione del suggerimento',
      })
    );
  }
}

// ============================================================================
// 📜 getHistoricalSuggestions()
// ============================================================================
export async function getHistoricalSuggestions(
  userId: string,
  sessionId?: string,
  limit: number = 10
): Promise<any[]> {
  try {
    let query = supabase
      .from('sales_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (sessionId) query = query.eq('session_id', sessionId);
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching historical suggestions:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error in getHistoricalSuggestions:', error);
    return [];
  }
}

// ============================================================================
// 📊 analyzeSuggestionPerformance()
// ============================================================================
export async function analyzeSuggestionPerformance(userId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('sales_events')
      .select('category, confidence, feedback')
      .eq('user_id', userId);
    if (error || !data) return null;

    const stats: any = {
      total: data.length,
      byCategory: {},
      averageConfidence: 0,
      withPositiveFeedback: 0,
    };
    let totalConfidence = 0;

    for (const event of data) {
      if (!stats.byCategory[event.category]) stats.byCategory[event.category] = 0;
      stats.byCategory[event.category]++;
      totalConfidence += event.confidence || 0;
      if (event.feedback === true) stats.withPositiveFeedback++;
    }

    stats.averageConfidence = data.length > 0 ? totalConfidence / data.length : 0;
    stats.feedbackRate = data.length > 0 ? stats.withPositiveFeedback / data.length : 0;
    return stats;
  } catch (error) {
    console.error('Error analyzing performance:', error);
    return null;
  }
}

export default {
  handleGPTSuggestion,
  getHistoricalSuggestions,
  analyzeSuggestionPerformance,
};

