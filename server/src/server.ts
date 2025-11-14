// server/src/server.ts
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient, DeepgramClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { config } from 'dotenv';
import { handleGPTSuggestion } from './gpt-handler';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';

// Carica le variabili d'ambiente
config();

// Inizializza Supabase con DUE client:
// 1. Client per autenticazione JWT (usa ANON_KEY)
const supabaseAuth: SupabaseClient = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// 2. Client per operazioni admin/server-side (usa SERVICE_KEY)
const supabaseAdmin: SupabaseClient = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Tipo per la sessione utente
interface UserSession {
  userId: string;
  isPremium: boolean;
  sessionId: string;
  startTime: Date;
  ws: WebSocket;
}

// Cache delle sessioni attive
const activeSessions = new Map<WebSocket, UserSession>();

// Inizializza Deepgram
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY!);

// Setup Express
const app = express();
app.use(express.json()); // Per gestire POST requests con JSON
const PORT = process.env.PORT || 8080;

console.log('🚀 Server starting with DEBUG LOGGING ENABLED - Version 2.4.3 - Force Rebuild');

// ==========================================
// RATE LIMITING (Protezione Costi)
// ==========================================

// Rate limiter generale per tutte le API
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minuti
  max: 100, // max 100 requests per 5 minuti per IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter più restrittivo per debug endpoint
const debugLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 5, // max 5 requests per 15 minuti
  message: 'Too many debug requests, please try again later.',
});

// Applica rate limiting a tutte le route
app.use(apiLimiter);

// Tracking connessioni WebSocket per utente (in-memory)
const userConnections = new Map<string, number>(); // userId -> numero connessioni attive
const MAX_CONNECTIONS_PER_USER = 2;

// Tracking suggerimenti per rate limiting
const userSuggestions = new Map<string, { count: number; resetTime: number }>(); // userId -> {count, resetTime}
const MAX_SUGGESTIONS_PER_5MIN = 10;

// ==========================================
// HEALTH CHECK ENDPOINTS (FIX PER RENDER)
// ==========================================

// Root endpoint - previene 404 sui health checks di Render
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'salesgenius-backend',
    version: '2.4.3',
    uptime: Math.floor(process.uptime()),
    connections: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint dedicato
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// DEBUG ENDPOINT - Verifica token (SOLO IN SVILUPPO)
app.post('/debug-token', debugLimiter, async (req, res) => {
  // Blocca in produzione
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Debug endpoint disabled in production' });
  }
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'No token provided in request body' });
    }

    // Decodifica il token senza verificarlo
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({ error: 'Invalid JWT format - must have 3 parts separated by dots' });
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Tenta autenticazione con Supabase
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    
    // Determina la diagnosi
    let diagnosis = '';
    if (payload.app_metadata && !payload.role) {
      diagnosis = '❌ CUSTOM JWT - Non è un token Supabase. State usando jwt.sign() invece di supabase.auth.getSession()';
    } else if (payload.role === 'authenticated' && payload.aud === 'authenticated') {
      if (error) {
        diagnosis = '⚠️ Token sembra Supabase ma validazione fallisce - Verificare SUPABASE_ANON_KEY nel backend o che il token non sia scaduto';
      } else {
        diagnosis = '✅ Token Supabase valido! Questo dovrebbe funzionare.';
      }
    } else if (header.kid && !payload.role) {
      diagnosis = '⚠️ Token ha kid ma manca role - Potrebbe essere service_role_key invece di access_token';
    } else if (payload.role === 'anon') {
      diagnosis = '❌ State inviando ANON_KEY invece del session.access_token dell\'utente!';
    } else if (payload.role === 'service_role') {
      diagnosis = '❌ State inviando SERVICE_ROLE_KEY invece del session.access_token dell\'utente!';
    } else {
      diagnosis = '❓ Formato token non riconosciuto - Verificare che provenga da supabase.auth.getSession()';
    }

    return res.json({
      success: true,
      tokenInfo: {
        header,
        payload: {
          ...payload,
          // Nascondi informazioni sensibili
          email: payload.email ? '***@***' : undefined
        },
        hasKid: !!header.kid,
        hasRole: !!payload.role,
        hasAud: !!payload.aud,
        hasAppMetadata: !!payload.app_metadata,
        roleValue: payload.role || 'missing',
        audValue: payload.aud || 'missing'
      },
      supabaseValidation: {
        isValid: !error && !!user,
        error: error?.message || null,
        errorCode: error?.['code'] || null,
        userId: user?.id || null
      },
      diagnosis
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false,
      error: 'Error parsing token',
      message: error.message 
    });
  }
});

