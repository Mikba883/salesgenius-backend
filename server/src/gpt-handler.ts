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
//
// 1. rapport      → Rapport & Opening
// 2. discovery    → Discovery & Qualification
// 3. value        → Value Discussion
// 4. objection    → Objection & Negotiation
// 5. closing      → Closing & Follow-Up
//
type SuggestionCategory = 'rapport' | 'discovery' | 'value' | 'objection' | 'closing';

// Emoji mapping per overlay visivo
const CATEGORY_EMOJI: Record<SuggestionCategory, string> = {
  rapport: '🤝',
  discovery: '🧭',
  value: '💎',
  objection: '⚖️',
  closing: '✅',
};

// ============================================================================
// 🧩 INTENT SYSTEM (micro) — allineato al framework SalesGenius
// ============================================================================
//
// 1. explore       → Customer asks a question or seeks clarification
// 2. express_need  → States a goal, problem, or pain point
// 3. show_interest → Displays curiosity or alignment
// 4. raise_objection→ Expresses doubt or disagreement
// 5. decide        → Indicates readiness or decision
//
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
const CACHE_DURATION_MS = 30000; // 30 secondi
const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
const MAX_HISTORY = 5;

// ============================================================================
// 🧠 handleGPTSuggestion()
// Core: genera suggerimento e lo streamma in tempo reale via WebSocket
// ============================================================================
export async function handleGPTSuggestion(
  transcript: string,
  ws: WebSocket,
  onSuggestionGenerated?: (category: string, suggestion: string) => Promise<void>
): Promise<void> {
  try {
    const messages = buildMessages({
      transcript,
      confidence: 0.8,
      conversationHistory,
    });

    const qualityMode = process.env.QUALITY_MODE || 'balanced';
    const qualitySettings =
      QUALITY_PRESETS[qualityMode as keyof typeof QUALITY_PRESETS] || QUALITY_PRESETS.balanced;

    const suggestionId = `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const completion = await openai.chat.completions.create({
      model: qualitySettings.model,
      messages: messages as any,
      temperature: qualitySettings.temperature,
      max_tokens: qualitySettings.max_tokens,
      presence_penalty: qualitySettings.presence_penalty,
      frequency_penalty: qualitySettings.frequency_penalty,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse GPT response:', responseText);
      throw new Error('Invalid response format from GPT');
    }

    // Estratti principali
    const category: SuggestionCategory = parsedResponse.category?.toLowerCase() || 'discovery';
    const suggestion = parsedResponse.suggestion || '';
    const intent: SuggestionIntent = parsedResponse.intent?.toLowerCase() || 'explore';
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

    // aggiorna cronologia
    conversationHistory.push({ role: 'user', content: transcript });
    conversationHistory.push({ role: 'assistant', content: suggestion });
    if (conversationHistory.length > MAX_HISTORY * 2) conversationHistory.splice(0, 2);

    // invia suggerimento al client via WebSocket (stream simulato)
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
      await new Promise(r => setTimeout(r, 50));
    }

    ws.send(JSON.stringify({
      type: 'suggestion.end',
      id: suggestionId,
      fullText: suggestion,
      category,
      intent,
    }));

    console.log(`🤖 [${category}/${intent}] ${language}: ${suggestion}`);

    if (onSuggestionGenerated) await onSuggestionGenerated(category, suggestion);
  } catch (error) {
    console.error('Error generating GPT suggestion:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Errore nella generazione del suggerimento',
    }));
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

