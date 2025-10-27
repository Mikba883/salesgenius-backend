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

// IMPORTANTE: Abilita CORS per permettere richieste dal browser
app.use(cors({
  origin: '*', // Permetti tutte le origini (puoi restringere in produzione)
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Root endpoint
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
// PROMPT AI
// ==========================================
const SYSTEM_PROMPT = `You are an expert B2B sales AI assistant.
Analyze the conversation and provide brief, concrete, and actionable suggestions in real-time.

CRITICAL RULES:
- Suggestions MAX 20 words
- Actionable and specific
- NO invented data (prices, metrics, specific ROI)
- Suggest strategic QUESTIONS or FRAMEWORKS
- ALWAYS respond in the SAME LANGUAGE as the conversation
- If language unclear, default to ENGLISH

CATEGORIES:
- conversational: Open questions, discovery, rapport
- value: Objection handling, ROI, benefits
- closing: Next steps, commitment, closing
- market: Positioning, competitors, context

Response format:
[CATEGORY] Brief and clear suggestion

LANGUAGE DETECTION:
- If conversation is in Italian → respond in Italian
- If conversation is in English → respond in English
- If conversation is in Spanish → respond in Spanish
- If conversation is in French → respond in French
- If conversation is in German → respond in German
- If unclear → default to English`;

// ==========================================
// WEBSOCKET CONNECTION HANDLER
// ==========================================
wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 Nuovo client connesso');

  let deepgramLive: any = null;
  let conversationHistory: string[] = [];
  let lastSuggestionTime = 0;
  const SUGGESTION_DEBOUNCE_MS = 2000; // 2 secondi tra suggerimenti (era 5)

  // Inizializza Deepgram Live Transcription
  try {
    deepgramLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'it',
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
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

      console.log(`📝 Trascrizione [${isFinal ? 'FINAL' : 'interim'}]: "${text}" (conf: ${confidence.toFixed(2)})`);

      // Invia trascrizione al client
      if (isFinal && confidence >= 0.6) { // Abbassato da 0.7 a 0.6 (60%)
        ws.send(JSON.stringify({
          type: 'transcript',
          text: text,
          confidence: confidence,
          timestamp: new Date().toISOString()
        }));

        // Aggiungi alla storia conversazione
        conversationHistory.push(text);
        if (conversationHistory.length > 10) {
          conversationHistory.shift(); // Mantieni solo ultime 10 frasi
        }

        // Genera suggerimento AI più frequentemente (non-blocking)
        const now = Date.now();
        if (now - lastSuggestionTime > SUGGESTION_DEBOUNCE_MS) {
          lastSuggestionTime = now;
          // Generate suggestion in background - don't wait for it
          generateSuggestion(ws, text, conversationHistory).catch(err => {
            console.error('❌ Errore async generazione suggerimento:', err);
            // Reset timer on error so next suggestion can be generated
            lastSuggestionTime = 0;
          });
        } else {
          console.log(`⏱️ Suggerimento skippato (debounce: ${Math.round((now - lastSuggestionTime) / 1000)}s / ${SUGGESTION_DEBOUNCE_MS / 1000}s)`);
        }
      } else if (isFinal && confidence < 0.6) {
        // Log trascrizioni scartate per confidence bassa
        console.log(`⚠️ Trascrizione ignorata (confidence troppo bassa: ${confidence.toFixed(2)})`);
      }
    });

    deepgramLive.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('❌ Deepgram error:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Errore nella trascrizione: ' + (error.message || 'Errore sconosciuto')
      }));
    });

    deepgramLive.on(LiveTranscriptionEvents.Close, (closeEvent: any) => {
      console.log('🔌 Deepgram disconnesso');
      console.log('🔌 Close reason:', closeEvent);
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
      // Controlla se è audio binario o JSON
      if (message instanceof Buffer) {
        audioChunksReceived++;
        
        // Log ogni 50 chunks per non intasare
        if (audioChunksReceived % 50 === 0) {
          console.log(`📊 Audio ricevuto: ${audioChunksReceived} chunks (ultimo: ${message.length} bytes)`);
        }
        
        // Audio PCM16
        if (deepgramLive && deepgramLive.getReadyState() === 1) {
          deepgramLive.send(message);
          
          // Debug: log invio a Deepgram
          if (audioChunksReceived === 1) {
            console.log(`🎤 Primo chunk audio inviato a Deepgram (${message.length} bytes)`);
          }
        } else {
          console.warn(`⚠️ Deepgram non pronto! ReadyState: ${deepgramLive?.getReadyState() || 'null'}`);
        }
      } else {
        // Messaggio JSON (per future estensioni)
        const data = JSON.parse(message.toString());
        console.log('📨 Messaggio JSON ricevuto:', data);
      }
    } catch (error) {
      console.error('❌ Errore processing message:', error);
    }
  });

  // ==========================================
  // WEBSOCKET CLOSE HANDLER
  // ==========================================
  ws.on('close', () => {
    console.log('👋 Client disconnesso');
    if (deepgramLive) {
      deepgramLive.finish();
    }
  });

  // ==========================================
  // WEBSOCKET ERROR HANDLER
  // ==========================================
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// ==========================================
// GENERA SUGGERIMENTO AI
// ==========================================
async function generateSuggestion(ws: WebSocket, currentText: string, history: string[]) {
  try {
    console.log('🤖 Generando suggerimento per:', currentText);

    const contextText = history.slice(-5).join('\n');
    
    // Detect language from conversation
    const detectedLanguage = detectLanguage(currentText);
    console.log(`🌍 Lingua rilevata: ${detectedLanguage}`);
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('OpenAI timeout')), 10000)
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
          content: `Conversation context:\n${contextText}\n\nLatest phrase: "${currentText}"\n\nProvide a brief suggestion in ${detectedLanguage}.`
        }
      ],
      max_tokens: 100,
      temperature: 0.7,
      stream: false
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]) as any;
    
    const suggestionText = completion.choices[0]?.message?.content?.trim();
    
    if (!suggestionText) {
      console.warn('⚠️ Nessun suggerimento generato');
      return;
    }

    // Estrai categoria dal suggerimento
    let category = 'conversational';
    const lowerText = suggestionText.toLowerCase();
    
    if (lowerText.includes('[value]') || lowerText.includes('roi') || lowerText.includes('benefic')) {
      category = 'value';
    } else if (lowerText.includes('[closing]') || lowerText.includes('prossim') || lowerText.includes('demo') || lowerText.includes('next')) {
      category = 'closing';
    } else if (lowerText.includes('[market]') || lowerText.includes('competitor') || lowerText.includes('mercato') || lowerText.includes('market')) {
      category = 'market';
    } else if (lowerText.includes('[conversational]')) {
      category = 'conversational';
    }

    // Pulisci il testo dal tag categoria
    const cleanedText = suggestionText
      .replace(/\[conversational\]/gi, '')
      .replace(/\[value\]/gi, '')
      .replace(/\[closing\]/gi, '')
      .replace(/\[market\]/gi, '')
      .trim();

    console.log(`✅ Suggerimento generato [${category}]: ${cleanedText}`);

    // Invia suggerimento al client (check if WebSocket is still open)
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'suggestion',
        text: cleanedText,
        category: category,
        timestamp: new Date().toISOString()
      }));
    } else {
      console.warn('⚠️ WebSocket non aperto, suggerimento non inviato');
    }

  } catch (error: any) {
    console.error('❌ Errore generazione suggerimento:', error.message || error);
    // Non bloccare il flusso - il prossimo suggerimento verrà generato normalmente
  }
}

// ==========================================
// DETECT LANGUAGE
// ==========================================
function detectLanguage(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Italian indicators
  if (lowerText.match(/\b(sono|che|per|come|hai|posso|grazie|ciao|questo|quella)\b/)) {
    return 'Italian';
  }
  
  // Spanish indicators
  if (lowerText.match(/\b(es|son|que|como|por|para|puede|hola|gracias)\b/)) {
    return 'Spanish';
  }
  
  // French indicators
  if (lowerText.match(/\b(est|sont|que|comme|pour|peut|bonjour|merci)\b/)) {
    return 'French';
  }
  
  // German indicators
  if (lowerText.match(/\b(ist|sind|das|wie|für|kann|hallo|danke)\b/)) {
    return 'German';
  }
  
  // Default to English
  return 'English';
}

// ==========================================
// START SERVER
// ==========================================
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SalesGenius Backend avviato');
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌍 Health check: http://localhost:${PORT}/health`);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM ricevuto, chiusura graceful...');
  server.close(() => {
    console.log('✅ Server chiuso');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT ricevuto, chiusura graceful...');
  server.close(() => {
    console.log('✅ Server chiuso');
    process.exit(0);
  });
});
