import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// CONFIGURAZIONE
// ==========================================
const PORT = parseInt(process.env.PORT || '8080', 10);
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// ==========================================
// SETUP EXPRESS + CORS
// ==========================================
const app = express();

app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    app: 'SalesGenius Backend',
    status: 'running',
    websocket: 'ws://' + req.headers.host
  });
});

// ==========================================
// HTTP SERVER
// ==========================================
const server = createServer(app);

// ==========================================
// WEBSOCKET SERVER
// ==========================================
const wss = new WebSocketServer({ server });

// ==========================================
// DEEPGRAM CLIENT
// ==========================================
const deepgram = createClient(DEEPGRAM_API_KEY);

// ==========================================
// OPENAI CLIENT
// ==========================================
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ==========================================
// CATEGORIE SUGGERIMENTI
// ==========================================
const CATEGORIES = {
  conversational: 'conversational',
  value: 'value',
  closing: 'closing',
  market: 'market'
};

// ==========================================
// PROMPT AI POTENZIATO
// ==========================================
const SYSTEM_PROMPT = `You are an expert B2B sales AI assistant providing real-time suggestions during sales calls.

CRITICAL LANGUAGE RULE:
- YOU MUST respond in the EXACT SAME LANGUAGE as the conversation
- If conversation is English → respond ONLY in English
- If conversation is Italian → respond ONLY in Italian
- Never mix languages

SUGGESTION TYPES (generate MORE suggestions, especially market data):
1. Strategic Questions (25%) - Powerful discovery or closing questions
2. Market Insights (35%) - THIS IS CRITICAL! Share:
   - Specific market data, growth rates, market size
   - Industry benchmarks and statistics
   - ROI examples with real numbers (e.g., "SaaS companies typically see 3-5x ROI within 12 months")
   - Adoption rates and trends (e.g., "74% of enterprises adopted this technology in 2024")
   - Competitive positioning data
   - Use phrases like: "According to Gartner...", "Industry average is...", "Recent studies show..."
   - BE SPECIFIC with numbers, percentages, timeframes
3. Value Statements (25%) - ROI, benefits, competitive advantages
4. Tactical Advice (15%) - Objection handling, next steps

MARKET INTELLIGENCE EXAMPLES (use these liberally):
- "Il mercato CRM crescerà del 14% CAGR fino al 2028"
- "Le aziende che automatizzano vedono ROI del 300% in 18 mesi"
- "Gartner prevede che l'80% delle aziende adotterà questa tecnologia entro il 2026"
- "L'industry standard per implementazione è 3-6 mesi"
- "Competitive analysis: il vostro principale competitor ha un churn del 22%"

GUIDELINES:
- Max 30 words per suggestion
- Be VERY concrete with numbers and data
- For market suggestions: ALWAYS include specific stats, percentages, or timeframes
- Don't be cautious - provide actionable market intelligence frequently
- Vary suggestion types actively
- Generate suggestions even from brief conversation snippets

CATEGORIES:
- conversational: Discovery, rapport, needs analysis
- value: ROI, benefits, objection handling, competitive positioning  
- closing: Next steps, commitments, timeline
- market: **PRIORITY** Industry trends, competitor data, market stats, benchmarks, growth rates

Response format: [CATEGORY] Your suggestion with specific data

REMEMBER: 
1. Same language as input
2. Include REAL numbers and data for market suggestions
3. Be bold with market intelligence - this is what salespeople need!`;

