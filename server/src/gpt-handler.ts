// server/src/gpt-handler.ts
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

// Categorie di suggerimenti
type SuggestionCategory = 'conversational' | 'value' | 'closing' | 'market';

// Mappa emoji per categorie
const CATEGORY_EMOJI: Record<SuggestionCategory, string> = {
  conversational: '🎧',
  value: '💎',
  closing: '✅',
  market: '🌐'
};

// Cache per evitare suggerimenti duplicati
const recentSuggestions = new Set<string>();
const CACHE_DURATION_MS = 30000; // 30 secondi

// Buffer per la cronologia della conversazione
const conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];
const MAX_HISTORY = 5;

/**
 * Gestisce la generazione di suggerimenti con GPT usando il sistema di prompt
 */
export async function handleGPTSuggestion(
  transcript: string,
  ws: WebSocket,
  onSuggestionGenerated?: (category: string, suggestion: string) => Promise<void>
): Promise<void> {
  try {
    // Prepara i messaggi usando il sistema di prompt
    const messages = buildMessages({
      transcript,
      confidence: 0.8,
      conversationHistory: conversationHistory,
    });

    // Ottieni la configurazione di qualità
    const qualityMode = process.env.QUALITY_MODE || 'balanced';
    const qualitySettings = QUALITY_PRESETS[qualityMode as keyof typeof QUALITY_PRESETS] || QUALITY_PRESETS.balanced;

    // ID unico per questo suggerimento
    const suggestionId = `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Chiama OpenAI
    const completion = await openai.chat.completions.create({
      model: qualitySettings.model,
      messages: messages as any,
      temperature: qualitySettings.temperature,
      max_tokens: qualitySettings.max_tokens,
      presence_penalty: qualitySettings.presence_penalty,
      frequency_penalty: qualitySettings.frequency_penalty,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse GPT response:', responseText);
      throw new Error('Invalid response format from GPT');
    }

    // Estrai i dati dalla risposta
    const category = parsedResponse.category || 'conversational';
    const suggestion = parsedResponse.suggestion || '';
    const intent = parsedResponse.intent || '';
    const language = parsedResponse.language || 'it';

    // Verifica che il suggerimento non sia vuoto
    if (!suggestion || suggestion.trim().length === 0) {
      console.log('Empty suggestion received, skipping');
      return;
    }

    // Controlla duplicati
    const suggestionKey = `${category}:${suggestion.substring(0, 30)}`;
    if (recentSuggestions.has(suggestionKey)) {
      console.log('Duplicate suggestion, skipping');
      return;
    }

    // Aggiungi alla cache
    recentSuggestions.add(suggestionKey);
    setTimeout(() => recentSuggestions.delete(suggestionKey), CACHE_DURATION_MS);

    // Aggiungi alla cronologia
    conversationHistory.push({ role: 'user', content: transcript });
    conversationHistory.push({ role: 'assistant', content: suggestion });
    if (conversationHistory.length > MAX_HISTORY * 2) {
      conversationHistory.splice(0, 2);
    }

    // Invia al client con streaming simulato
    const emoji = CATEGORY_EMOJI[category as SuggestionCategory] || '💡';
    
    // Invia inizio
    ws.send(JSON.stringify({
      type: 'suggestion.start',
      id: suggestionId,
      category,
      intent,
      language,
      emoji
    }));

    // Simula streaming del testo (dividi in chunks)
    const words = suggestion.split(' ');
    let currentText = '';
    
    for (let i = 0; i < words.length; i++) {
      currentText += (i > 0 ? ' ' : '') + words[i];
      
      ws.send(JSON.stringify({
        type: 'suggestion.delta',
        id: suggestionId,
        textChunk: (i > 0 ? ' ' : '') + words[i]
      }));
      
      // Piccolo delay per simulare streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Invia fine
    ws.send(JSON.stringify({
      type: 'suggestion.end',
      id: suggestionId,
      fullText: suggestion,
      category,
      intent
    }));

    console.log(`🤖 [${category}/${intent}] ${language}: ${suggestion}`);

    // Callback per salvare nel database
    if (onSuggestionGenerated) {
      await onSuggestionGenerated(category, suggestion);
    }

  } catch (error) {
    console.error('Error generating GPT suggestion:', error);
    
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Errore nella generazione del suggerimento'
    }));
  }
}

/**
 * Recupera suggerimenti storici per migliorare le raccomandazioni
 */
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

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

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

/**
 * Analizza le performance dei suggerimenti
 */
export async function analyzeSuggestionPerformance(userId: string): Promise<any> {
  try {
    // Recupera tutti i suggerimenti dell'utente
    const { data, error } = await supabase
      .from('sales_events')
      .select('category, confidence, feedback')
      .eq('user_id', userId);

    if (error || !data) {
      return null;
    }

    // Calcola statistiche per categoria
    const stats: any = {
      total: data.length,
      byCategory: {},
      averageConfidence: 0,
      withPositiveFeedback: 0
    };

    let totalConfidence = 0;

    for (const event of data) {
      // Conta per categoria
      if (!stats.byCategory[event.category]) {
        stats.byCategory[event.category] = 0;
      }
      stats.byCategory[event.category]++;

      // Somma confidence
      totalConfidence += event.confidence || 0;

      // Conta feedback positivi
      if (event.feedback === true) {
        stats.withPositiveFeedback++;
      }
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
  analyzeSuggestionPerformance
};