// Endpoint per verificare la configurazione (debug)
app.get('/status', (req, res) => {
  res.status(200).json({
    service: 'salesgenius-backend',
    version: '2.4.3',
    environment: process.env.NODE_ENV || 'development',
    supabaseConnected: !!process.env.SUPABASE_URL,
    deepgramConnected: !!process.env.DEEPGRAM_API_KEY,
    openaiConnected: !!process.env.OPENAI_API_KEY,
    activeSessions: activeSessions.size,
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 SalesGenius Backend v2.4.3-DEBUG running on port ${PORT}`);
  console.log(`✅ Supabase connected to: ${process.env.SUPABASE_URL}`);
  console.log(`✅ Health check available at: http://localhost:${PORT}/health`);
  console.log(`🔍 Debug token endpoint: http://localhost:${PORT}/debug-token (POST)`);
  console.log(`⚡ FULL DEBUG LOGGING ACTIVE - Every message will be logged`);
});

// Setup WebSocket Server
const wss = new WebSocketServer({ 
  server,
  path: '/stream-audio'
});

/**
 * Verifica l'autenticazione dell'utente tramite JWT
 */
async function authenticateUser(authToken: string): Promise<{ userId: string; isPremium: boolean } | null> {
  try {
    // Decodifica e verifica il JWT token usando il client ANON
    const { data: { user }, error } = await supabaseAuth.auth.getUser(authToken);
    
    if (error || !user) {
      console.error('Auth error:', error);
      return null;
    }

    // Verifica se l'utente è premium (dalla tabella user_profiles)
    // Usa supabaseAdmin per questa query perché ha permessi elevati
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      // Se non c'è profilo, assumiamo non sia premium
      return { userId: user.id, isPremium: false };
    }

    // Il campo 'is_premium' = true significa che l'utente è premium
    const isPremium = profile?.is_premium === true;
    
    console.log(`✅ User authenticated: ${user.id}, Premium: ${isPremium}`);
    return { userId: user.id, isPremium };
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

/**
 * Salva un suggerimento nella tabella sales_events
 */
async function saveSuggestion(
  session: UserSession,
  category: string,
  suggestion: string,
  transcriptContext: string,
  confidence: number
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('sales_events')
      .insert({
        id: crypto.randomUUID(),
        user_id: session.userId,
        session_id: session.sessionId,
        category,
        suggestion,
        transcript_context: transcriptContext,
        confidence,
        created_at: new Date().toISOString(),
        metadata: {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          processing_time_ms: Date.now() - session.startTime.getTime()
        }
      });

    if (error) {
      console.error('Error saving suggestion:', error);
    } else {
      console.log(`💾 Suggestion saved: [${category}] ${suggestion.substring(0, 50)}...`);
    }
  } catch (error) {
    console.error('Unexpected error saving suggestion:', error);
  }
}

// WebSocket connection handler
wss.on('connection', async (ws: WebSocket) => {
  console.log('🔌 New WebSocket connection');

  let deepgramConnection: any = null;
  let deepgramReady = false; // Flag per tracciare quando Deepgram è pronto
  let audioBuffer: Buffer[] = []; // Buffer per pacchetti audio in attesa
  let audioPacketsSent = 0; // Contatore pacchetti inviati a Deepgram
  let transcriptBuffer = '';
  let lastSuggestionTime = 0;
  const SUGGESTION_DEBOUNCE_MS = 15000; // 15 secondi tra suggerimenti (era 3s - troppo frequente)
  let currentUserId: string | null = null; // Traccia userId per rate limiting

  ws.on('message', async (message: Buffer) => {
    // LOG ASSOLUTO: Ogni messaggio ricevuto
    console.log(`📨 RAW MESSAGE: ${message.length} bytes, isBuffer: ${Buffer.isBuffer(message)}`);

    try {

      // Controlla se è un messaggio JSON di controllo
      if (message.length < 2000) {
        try {
          const json = JSON.parse(message.toString());

          // Gestione messaggio HELLO con autenticazione
          if (json.op === 'hello') {
            console.log('👋 Hello from client:', { op: json.op, hasToken: !!json.token });
            
            // Se c'è un token, autentica l'utente
            if (json.token) {
              const authResult = await authenticateUser(json.token);
              
              if (!authResult) {
                console.error('❌ Authentication failed');
                ws.send(JSON.stringify({ 
                  type: 'auth_failed', 
                  reason: 'Invalid token' 
                }));
                ws.close(1008, 'Authentication failed');
                return;
              }

              if (!authResult.isPremium) {
                console.log('⚠️ User is not premium');
                ws.send(JSON.stringify({
                  type: 'auth_failed',
                  reason: 'Not premium'
                }));
                ws.close(1008, 'Premium required');
                return;
              }

              // ⚡ CONTROLLO MAX CONNESSIONI PER UTENTE
              const currentConnections = userConnections.get(authResult.userId) || 0;
              if (currentConnections >= MAX_CONNECTIONS_PER_USER) {
                console.log(`❌ User ${authResult.userId} exceeded max connections (${currentConnections}/${MAX_CONNECTIONS_PER_USER})`);
                ws.send(JSON.stringify({
                  type: 'auth_failed',
                  reason: 'Too many active connections. Close other tabs and try again.'
                }));
                ws.close(1008, 'Max connections exceeded');
                return;
              }

              // Incrementa contatore connessioni
              userConnections.set(authResult.userId, currentConnections + 1);
              currentUserId = authResult.userId;

              // Crea la sessione autenticata
              const session: UserSession = {
                userId: authResult.userId,
                isPremium: authResult.isPremium,
                sessionId: `session_${Date.now()}_${authResult.userId.substring(0, 8)}`,
                startTime: new Date(),
                ws
              };

              activeSessions.set(ws, session);

              console.log(`✅ Premium user session created: ${session.sessionId} (connections: ${currentConnections + 1}/${MAX_CONNECTIONS_PER_USER})`);
              
              // Invia messaggio di conferma - IMPORTANTE: backend pronto
              ws.send(JSON.stringify({
                type: 'capture_ready', // Questo messaggio fa partire l'audio nell'extension
                sessionId: session.sessionId,
                isPremium: true
              }));
            } else {
              // Nessun token - modalità demo (per test)
              console.log('⚠️ No token provided - demo mode');
              const demoSession: UserSession = {
                userId: 'demo-user',
                isPremium: false,
                sessionId: `demo_${Date.now()}`,
                startTime: new Date(),
                ws
              };
              activeSessions.set(ws, demoSession);
              
              ws.send(JSON.stringify({ 
                type: 'capture_ready',
                sessionId: demoSession.sessionId,
                isPremium: false
              }));
            }
            return;
          }

          // Gestione messaggio AUTH (autenticazione post-connessione)
          if (json.op === 'auth') {
            console.log('🔐 Auth message received:', { op: json.op, hasJwt: !!json.jwt });

            if (json.jwt) {
              const authResult = await authenticateUser(json.jwt);

              if (!authResult) {
                console.error('❌ Authentication failed');
                ws.send(JSON.stringify({
                  type: 'auth_failed',
                  reason: 'Invalid token'
                }));
                ws.close(1008, 'Authentication failed');
                return;
              }

              if (!authResult.isPremium) {
                console.log('⚠️ User is not premium');
                ws.send(JSON.stringify({
                  type: 'auth_failed',
                  reason: 'Not premium'
                }));
                ws.close(1008, 'Premium required');
                return;
              }

              // ⚡ CONTROLLO MAX CONNESSIONI PER UTENTE
              const currentConnections = userConnections.get(authResult.userId) || 0;
              if (currentConnections >= MAX_CONNECTIONS_PER_USER) {
                console.log(`❌ User ${authResult.userId} exceeded max connections (${currentConnections}/${MAX_CONNECTIONS_PER_USER})`);
                ws.send(JSON.stringify({
                  type: 'auth_failed',
                  reason: 'Too many active connections. Close other tabs and try again.'
                }));
                ws.close(1008, 'Max connections exceeded');
                return;
              }

              // Incrementa contatore connessioni
              userConnections.set(authResult.userId, currentConnections + 1);
              currentUserId = authResult.userId;

              // Crea/aggiorna la sessione autenticata
              const session: UserSession = {
                userId: authResult.userId,
                isPremium: authResult.isPremium,
                sessionId: `session_${Date.now()}_${authResult.userId.substring(0, 8)}`,
                startTime: new Date(),
                ws
              };

              activeSessions.set(ws, session);

              console.log(`✅ Premium user authenticated via auth message: ${session.sessionId} (connections: ${currentConnections + 1}/${MAX_CONNECTIONS_PER_USER})`);

              // Invia conferma autenticazione
              ws.send(JSON.stringify({
                type: 'auth_success',
                sessionId: session.sessionId,
                isPremium: true
              }));
            } else {
              console.log('⚠️ Auth message without jwt');
              ws.send(JSON.stringify({
                type: 'auth_failed',
                reason: 'No JWT provided'
              }));
            }
            return;
          }

          if (json.op === 'audio') {
            // Header audio, il prossimo messaggio sarà il buffer audio
            console.log('🎧 Audio header received (ignored)');
            return;
          }

          // Messaggio JSON non riconosciuto
          console.log('❓ Unknown JSON message:', json);
        } catch (jsonError) {
          // Non è JSON, probabilmente è audio binario
          console.log('🔄 JSON parse failed, treating as binary audio data');
        }
      }

      // Verifica che esista una sessione
      const session = activeSessions.get(ws);
      if (!session) {
        console.warn(`⚠️ Received data without active session! Size: ${message.length} bytes`);
        return;
      }

      console.log(`✅ Session found: ${session.sessionId}`);

      // Log per pacchetti audio
      if (message.length >= 2000) {
        console.log(`🎵 Audio packet received: ${message.length} bytes`);
      } else if (message.length > 0) {
        console.log(`📊 Small packet received: ${message.length} bytes (not typical audio size)`);
      }

      // Inizializza Deepgram se necessario
      if (!deepgramConnection) {
        console.log('🎤 Initializing Deepgram connection...');

        deepgramConnection = deepgramClient.listen.live({
          encoding: 'linear16',      // PCM16 format
          sample_rate: 16000,        // 16kHz sample rate
          channels: 1,               // Mono audio
          language: 'it',
          punctuate: true,
          smart_format: true,
          model: 'nova-2',
          interim_results: true,
          utterance_end_ms: 2000,    // 2 secondi per frasi più lunghe
          vad_events: true,
        });

        // Gestione eventi Deepgram
        deepgramConnection.on(LiveTranscriptionEvents.Open, () => {
          console.log('✅ Deepgram connection opened');
          deepgramReady = true;

          // Invia tutti i pacchetti audio bufferizzati
          if (audioBuffer.length > 0) {
            console.log(`📤 Sending ${audioBuffer.length} buffered audio packets to Deepgram`);
            audioBuffer.forEach(packet => {
              if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
                deepgramConnection.send(packet);
                audioPacketsSent++;
              }
            });
            console.log(`   ✅ Total packets sent to Deepgram so far: ${audioPacketsSent}`);
            audioBuffer = []; // Svuota il buffer
          }
        });

        deepgramConnection.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
          const transcript = data.channel?.alternatives[0]?.transcript;
          const isFinal = data.is_final;
          const confidence = data.channel?.alternatives[0]?.confidence || 0;

          if (transcript && transcript.length > 0) {
            console.log(`📝 [${isFinal ? 'FINAL' : 'INTERIM'}] ${transcript} (confidence: ${confidence})`);

            if (isFinal) {
              transcriptBuffer += ' ' + transcript;
              console.log(`📊 Buffer length: ${transcriptBuffer.length} chars`);

              // Genera suggerimento solo se:
              // 1. È passato abbastanza tempo dall'ultimo
              // 2. La confidence è alta
              // 3. C'è abbastanza contesto
              // 4. ⚡ NON ha superato il rate limit
              const now = Date.now();
              const timeSinceLastSuggestion = now - lastSuggestionTime;

              console.log(`🔍 Check suggestion conditions: confidence=${confidence.toFixed(2)}, bufferLen=${transcriptBuffer.length}, timeSince=${timeSinceLastSuggestion}ms, debounce=${SUGGESTION_DEBOUNCE_MS}ms`);

              if (confidence >= 0.75 &&
                  transcriptBuffer.length > 150 &&
                  timeSinceLastSuggestion > SUGGESTION_DEBOUNCE_MS) {

                console.log('✅ Conditions met, generating suggestion...');

                // ⚡ CONTROLLO RATE LIMIT SUGGERIMENTI
                if (session.userId !== 'demo-user') {
                  const userStats = userSuggestions.get(session.userId);
                  const currentTime = Date.now();

                  if (!userStats || currentTime > userStats.resetTime) {
                    // Reset contatore ogni 5 minuti
                    userSuggestions.set(session.userId, {
                      count: 0,
                      resetTime: currentTime + 5 * 60 * 1000
                    });
                  }

                  const stats = userSuggestions.get(session.userId)!;

                  if (stats.count >= MAX_SUGGESTIONS_PER_5MIN) {
                    console.log(`⚠️ User ${session.userId} exceeded suggestion rate limit (${stats.count}/${MAX_SUGGESTIONS_PER_5MIN})`);
                    ws.send(JSON.stringify({
                      type: 'rate_limit',
                      message: 'Rate limit reached. Please wait a few minutes.',
                      resetTime: stats.resetTime
                    }));
                    return;
                  }

                  // Incrementa contatore
                  stats.count++;
                  console.log(`📊 Suggestion ${stats.count}/${MAX_SUGGESTIONS_PER_5MIN} for user ${session.userId}`);
                }

                lastSuggestionTime = now;

                // Chiama la funzione GPT per generare suggerimenti
                await handleGPTSuggestion(
                  transcriptBuffer,
                  ws,
                  async (category: string, suggestion: string) => {
                    // Callback per salvare il suggerimento (solo per utenti autenticati)
                    if (session.userId !== 'demo-user') {
                      await saveSuggestion(
                        session,
                        category,
                        suggestion,
                        transcriptBuffer.slice(-500), // Ultimi 500 caratteri di contesto
                        confidence
                      );
                    }
                  }
                );

                // Mantieni solo gli ultimi 1000 caratteri nel buffer
                if (transcriptBuffer.length > 1000) {
                  transcriptBuffer = transcriptBuffer.slice(-800);
                }
              } else {
                // Log del motivo per cui il suggerimento NON viene generato
                const reasons = [];
                if (confidence < 0.75) reasons.push(`confidence too low (${confidence.toFixed(2)} < 0.75)`);
                if (transcriptBuffer.length <= 150) reasons.push(`buffer too short (${transcriptBuffer.length} <= 150)`);
                if (timeSinceLastSuggestion <= SUGGESTION_DEBOUNCE_MS) reasons.push(`debounce not elapsed (${timeSinceLastSuggestion}ms <= ${SUGGESTION_DEBOUNCE_MS}ms)`);
                console.log(`⏸️ Suggestion skipped: ${reasons.join(', ')}`);
              }
            }
          }
        });

        deepgramConnection.on(LiveTranscriptionEvents.Error, (error: any) => {
          console.error('❌ Deepgram error:', JSON.stringify(error, null, 2));
        });

        deepgramConnection.on(LiveTranscriptionEvents.Close, (closeEvent: any) => {
          console.log('🔌 Deepgram connection closed:', closeEvent);
          console.log(`   - Had ${audioBuffer.length} buffered packets at close time`);
          console.log(`   - Total packets sent: ${audioPacketsSent}`);
          console.log(`   - deepgramReady was: ${deepgramReady}`);
          deepgramConnection = null;
          deepgramReady = false;
          audioBuffer = []; // Pulisci il buffer
        });

        deepgramConnection.on(LiveTranscriptionEvents.Metadata, (metadata: any) => {
          console.log('📊 Deepgram metadata:', metadata);
        });
      }

      // Invia audio a Deepgram (o bufferizza se non è ancora pronto)
      if (deepgramConnection) {
        const readyState = deepgramConnection.getReadyState();
        console.log(`🔍 Deepgram state - Ready: ${deepgramReady}, ReadyState: ${readyState}`);

        if (deepgramReady && readyState === 1) {
          // Deepgram è pronto: invia immediatamente
          deepgramConnection.send(message);
          audioPacketsSent++;
          console.log(`✅ Sending audio packet directly to Deepgram (${message.length} bytes) - Total sent: ${audioPacketsSent}`);
        } else {
          // Deepgram non è ancora pronto: bufferizza il pacchetto
          audioBuffer.push(message);
          console.log(`📦 Buffering audio packet... (${audioBuffer.length} in queue, ready: ${deepgramReady}, state: ${readyState})`);
        }
      } else {
        console.log('⚠️ No Deepgram connection available to send audio');
      }

    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', async () => {
    console.log('👋 WebSocket connection closed');

    // ⚡ DECREMENTA CONTATORE CONNESSIONI
    if (currentUserId) {
      const connections = userConnections.get(currentUserId) || 0;
      if (connections > 0) {
        userConnections.set(currentUserId, connections - 1);
        console.log(`📉 User ${currentUserId} connections: ${connections - 1}/${MAX_CONNECTIONS_PER_USER}`);
      }
      if (connections - 1 <= 0) {
        userConnections.delete(currentUserId);
      }
    }

    const session = activeSessions.get(ws);
    if (session && session.userId !== 'demo-user') {
      // Log della fine sessione
      const duration = (Date.now() - session.startTime.getTime()) / 1000;

      try {
        await supabaseAdmin
          .from('sales_events')
          .insert({
            id: crypto.randomUUID(),
            user_id: session.userId,
            session_id: session.sessionId,
            category: 'system',
            suggestion: 'Session ended',
            transcript_context: `Duration: ${duration}s`,
            confidence: 1,
            created_at: new Date().toISOString(),
            metadata: { event: 'session_end', duration_seconds: duration }
          });
      } catch (error) {
        console.error('Error logging session end:', error);
      }
    }

    // Cleanup
    activeSessions.delete(ws);
    
    if (deepgramConnection) {
      deepgramConnection.finish();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// ==========================================
// GRACEFUL SHUTDOWN (FIX PER RENDER)
// ==========================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log('⏳ Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n📡 ${signal} received, starting graceful shutdown...`);
  
  // 1. Stop accettare nuove connessioni
  console.log('1️⃣ Stopping new connections...');
  wss.close((err) => {
    if (err) console.error('Error closing WebSocket server:', err);
  });
  
  // 2. Notifica tutti i client connessi
  console.log(`2️⃣ Notifying ${activeSessions.size} active clients...`);
  const closePromises: Promise<void>[] = [];
  
  activeSessions.forEach((session, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ 
          type: 'server_shutdown',
          message: 'Server is restarting. Please reconnect in a moment.'
        }));
        
        closePromises.push(
          new Promise<void>((resolve) => {
            ws.close(1001, 'Server restarting');
            setTimeout(resolve, 100);
          })
        );
      } catch (error) {
        console.error('Error notifying client:', error);
      }
    }
  });
  
  // 3. Aspetta che tutti i client si disconnettano (max 5 secondi)
  try {
    await Promise.race([
      Promise.all(closePromises),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]);
    console.log('3️⃣ All clients disconnected');
  } catch (error) {
    console.error('Error during client disconnection:', error);
  }
  
  // 4. Chiudi il server HTTP
  console.log('4️⃣ Closing HTTP server...');
  server.close(() => {
    console.log('✅ Server closed gracefully');
    process.exit(0);
  });
  
  // 5. Timeout di sicurezza - forza l'uscita dopo 10 secondi
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Gestisci SIGTERM (Render, Docker, Kubernetes)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Gestisci SIGINT (Ctrl+C locale)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestisci errori non catturati
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Non fare shutdown per unhandled rejections, solo logga
});

console.log('✅ Graceful shutdown handlers registered');