// ==========================================
// WEBSOCKET CONNECTION HANDLER
// ==========================================
wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 Nuovo client connesso');

  let deepgramLive: any = null;
  let conversationHistory: string[] = [];
  let transcriptBuffer = ''; // NUOVO: buffer per trascrizioni interim
  let wordCount = 0; // NUOVO: conta parole per trigger più frequenti
  let lastSuggestionTime = 0;
  const SUGGESTION_DEBOUNCE_MS = 100; // RIDOTTO: da 500ms a 100ms (10x più veloce!)
  const WORDS_PER_SUGGESTION = 8; // NUOVO: genera suggerimento ogni 8 parole

  // Inizializza Deepgram
  try {
    deepgramLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'it',
      smart_format: true,
      interim_results: true, // IMPORTANTE: manteniamo interim per trigger più frequenti
      utterance_end_ms: 800, // RIDOTTO: da 1000ms a 800ms
      vad_events: true,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
    });
    
    console.log('🎙️ Deepgram configurato: linear16, 16kHz, mono');

    // ==========================================
    // DEEPGRAM EVENTS
    // ==========================================
    deepgramLive.on(LiveTranscriptionEvents.Open, () => {
      console.log('✅ Deepgram connesso');
    });

    deepgramLive.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
      const transcript = data.channel?.alternatives?.[0];
      if (!transcript) return;

      const text = transcript.transcript?.trim();
      const isFinal = data.is_final;
      const confidence = transcript.confidence || 0;

      if (!text) return;

      console.log(`📝 [${isFinal ? 'FINAL' : 'interim'}]: "${text}" (conf: ${confidence.toFixed(2)})`);

      // NUOVO: Aggiorna buffer anche con interim
      if (!isFinal) {
        transcriptBuffer = text;
        const currentWordCount = text.split(/\s+/).length;
        
        // Trigger suggerimento ogni N parole ANCHE su interim
        if (currentWordCount >= WORDS_PER_SUGGESTION && confidence >= 0.4) {
          const now = Date.now();
          if (now - lastSuggestionTime > SUGGESTION_DEBOUNCE_MS) {
            lastSuggestionTime = now;
            console.log(`🎯 Trigger su interim (${currentWordCount} parole, conf: ${confidence.toFixed(2)})`);
            generateSuggestion(ws, text, conversationHistory, true).catch(err => {
              console.error('❌ Errore async suggerimento interim:', err);
              lastSuggestionTime = 0;
            });
          }
        }
      }

      // Gestione trascrizioni finali
      if (isFinal && confidence >= 0.4) { // ABBASSATO: da 0.5 a 0.4
        // Invia trascrizione al client
        ws.send(JSON.stringify({
          type: 'transcript',
          text: text,
          confidence: confidence,
          timestamp: new Date().toISOString()
        }));

        // Aggiungi alla storia
        conversationHistory.push(text);
        if (conversationHistory.length > 15) { // AUMENTATO: da 10 a 15
          conversationHistory.shift();
        }

        // Reset buffer
        transcriptBuffer = '';
        wordCount = 0;

        // SEMPRE genera suggerimento su finale
        const now = Date.now();
        if (now - lastSuggestionTime > SUGGESTION_DEBOUNCE_MS) {
          lastSuggestionTime = now;
          console.log(`🎯 Trigger su finale (conf: ${confidence.toFixed(2)})`);
          generateSuggestion(ws, text, conversationHistory, false).catch(err => {
            console.error('❌ Errore async suggerimento finale:', err);
            lastSuggestionTime = 0;
          });
        }
      }
    });

    deepgramLive.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('❌ Deepgram error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Errore nella trascrizione: ' + (error.message || 'Errore sconosciuto')
      }));
    });

    deepgramLive.on(LiveTranscriptionEvents.Close, (closeEvent: any) => {
      console.log('🔌 Deepgram disconnesso:', closeEvent);
    });

  } catch (error) {
    console.error('❌ Errore inizializzazione Deepgram:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Errore inizializzazione trascrizione'
    }));
  }

  // ==========================================
  // WEBSOCKET MESSAGE HANDLER
  // ==========================================
  let audioChunksReceived = 0;
  
  ws.on('message', (message: Buffer) => {
    try {
      if (message instanceof Buffer) {
        audioChunksReceived++;
        
        if (audioChunksReceived % 100 === 0) {
          console.log(`📊 Audio: ${audioChunksReceived} chunks`);
        }
        
        if (deepgramLive && deepgramLive.getReadyState() === 1) {
          deepgramLive.send(message);
          
          if (audioChunksReceived === 1) {
            console.log(`🎤 Primo chunk inviato (${message.length} bytes)`);
          }
        } else {
          console.warn(`⚠️ Deepgram non pronto! State: ${deepgramLive?.getReadyState()}`);
        }
      } else {
        const data = JSON.parse(message.toString());
        console.log('📨 JSON ricevuto:', data);
      }
    } catch (error) {
      console.error('❌ Errore processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnesso');
    if (deepgramLive) {
      deepgramLive.finish();
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// ==========================================
// GENERA SUGGERIMENTO AI - VERSIONE POTENZIATA
// ==========================================
async function generateSuggestion(
  ws: WebSocket, 
  currentText: string, 
  history: string[],
  isInterim: boolean = false
) {
  try {
    const suggestionType = isInterim ? 'interim' : 'final';
    console.log(`🤖 Generando suggerimento [${suggestionType}]: ${currentText.substring(0, 50)}...`);

    const contextText = history.slice(-7).join('\n'); // AUMENTATO: da -5 a -7
    
    const detectedLanguage = detectLanguage(currentText);
    
    // Timeout più breve per interim
    const timeoutMs = isInterim ? 7000 : 10000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('OpenAI timeout')), timeoutMs)
    );
    
    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `Context:\n${contextText}\n\nCurrent: "${currentText}"\n\nLanguage: ${detectedLanguage} (respond ONLY in this language)\n\nProvide ONE actionable suggestion. ${isInterim ? 'Quick insight based on partial context.' : 'Focus on market data, statistics, and concrete numbers when relevant.'}`
        }
      ],
      max_tokens: 100, // RIDOTTO: da 150 a 100 per velocità
      temperature: 0.9, // AUMENTATO: da 0.8 a 0.9 per più varietà
      stream: false
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]) as any;
    
    const suggestionText = completion.choices[0]?.message?.content?.trim();
    
    if (!suggestionText) {
      console.warn('⚠️ Nessun suggerimento generato');
      return;
    }

    // MIGLIORATO: Rilevamento categoria più aggressivo
    let category = 'conversational';
    const lowerText = suggestionText.toLowerCase();
    
    // Priority to market (più aggressivo)
    if (
      lowerText.includes('[market]') || 
      lowerText.includes('mercato') || 
      lowerText.includes('market') ||
      lowerText.includes('competitor') ||
      lowerText.includes('concorr') ||
      lowerText.includes('industry') ||
      lowerText.includes('settore') ||
      lowerText.includes('trend') ||
      lowerText.includes('gartner') ||
      lowerText.includes('crescita') ||
      lowerText.includes('growth') ||
      lowerText.includes('%') ||
      /\d+%/.test(suggestionText) || // contiene percentuali
      /\d+x/.test(suggestionText) // contiene multipli (3x, 5x)
    ) {
      category = 'market';
    } else if (
      lowerText.includes('[value]') || 
      lowerText.includes('roi') || 
      lowerText.includes('benefic') ||
      lowerText.includes('valore') ||
      lowerText.includes('risparmio')
    ) {
      category = 'value';
    } else if (
      lowerText.includes('[closing]') || 
      lowerText.includes('prossim') || 
      lowerText.includes('demo') || 
      lowerText.includes('next') ||
      lowerText.includes('quando') ||
      lowerText.includes('chiudere')
    ) {
      category = 'closing';
    }

    // Pulisci testo
    const cleanedText = suggestionText
      .replace(/\[(conversational|value|closing|market)\]/gi, '')
      .trim();

    console.log(`✅ [${category}] ${suggestionType.toUpperCase()}: ${cleanedText}`);

    // Invia solo se WebSocket aperto
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'suggestion',
        text: cleanedText,
        category: category,
        isInterim: isInterim,
        timestamp: new Date().toISOString()
      }));
    }

  } catch (error: any) {
    console.error('❌ Errore suggerimento:', error.message || error);
    // Non bloccare - continua con prossimi suggerimenti
  }
}

// ==========================================
// DETECT LANGUAGE - INVARIATO
// ==========================================
function detectLanguage(text: string): string {
  const lowerText = text.toLowerCase();
  
  if (lowerText.match(/\b(sono|che|per|come|hai|posso|grazie|ciao|questo|quella)\b/)) {
    return 'Italian';
  }
  
  if (lowerText.match(/\b(es|son|que|como|por|para|puede|hola|gracias)\b/)) {
    return 'Spanish';
  }
  
  if (lowerText.match(/\b(est|sont|que|comme|pour|peut|bonjour|merci)\b/)) {
    return 'French';
  }
  
  if (lowerText.match(/\b(ist|sind|das|wie|für|kann|hallo|danke)\b/)) {
    return 'German';
  }
  
  return 'English';
}

// ==========================================
// START SERVER
// ==========================================
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SalesGenius Backend OPTIMIZED v2.0');
  console.log(`📡 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`⚡ Debounce: ${100}ms (10x più veloce)`);
  console.log(`📊 Trigger: ogni 8 parole o frasi complete`);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM, chiusura...');
  server.close(() => {
    console.log('✅ Server chiuso');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT, chiusura...');
  server.close(() => {
    console.log('✅ Server chiuso');
    process.exit(0);
  });
});
