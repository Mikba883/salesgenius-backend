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

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.1',
  });
});

app.get('/', (req, res) => {
  res.json({
    app: 'SalesGenius Backend',
    status: 'running',
    websocket: 'ws://' + req.headers.host,
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
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ==========================================
// PROMPT AI POTENZIATO
// ==========================================
const SYSTEM_PROMPT = `You are an expert B2B sales AI assistant providing real-time suggestions during sales calls.

CRITICAL LANGUAGE RULE:
- YOU MUST respond in the EXACT SAME LANGUAGE as the conversation
- If conversation is English → respond ONLY in English
- If conversation is Italian → respond ONLY in Italian

SUGGESTION TYPES (generate MORE suggestions, especially market data):
1. Strategic Questions (25%)
2. Market Insights (35%) – include specific stats, ROI, adoption rates, Gartner data
3. Value Statements (25%)
4. Tactical Advice (15%)

CATEGORIES:
- conversational: rapport, needs analysis
- value: ROI, benefits, objection handling
- closing: next steps, commitment
- market: **priority** — trends, competitor data, benchmarks

Response format: [CATEGORY] suggestion text`;


// ==========================================
// WEBSOCKET CONNECTION HANDLER
// ==========================================
wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 Nuovo client connesso');

  let deepgramLive: any = null;
  let conversationHistory: string[] = [];
  let transcriptBuffer = '';
  let lastSuggestionTime = 0;

  const SUGGESTION_DEBOUNCE_MS = 100;
  const WORDS_PER_SUGGESTION = 8;

  try {
    // ✅ FIX: RIMOSSO utterance_end_ms, conforme alle nuove specifiche Deepgram
    deepgramLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'it',
      smart_format: true,
      interim_results: true,
      vad_events: true,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
    });

    console.log('🎙️ Deepgram configurato: linear16, 16kHz, mono');

    // ==========================================
    // EVENTI DEEPGRAM
    // ==========================================
    deepgramLive.on(LiveTranscriptionEvents.Open, () => {
      console.log('✅✅✅ Deepgram CONNESSO E PRONTO!');
    });

    deepgramLive.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('❌ Deepgram error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Errore nella trascrizione: ' + (error.message || 'Errore sconosciuto'),
      }));
    });

    deepgramLive.on(LiveTranscriptionEvents.Close, (closeEvent: any) => {
      console.log('🔌 Deepgram disconnesso:', closeEvent);
    });

    deepgramLive.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
      const transcript = data.channel?.alternatives?.[0];
      if (!transcript) return;

      const text = transcript.transcript?.trim();
      const isFinal = data.is_final;
      const confidence = transcript.confidence || 0;

      if (!text) return;

      console.log(`📝 [${isFinal ? 'FINAL' : 'interim'}]: "${text}" (conf: ${confidence.toFixed(2)})`);

      // Gestione suggerimenti su risultati intermedi
      if (!isFinal && confidence >= 0.4) {
        const words = text.split(/\s+/).length;
        if (words >= WORDS_PER_SUGGESTION && Date.now() - lastSuggestionTime > SUGGESTION_DEBOUNCE_MS) {
          lastSuggestionTime = Date.now();
          await generateSuggestion(ws, text, conversationHistory, true);
        }
      }

      // Gestione finale
      if (isFinal && confidence >= 0.4) {
        ws.send(JSON.stringify({
          type: 'transcript',
          text,
          confidence,
          timestamp: new Date().toISOString(),
        }));

        conversationHistory.push(text);
        if (conversationHistory.length > 15) conversationHistory.shift();

        transcriptBuffer = '';

        if (Date.now() - lastSuggestionTime > SUGGESTION_DEBOUNCE_MS) {
          lastSuggestionTime = Date.now();
          await generateSuggestion(ws, text, conversationHistory, false);
        }
      }
    });

  } catch (error) {
    console.error('❌ Errore inizializzazione Deepgram:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Errore inizializzazione trascrizione' }));
  }

  // ==========================================
  // MESSAGGI WEBSOCKET (AUDIO STREAM)
  // ==========================================
  let audioChunksReceived = 0;

  ws.on('message', (message: Buffer) => {
    try {
      if (message instanceof Buffer) {
        audioChunksReceived++;
        if (audioChunksReceived % 100 === 0) console.log(`📊 Audio: ${audioChunksReceived} chunks`);

        if (deepgramLive && deepgramLive.getReadyState() === 1) {
          deepgramLive.send(message);
          if (audioChunksReceived === 1) console.log(`🎤 Primo chunk inviato (${message.length} bytes)`);
        } else {
          console.warn(`⚠️ Deepgram non pronto! State: ${deepgramLive?.getReadyState()}`);
        }
      }
    } catch (error) {
      console.error('❌ Errore processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnesso');
    if (deepgramLive) deepgramLive.finish();
  });

  ws.on('error', (error) => console.error('❌ WebSocket error:', error));
});

// ==========================================
// GENERAZIONE SUGGERIMENTI AI
// ==========================================
async function generateSuggestion(
  ws: WebSocket,
  currentText: string,
  history: string[],
  isInterim: boolean = false
) {
  try {
    const suggestionType = isInterim ? 'interim' : 'final';
    console.log(`🤖 Generando suggerimento [${suggestionType}]: ${currentText.slice(0, 40)}...`);

    const contextText = history.slice(-7).join('\n');
    const detectedLanguage = detectLanguage(currentText);

    const timeoutMs = isInterim ? 7000 : 10000;
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI timeout')), timeoutMs));

    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Context:\n${contextText}\n\nCurrent: "${currentText}"\nLanguage: ${detectedLanguage}\nProvide one actionable suggestion (${suggestionType}).`,
        },
      ],
      max_tokens: 100,
      temperature: 0.9,
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]) as any;
    const suggestionText = completion.choices[0]?.message?.content?.trim();
    if (!suggestionText) return;

    let category = 'conversational';
    const lower = suggestionText.toLowerCase();

    if (/\d+%|\d+x|market|mercato|trend|industry|gartner|growth|crescita|competitor/.test(lower)) category = 'market';
    else if (/roi|valore|benefit|risparmio/.test(lower)) category = 'value';
    else if (/demo|next|chiudere|closing|prossim/.test(lower)) category = 'closing';

    const cleaned = suggestionText.replace(/\[(.*?)\]/g, '').trim();

    console.log(`✅ [${category}] ${suggestionType.toUpperCase()}: ${cleaned}`);

    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'suggestion',
        text: cleaned,
        category,
        isInterim,
        timestamp: new Date().toISOString(),
      }));
    }

  } catch (error: any) {
    console.error('❌ Errore suggerimento:', error.message || error);
  }
}

// ==========================================
// DETECT LANGUAGE
// ==========================================
function detectLanguage(text: string): string {
  const t = text.toLowerCase();
  if (/\b(sono|che|per|come|hai|posso|grazie|ciao|questo|quella)\b/.test(t)) return 'Italian';
  if (/\b(es|son|que|como|por|para|puede|hola|gracias)\b/.test(t)) return 'Spanish';
  if (/\b(est|sont|que|comme|pour|peut|bonjour|merci)\b/.test(t)) return 'French';
  if (/\b(ist|sind|das|wie|für|kann|hallo|danke)\b/.test(t)) return 'German';
  return 'English';
}

// ==========================================
// START SERVER
// ==========================================
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SalesGenius Backend FIXED v2.1');
  console.log(`📡 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`⚡ Deepgram ready without utterance_end_ms`);
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
