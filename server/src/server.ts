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
const SYSTEM_PROMPT = `Sei un assistente AI esperto in vendite B2B. 
Analizza la conversazione e fornisci suggerimenti brevi, concreti e actionable in tempo reale.

REGOLE CRITICHE:
- Suggerimenti MAX 20 parole
- Actionable e specifici
- NO dati inventati (prezzi, metriche, ROI specifici)
- Suggerisci DOMANDE strategiche o FRAMEWORK
- Rispondi nella STESSA LINGUA della conversazione

CATEGORIE:
- conversational: Domande aperte, discovery, rapport
- value: Gestione obiezioni, ROI, benefici
- closing: Next steps, commitment, chiusura
- market: Posizionamento, competitor, contesto

Formato risposta:
[CATEGORIA] Suggerimento breve e chiaro`;

// ==========================================
// WEBSOCKET CONNECTION HANDLER
// ==========================================
wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 Nuovo client connesso');

  let deepgramLive: any = null;
  let conversationHistory: string[] = [];
  let lastSuggestionTime = 0;
  const SUGGESTION_DEBOUNCE_MS = 5000; // 5 secondi tra suggerimenti

  // Inizializza Deepgram Live Transcription
  try {
    deepgramLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'it',
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
    });

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
      if (isFinal && confidence >= 0.7) {
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

        // Genera suggerimento AI
        const now = Date.now();
        if (now - lastSuggestionTime > SUGGESTION_DEBOUNCE_MS) {
          lastSuggestionTime = now;
          await generateSuggestion(ws, text, conversationHistory);
        }
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
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `Contesto conversazione:\n${contextText}\n\nUltima frase: "${currentText}"\n\nFornisci un suggerimento breve.`
        }
      ],
      max_tokens: 100,
      temperature: 0.7,
      stream: false
    });

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
    } else if (lowerText.includes('[closing]') || lowerText.includes('prossim') || lowerText.includes('demo')) {
      category = 'closing';
    } else if (lowerText.includes('[market]') || lowerText.includes('competitor') || lowerText.includes('mercato')) {
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

    // Invia suggerimento al client
    ws.send(JSON.stringify({
      type: 'suggestion',
      text: cleanedText,
      category: category,
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error('❌ Errore generazione suggerimento:', error);
  }
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
