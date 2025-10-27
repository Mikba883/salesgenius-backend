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
// EXPRESS
// ==========================================
const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.get('/health', (_, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.2.0' })
);

const server = createServer(app);
const wss = new WebSocketServer({ server });

// ==========================================
// CLIENTS
// ==========================================
const deepgram = createClient(DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ==========================================
// PROMPT BASE
// ==========================================
const SYSTEM_PROMPT = `You are a multilingual B2B sales AI assistant giving real-time market suggestions during calls...`;

// ==========================================
// GESTIONE CONNESSIONE
// ==========================================
wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 Nuovo client connesso');
  let deepgramLive: any = null;
  let conversationHistory: string[] = [];
  let audioChunksReceived = 0;
  let lastTranscriptTime = Date.now();
  let lastSuggestionTime = 0;

  const FLUSH_INTERVAL_MS = 5000;

  // ==========================================
  // AVVIO DEEPGRAM
  // ==========================================
  try {
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

    console.log('🎙️ Deepgram configurato (16kHz, mono)');

    deepgramLive.on(LiveTranscriptionEvents.Open, () => {
      console.log('✅ Deepgram connesso');
    });

    // ==========================================
    // EVENTO TRASCRIZIONE
    // ==========================================
    deepgramLive.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
      const t = data.channel?.alternatives?.[0];
      if (!t) return;
      const text = t.transcript?.trim();
      const isFinal = data.is_final;
      const conf = t.confidence || 0;
      if (!text) return;

      console.log(`[DG] ${isFinal ? 'FINAL' : 'INTERIM'} (${conf.toFixed(2)}): "${text}"`);
      lastTranscriptTime = Date.now();

      if (isFinal && conf > 0.4) {
        ws.send(JSON.stringify({ type: 'transcript', text, confidence: conf }));
        conversationHistory.push(text);
        if (conversationHistory.length > 15) conversationHistory.shift();
        if (Date.now() - lastSuggestionTime > 500) {
          lastSuggestionTime = Date.now();
          await generateSuggestion(ws, text, conversationHistory, false);
        }
      }
    });

    // ==========================================
    // ERRORI / CLOSE
    // ==========================================
    deepgramLive.on(LiveTranscriptionEvents.Error, (e: any) => {
      console.error('❌ Deepgram error:', e);
    });

    deepgramLive.on(LiveTranscriptionEvents.Close, (ev: any) => {
      console.log('🔌 Deepgram disconnesso:', ev.reason || ev.code);
    });

    // ==========================================
    // FORZA FLUSH OGNI 5s
    // ==========================================
    setInterval(() => {
      if (deepgramLive && deepgramLive.getReadyState() === 1) {
        const idle = Date.now() - lastTranscriptTime;
        if (idle > FLUSH_INTERVAL_MS) {
          console.log('🧹 Flush forzato (nessun transcript finale negli ultimi 5s)');
          deepgramLive.send(JSON.stringify({ type: 'flush' }));
        }
      }
    }, FLUSH_INTERVAL_MS);

  } catch (e) {
    console.error('❌ Errore inizializzazione Deepgram:', e);
  }

  // ==========================================
  // RICEZIONE AUDIO
  // ==========================================
  ws.on('message', (msg: Buffer) => {
    if (msg instanceof Buffer) {
      audioChunksReceived++;
      if (audioChunksReceived % 100 === 0)
        console.log(`📦 Ricevuti ${audioChunksReceived} chunk audio`);
      if (deepgramLive && deepgramLive.getReadyState() === 1) {
        deepgramLive.send(msg);
      } else {
        console.warn(`⚠️ Deepgram non pronto (state ${deepgramLive?.getReadyState()})`);
      }
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnesso');
    if (deepgramLive) deepgramLive.finish();
  });

  ws.on('error', (err) => console.error('❌ WebSocket errore:', err));
});

// ==========================================
// GPT SUGGESTION
// ==========================================
async function generateSuggestion(ws: WebSocket, text: string, hist: string[], isInterim = false) {
  try {
    console.log(`🤖 Generando suggerimento [${isInterim ? 'interim' : 'final'}] per:`, text);
    const context = hist.slice(-7).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Context:\n${context}\n\nCurrent: "${text}"\nLanguage: auto\nProvide one actionable market suggestion.`,
        },
      ],
      max_tokens: 100,
      temperature: 0.9,
    });

    console.log('🔎 OpenAI RAW:', JSON.stringify(completion, null, 2));

    const suggestion = completion.choices?.[0]?.message?.content?.trim();
    if (!suggestion) {
      console.warn('⚠️ Nessun suggerimento generato');
      return;
    }

    console.log('🧩 Suggerimento generato:', suggestion);
    if (ws.readyState === 1)
      ws.send(
        JSON.stringify({
          type: 'suggestion',
          text: suggestion,
          category: 'auto',
          isInterim,
          timestamp: new Date().toISOString(),
        })
      );
  } catch (e: any) {
    console.error('❌ Errore GPT:', e.response?.data || e.message || e);
  }
}

// ==========================================
// AVVIO SERVER
// ==========================================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SalesGenius Diagnostic Backend running on ${PORT}`);
});

