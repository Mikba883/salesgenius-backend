// server/src/server.ts
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient, DeepgramClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { config } from 'dotenv';
import { handleGPTSuggestion } from './gpt-handler';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

// Carica le variabili d'ambiente
config();

// Inizializza Supabase
const supabase: SupabaseClient = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Usa SERVICE_KEY per operazioni server-side
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
const PORT = process.env.PORT || 8080;

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'salesgenius-backend',
    timestamp: new Date().toISOString()
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 SalesGenius Backend running on port ${PORT}`);
  console.log(`✅ Supabase connected to: ${process.env.SUPABASE_URL}`);
});

// Setup WebSocket Server
const wss = new WebSocketServer({ 
  server,
  path: '/stream-audio'
});

/**
 * Verifica l'autenticazione dell'utente
 */
async function authenticateUser(authToken: string): Promise<{ userId: string; isPremium: boolean } | null> {
  try {
    // Decodifica e verifica il JWT token
    const { data: { user }, error } = await supabase.auth.getUser(authToken);
    
    if (error || !user) {
      console.error('Auth error:', error);
      return null;
    }

    // Verifica se l'utente è premium (dalla tabella user_profiles)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      // Se non c'è profilo, assumiamo non sia premium
      return { userId: user.id, isPremium: false };
    }

    // Il campo 'used' = true significa che l'utente è premium
    const isPremium = profile?.used === true;
    
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
    const { error } = await supabase
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
wss.on('connection', async (ws: WebSocket, req: any) => {
  console.log('🔌 New WebSocket connection attempt');

  // Estrai il token dall'header Authorization o dalla query string
  const authHeader = req.headers['authorization'];
  const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
  const token = authHeader?.replace('Bearer ', '') || urlParams.get('token');

  // Se non c'è token, permetti comunque la connessione (modalità demo)
  // In produzione, potresti voler rifiutare la connessione
  if (!token) {
    console.log('⚠️ No auth token provided - running in demo mode');
    // Crea una sessione demo
    const demoSession: UserSession = {
      userId: 'demo-user',
      isPremium: false,
      sessionId: `demo_${Date.now()}`,
      startTime: new Date(),
      ws
    };
    activeSessions.set(ws, demoSession);
  } else {
    // Autentica l'utente
    const authResult = await authenticateUser(token);
    
    if (!authResult) {
      console.error('❌ Authentication failed');
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Authentication failed. Please login again.' 
      }));
      ws.close(1008, 'Authentication failed');
      return;
    }

    if (!authResult.isPremium) {
      console.log('⚠️ User is not premium');
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Premium subscription required for SalesGenius' 
      }));
      ws.close(1008, 'Premium required');
      return;
    }

    // Crea la sessione autenticata
    const session: UserSession = {
      userId: authResult.userId,
      isPremium: authResult.isPremium,
      sessionId: `session_${Date.now()}_${authResult.userId.substring(0, 8)}`,
      startTime: new Date(),
      ws
    };
    
    activeSessions.set(ws, session);
    
    // Invia conferma al client
    ws.send(JSON.stringify({
      type: 'auth_success',
      sessionId: session.sessionId,
      isPremium: session.isPremium
    }));
  }

  let deepgramConnection: any = null;
  let transcriptBuffer = '';
  let lastSuggestionTime = 0;
  const SUGGESTION_DEBOUNCE_MS = 3000; // Almeno 3 secondi tra suggerimenti

  ws.on('message', async (message: Buffer) => {
    const session = activeSessions.get(ws);
    if (!session) return;

    try {
      // Controlla se è un messaggio JSON di controllo
      if (message.length < 100) {
        try {
          const json = JSON.parse(message.toString());
          
          if (json.op === 'hello') {
            console.log('👋 Hello from client:', json);
            ws.send(JSON.stringify({ 
              type: 'hello_ack', 
              version: '1.0',
              sessionId: session.sessionId 
            }));
            return;
          }
          
          if (json.op === 'audio') {
            // Header audio, il prossimo messaggio sarà il buffer audio
            return;
          }
        } catch {
          // Non è JSON, probabilmente è audio binario
        }
      }

      // Inizializza Deepgram se necessario
      if (!deepgramConnection) {
        console.log('🎤 Initializing Deepgram connection...');
        
        deepgramConnection = deepgramClient.listen.live({
          language: 'it',
          punctuate: true,
          smart_format: true,
          model: 'nova-2',
          interim_results: true,
          utterance_end_ms: 1000,
          vad_events: true,
        });

        // Gestione eventi Deepgram
        deepgramConnection.on(LiveTranscriptionEvents.Open, () => {
          console.log('✅ Deepgram connection opened');
        });

        deepgramConnection.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
          const transcript = data.channel?.alternatives[0]?.transcript;
          const isFinal = data.is_final;
          const confidence = data.channel?.alternatives[0]?.confidence || 0;

          if (transcript && transcript.length > 0) {
            console.log(`📝 [${isFinal ? 'FINAL' : 'INTERIM'}] ${transcript}`);
            
            if (isFinal) {
              transcriptBuffer += ' ' + transcript;
              
              // Genera suggerimento solo se:
              // 1. È passato abbastanza tempo dall'ultimo
              // 2. La confidence è alta
              // 3. C'è abbastanza contesto
              const now = Date.now();
              if (confidence >= 0.7 && 
                  transcriptBuffer.length > 50 && 
                  (now - lastSuggestionTime) > SUGGESTION_DEBOUNCE_MS) {
                
                lastSuggestionTime = now;
                
                // Chiama la funzione GPT per generare suggerimenti
                await handleGPTSuggestion(
                  transcriptBuffer,
                  ws,
                  async (category: string, suggestion: string) => {
                    // Callback per salvare il suggerimento
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
              }
            }
          }
        });

        deepgramConnection.on(LiveTranscriptionEvents.Error, (error: any) => {
          console.error('❌ Deepgram error:', error);
        });

        deepgramConnection.on(LiveTranscriptionEvents.Close, () => {
          console.log('🔌 Deepgram connection closed');
          deepgramConnection = null;
        });
      }

      // Invia audio a Deepgram
      if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
        deepgramConnection.send(message);
      }

    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', async () => {
    console.log('👋 WebSocket connection closed');
    
    const session = activeSessions.get(ws);
    if (session && session.userId !== 'demo-user') {
      // Log della fine sessione
      const duration = (Date.now() - session.startTime.getTime()) / 1000;
      
      try {
        await supabase
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing connections...');
  wss.close();
  server.close();
  process.exit(0);
});


