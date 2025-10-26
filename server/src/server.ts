import 'dotenv/config';
import WebSocket from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildMessages, detectLanguage, QUALITY_PRESETS } from './prompts.js';

// =============================================================================
// CONFIGURAZIONE
// =============================================================================

const PORT = Number(process.env.PORT) || 8080;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const deepgram = createClient(DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Supabase client con SERVICE ROLE KEY (può bypassare RLS)
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Quality preset (change to 'fast' or 'premium' as needed)
const QUALITY_MODE = process.env.QUALITY_MODE || 'balanced';
const openAIConfig = QUALITY_PRESETS[QUALITY_MODE as keyof typeof QUALITY_PRESETS];

// Categorie e regole
type CategoryKey = 'conversational' | 'value' | 'closing' | 'market';

const CATEGORY_KEYWORDS: Record<CategoryKey, string[]> = {
  conversational: ['tell me', 'explain', 'understand', 'curious', 'what', 'how', 'why', 'can you'],
  value: ['price', 'cost', 'expensive', 'budget', 'roi', 'worth', 'benefit', 'concern', 'worried'],
  closing: ['next step', 'decision', 'timeline', 'when', 'ready', 'contract', 'sign', 'agreement'],
  market: ['competitor', 'market', 'industry', 'trend', 'comparison', 'alternative', 'others'],
};

// Debounce per evitare troppi suggerimenti
const SUGGESTION_DEBOUNCE_MS = 180;

// =============================================================================
// SERVER WEBSOCKET
// =============================================================================

const wss = new WebSocket.Server({ port: PORT });

console.log(`🚀 SalesGenius Backend running on ws://localhost:${PORT}`);

// =============================================================================
// HTTP SERVER FOR HEALTH CHECKS
// =============================================================================

import http from 'http';

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connections: wss.clients.size,
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const HTTP_PORT = Number(PORT) + 1; // Health check on PORT+1
httpServer.listen(HTTP_PORT, () => {
  console.log(`❤️  Health check available at http://localhost:${HTTP_PORT}/health`);
});

wss.on('connection', (ws: WebSocket) => {
  console.log('📱 Client connected');

  const state = {
    deepgramLive: null as any,
    currentSuggestionId: null as string | null,
    lastSuggestionTime: 0,
    transcriptBuffer: [] as string[],
    abortController: null as AbortController | null,
    
    // User authentication state
    authenticated: false,
    userId: null as string | null,
    userEmail: null as string | null,
    sessionId: uuidv4(),
    connectedAt: new Date(),
  };

  // -------------------------------------------------------------------------
  // Setup Deepgram Live
  // -------------------------------------------------------------------------
  const setupDeepgram = () => {
    try {
      const dgLive = deepgram.listen.live({
        model: 'nova-2',
        language: 'it', // Cambia in 'en' se serve inglese
        smart_format: true,
        interim_results: true,
        punctuate: true,
        utterance_end_ms: 1200,
      });

      // Transcript handler
      dgLive.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0];
        if (!transcript) return;

        const text = transcript.transcript?.trim();
        if (!text) return;

        const isFinal = data.is_final;
        const confidence = transcript.confidence || 0;

        console.log(`🎤 [${isFinal ? 'FINAL' : 'interim'}] (${confidence.toFixed(2)}): ${text}`);

        // Solo finale con confidenza sufficiente
        if (isFinal && confidence >= 0.7) {
          state.transcriptBuffer.push(text);

          // Tronca buffer a ultimi ~10 frasi
          if (state.transcriptBuffer.length > 10) {
            state.transcriptBuffer = state.transcriptBuffer.slice(-10);
          }

          // Trigger suggerimento con debounce
          handleTranscriptForSuggestion(text);
        }
      });

      dgLive.on(LiveTranscriptionEvents.Error, (err: any) => {
        console.error('❌ Deepgram error:', err);
      });

      dgLive.on(LiveTranscriptionEvents.Close, () => {
        console.log('🔌 Deepgram connection closed');
      });

      state.deepgramLive = dgLive;

    } catch (error) {
      console.error('❌ Failed to setup Deepgram:', error);
    }
  };

  setupDeepgram();

  // -------------------------------------------------------------------------
  // Classificazione categoria + Trigger LLM
  // -------------------------------------------------------------------------
  const handleTranscriptForSuggestion = async (text: string) => {
    const now = Date.now();

    // Debounce
    if (now - state.lastSuggestionTime < SUGGESTION_DEBOUNCE_MS) {
      return;
    }

    state.lastSuggestionTime = now;

    // Classifica categoria
    const category = classifyCategory(text);
    console.log(`🏷️  Category: ${category}`);

    // Chiudi stream precedente se esiste
    if (state.abortController) {
      state.abortController.abort();
    }

    // Genera nuovo suggerimento
    await generateSuggestion(category, text);
  };

  // -------------------------------------------------------------------------
  // Classificazione semplice basata su keyword
  // -------------------------------------------------------------------------
  const classifyCategory = (text: string): CategoryKey => {
    const lower = text.toLowerCase();
    let maxScore = 0;
    let bestCategory: CategoryKey = 'conversational';

    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const score = keywords.filter(kw => lower.includes(kw)).length;
      if (score > maxScore) {
        maxScore = score;
        bestCategory = cat as CategoryKey;
      }
    }

    return bestCategory;
  };

  // -------------------------------------------------------------------------
  // Genera suggerimento via OpenAI streaming
  // -------------------------------------------------------------------------
  const generateSuggestion = async (category: CategoryKey, lastUtterance: string) => {
    const startTime = Date.now();
    const suggestionId = uuidv4();
    state.currentSuggestionId = suggestionId;

    // Abort controller per interrompere stream
    const abortController = new AbortController();
    state.abortController = abortController;

    // Context dalle ultime frasi
    const context = state.transcriptBuffer.slice(-5).join(' ');
    
    // Conversation history per migliore context awareness
    const conversationHistory = state.transcriptBuffer.slice(-6).map((t, i) => ({
      role: i % 2 === 0 ? 'customer' : 'seller',
      content: t
    }));

    // Detect language
    const detectedLang = detectLanguage(lastUtterance);
    console.log(`🌍 Language detected: ${detectedLang.toUpperCase()}`);

    // Build optimized messages using new prompt system
    const messages = buildMessages({
      category,
      transcript: lastUtterance,
      context,
      conversationHistory,
    });

    try {
      // Invia start
      sendJSON(ws, {
        type: 'suggestion.start',
        id: suggestionId,
        category,
      });

      // Stream OpenAI with quality preset
      const stream = await openai.chat.completions.create(
        {
          ...openAIConfig, // Uses balanced/fast/premium preset
          messages,
          stream: true,
        },
        { signal: abortController.signal }
      );

      let fullText = '';
      let isFirstToken = true;

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;

        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          
          // Log first token latency
          if (isFirstToken) {
            const firstTokenLatency = Date.now() - startTime;
            console.log(`⚡ First token in ${firstTokenLatency}ms`);
            isFirstToken = false;
          }
          
          sendJSON(ws, {
            type: 'suggestion.delta',
            id: suggestionId,
            textChunk: delta,
          });
        }
      }

      // Invia end (se non abortato)
      if (!abortController.signal.aborted) {
        const totalLatency = Date.now() - startTime;
        console.log(`✅ Suggestion complete in ${totalLatency}ms (${fullText.length} chars)`);
        
        sendJSON(ws, {
          type: 'suggestion.end',
          id: suggestionId,
        });

        // Log suggerimento in database con testo completo
        if (state.authenticated && state.userId) {
          await logSuggestion(state, suggestionId, category, fullText);
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`🚫 Stream aborted for suggestion ${suggestionId}`);
      } else {
        console.error('❌ Error generating suggestion:', error);
        sendJSON(ws, {
          type: 'error',
          message: 'Failed to generate suggestion',
        });
      }
    } finally {
      if (state.currentSuggestionId === suggestionId) {
        state.currentSuggestionId = null;
        state.abortController = null;
      }
    }
  };

  // -------------------------------------------------------------------------
  // Handler messaggi WebSocket dal client
  // -------------------------------------------------------------------------
  ws.on('message', async (data: WebSocket.Data) => {
    try {
      // Prova a parsare come JSON (header)
      if (typeof data === 'string') {
        const msg = JSON.parse(data);

        if (msg.op === 'hello') {
          console.log('👋 Client hello:', msg);
          sendJSON(ws, { 
            type: 'server.ready',
            sessionId: state.sessionId,
            requiresAuth: !!SUPABASE_URL,
          });
        }

        if (msg.op === 'auth') {
          // Autentica con JWT da Supabase
          console.log('🔐 Authenticating user...');
          
          try {
            const { data: { user }, error } = await supabase.auth.getUser(msg.jwt);
            
            if (error || !user) {
              console.error('❌ Authentication failed:', error?.message);
              sendJSON(ws, { 
                type: 'error', 
                message: 'Authentication failed. Please log in again.' 
              });
              ws.close();
              return;
            }

            // Salva info utente
            state.authenticated = true;
            state.userId = user.id;
            state.userEmail = user.email || null;

            console.log(`✅ User authenticated: ${user.email} (${user.id})`);

            // Log sessione in database (opzionale)
            await logUserSession(state);

            // Setup Deepgram ora che l'utente è autenticato
            setupDeepgram();

            sendJSON(ws, { 
              type: 'auth.success',
              user: {
                id: user.id,
                email: user.email,
              }
            });

          } catch (error: any) {
            console.error('❌ Auth error:', error);
            sendJSON(ws, { type: 'error', message: 'Authentication error' });
            ws.close();
          }
          return;
        }

        if (msg.op === 'audio') {
          // Verifica autenticazione prima di processare audio
          if (SUPABASE_URL && !state.authenticated) {
            sendJSON(ws, { type: 'error', message: 'Not authenticated' });
            return;
          }
          // Header del frame audio (prossimo messaggio sarà binario)
        }

      } else {
        // Messaggio binario = frame PCM16
        if (state.deepgramLive && data instanceof Buffer) {
          // Verifica autenticazione
          if (SUPABASE_URL && !state.authenticated) {
            return;
          }
          state.deepgramLive.send(data);
        }
      }

    } catch (error) {
      console.error('❌ Error handling message:', error);
    }
  });

  // -------------------------------------------------------------------------
  // Cleanup on disconnect
  // -------------------------------------------------------------------------
  ws.on('close', () => {
    console.log('🔌 Client disconnected');

    // Chiudi Deepgram
    if (state.deepgramLive) {
      state.deepgramLive.finish();
      state.deepgramLive = null;
    }

    // Abort stream LLM
    if (state.abortController) {
      state.abortController.abort();
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// =============================================================================
// UTILITIES
// =============================================================================

function sendJSON(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Log sessione utente in Supabase
async function logUserSession(state: any) {
  try {
    await supabase.from('user_sessions').insert({
      session_id: state.sessionId,
      user_id: state.userId,
      connected_at: state.connectedAt.toISOString(),
      user_email: state.userEmail,
    });
    console.log('📊 Session logged');
  } catch (error) {
    console.error('⚠️  Failed to log session:', error);
  }
}

// Log suggerimento generato
async function logSuggestion(state: any, suggestionId: string, category: string, text: string) {
  try {
    await supabase.from('suggestions').insert({
      suggestion_id: suggestionId,
      session_id: state.sessionId,
      user_id: state.userId,
      category,
      text,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('⚠️  Failed to log suggestion:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});