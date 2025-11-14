'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Configurazione
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://salesgenius-audio.onrender.com/stream-audio";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Inizializza Supabase client (solo se le chiavi sono presenti)
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Metadata categorie
const CATEGORY_META = {
  conversational: { icon: "🎧", label: "Conversational & Discovery" },
  value: { icon: "💎", label: "Value & Objection Handling" },
  closing: { icon: "✅", label: "Closing & Next Steps" },
  market: { icon: "🌐", label: "Market & Context Intelligence" },
} as const;

type CategoryKey = keyof typeof CATEGORY_META;

interface Suggestion {
  id: string;
  category: CategoryKey;
  text: string;
  status: 'live' | 'done';
  timestamp: number;
}

export default function SalesGeniusStream() {
  const [isSharing, setIsSharing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [user, setUser] = useState<any>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  // Refs per gestire lo stato senza re-render
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const dispStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const seqRef = useRef(0);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (!supabase) {
        setIsAuthenticating(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setIsAuthenticating(false);

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });

      return () => subscription.unsubscribe();
    };

    checkAuth();
  }, []);

  const startShare = async () => {
    try {
      setError(null);

      // 1) Richiedi condivisione schermo + audio (per catturare altri partecipanti)
      const dispStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      dispStreamRef.current = dispStream;

      // 2) Richiedi microfono (per catturare il tuo audio)
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        micStreamRef.current = micStream;
        console.log('🎤 Microfono catturato con successo');
      } catch (micError) {
        console.warn('⚠️ Impossibile catturare il microfono:', micError);
        // Continua comunque con solo l'audio della condivisione
      }

      // Verifica presenza traccia audio dalla condivisione
      const audioTrack = dispStream.getAudioTracks()[0];
      if (!audioTrack && !micStream) {
        throw new Error(
          "Nessuna traccia audio disponibile. Riavvia e spunta 'Condividi audio' nel prompt del browser."
        );
      }

      // 3) Setup AudioContext a 16kHz + AudioWorklet per PCM16
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;

      // Worklet inline per conversione PCM16 con supporto stereo
      const workletCode = `
        class PCMWorklet extends AudioWorkletProcessor {
          constructor() {
            super();
            this.frameCount = 0;
            this.hasAudio = false;
          }

          process(inputs) {
            const input = inputs[0];
            if (!input || input.length === 0) return true;

            // Verifica se abbiamo almeno un canale
            const ch0 = input[0];
            if (!ch0 || ch0.length === 0) return true;

            // Se l'input è stereo, fai il downmix a mono (media dei due canali)
            const numChannels = input.length;
            const samples = ch0.length;
            const mono = new Float32Array(samples);

            if (numChannels === 1) {
              // Input mono: copia direttamente
              mono.set(ch0);
            } else {
              // Input stereo o multi-canale: fai la media di tutti i canali
              for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let ch = 0; ch < numChannels && ch < input.length; ch++) {
                  if (input[ch] && input[ch][i] !== undefined) {
                    sum += input[ch][i];
                  }
                }
                mono[i] = sum / numChannels;
              }
            }

            // Converti in PCM16
            const pcm = new Int16Array(samples);
            let maxSample = 0;
            for (let i = 0; i < samples; i++) {
              let s = Math.max(-1, Math.min(1, mono[i]));
              pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              maxSample = Math.max(maxSample, Math.abs(s));
            }

            // Log periodico per debug (ogni 100 frame ~ 3 secondi)
            this.frameCount++;
            if (maxSample > 0.01) this.hasAudio = true;

            if (this.frameCount % 100 === 0) {
              this.port.postMessage({
                type: 'debug',
                frameCount: this.frameCount,
                channels: numChannels,
                samples: samples,
                maxSample: maxSample.toFixed(4),
                hasAudio: this.hasAudio
              });
            }

            // Invia i dati audio
            this.port.postMessage({ type: 'audio', data: pcm });
            return true;
          }
        }
        registerProcessor('pcm-worklet', PCMWorklet);
      `;

      const blob = new Blob([workletCode], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      // Crea un mixer per combinare audio schermo + microfono
      const mixer = ctx.createGain();
      mixer.gain.value = 1.5; // Aumentato leggermente per compensare il mixing

      // Connetti audio dalla condivisione schermo (se presente)
      if (audioTrack) {
        const displaySource = ctx.createMediaStreamSource(dispStream);
        const displayGain = ctx.createGain();
        displayGain.gain.value = 1.2; // Volume audio condivisione leggermente aumentato
        displaySource.connect(displayGain);
        displayGain.connect(mixer);
        console.log('🔊 Audio condivisione schermo connesso');
        console.log(`   - Canali: ${displaySource.channelCount}`);
        console.log(`   - Sample rate: ${ctx.sampleRate}Hz`);
      }

      // Connetti audio dal microfono (se presente)
      if (micStream) {
        const micSource = ctx.createMediaStreamSource(micStream);
        const micGain = ctx.createGain();
        micGain.gain.value = 1.2; // Volume microfono leggermente aumentato
        micSource.connect(micGain);
        micGain.connect(mixer);
        console.log('🎤 Audio microfono connesso');
        console.log(`   - Canali: ${micSource.channelCount}`);
      }

      // Connetti il mixer al worklet per l'encoding PCM16
      const workletNode = new AudioWorkletNode(ctx, 'pcm-worklet', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 2, // Accetta input stereo
        channelCountMode: 'max', // Usa il massimo numero di canali disponibili
        channelInterpretation: 'speakers', // Interpreta come speakers (stereo)
      });
      workletNodeRef.current = workletNode;
      mixer.connect(workletNode);

      console.log('✅ Audio mixer creato - cattura completa attiva!');

      // 3) Connessione WebSocket
      setConnectionStatus('connecting');
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        // Messaggio di hello/auth
        ws.send(JSON.stringify({
          op: "hello",
          app: "salesgenius-web",
          version: "0.1",
          timestamp: Date.now(),
        }));

        // Autentica con JWT se disponibile
        if (supabase && user) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.access_token) {
              ws.send(JSON.stringify({ 
                op: "auth", 
                jwt: session.access_token 
              }));
              console.log('🔐 Sent authentication token');
            }
          });
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handleWSMessage(msg);
        } catch (e) {
          console.error("Error parsing WS message:", e);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        console.log("WebSocket closed");
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
        setError("Errore di connessione WebSocket");
        setConnectionStatus('disconnected');
      };

      // 4) Stream PCM16 continuo
      workletNode.port.onmessage = (e) => {
        const msg = e.data;

        // Gestisci messaggi di debug dal worklet
        if (msg.type === 'debug') {
          console.log(`🎵 Worklet Debug - Frame: ${msg.frameCount}, Canali: ${msg.channels}, Max: ${msg.maxSample}, HasAudio: ${msg.hasAudio}`);
          return;
        }

        // Gestisci dati audio
        if (msg.type === 'audio') {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          const pcm = msg.data as Int16Array;

          // Header JSON
          wsRef.current.send(JSON.stringify({
            op: "audio",
            seq: seqRef.current++,
            sr: 16000,
            ch: 1,
            samples: pcm.length,
          }));

          // Frame binario
          wsRef.current.send(pcm.buffer);
        }
      };

      // 5) Cleanup automatico quando l'utente ferma la condivisione
      dispStream.getVideoTracks()[0].addEventListener('ended', stopShare);

      setIsSharing(true);

    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto durante la condivisione";
      setError(message);
      console.error("Error starting share:", err);
    }
  };

  const stopShare = () => {
    try {
      // Cleanup audio
      workletNodeRef.current?.disconnect();
      ctxRef.current?.close();
      dispStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current?.getTracks().forEach(t => t.stop());

      // Cleanup WebSocket
      if (wsRef.current) {
        wsRef.current.close();
      }

    } finally {
      // Reset refs
      workletNodeRef.current = null;
      ctxRef.current = null;
      dispStreamRef.current = null;
      micStreamRef.current = null;
      wsRef.current = null;
      seqRef.current = 0;

      setIsSharing(false);
      setConnectionStatus('disconnected');
    }
  };

  const handleWSMessage = (msg: any) => {
    if (msg.type === "suggestion.start") {
      setSuggestions(prev => [{
        id: msg.id,
        category: msg.category as CategoryKey,
        text: "",
        status: 'live',
        timestamp: Date.now(),
      }, ...prev]);

    } else if (msg.type === "suggestion.delta") {
      setSuggestions(prev =>
        prev.map(s =>
          s.id === msg.id
            ? { ...s, text: s.text + msg.textChunk }
            : s
        )
      );

    } else if (msg.type === "suggestion.end") {
      setSuggestions(prev =>
        prev.map(s =>
          s.id === msg.id
            ? { ...s, status: 'done' }
            : s
        )
      );
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSharing) {
        stopShare();
      }
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header + Controls */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">SalesGenius Live</h1>
        <p className="text-gray-400 mb-4">
          Condividi il tuo schermo e ricevi suggerimenti in tempo reale durante le chiamate di vendita.
        </p>

        {/* Authentication Status */}
        {supabase && (
          <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
            {isAuthenticating ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Verifica autenticazione...
              </div>
            ) : user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm text-gray-300">
                    Autenticato come <strong className="text-white">{user.email}</strong>
                  </span>
                </div>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setUser(null);
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span className="text-sm text-gray-400">Non autenticato</span>
                </div>
                <button
                  onClick={async () => {
                    // Redirect to login page or open auth modal
                    await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: window.location.href,
                      }
                    });
                  }}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  Login con Google
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 items-center">
          <button
            onClick={startShare}
            disabled={isSharing || (supabase && !user)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {isSharing ? "In condivisione..." : "Avvia Condivisione"}
          </button>

          {isSharing && (
            <button
              onClick={stopShare}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Ferma
            </button>
          )}

          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-gray-500'
              }`}
            />
            <span className="text-sm text-gray-400">
              {connectionStatus === 'connected' ? 'Connesso' :
               connectionStatus === 'connecting' ? 'Connessione...' :
               'Disconnesso'}
            </span>
          </div>
        </div>

        {/* Istruzioni */}
        {!isSharing && (
          <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
            <p className="text-sm text-blue-200">
              <strong>💡 Suggerimento:</strong> Quando clicchi "Avvia Condivisione":
            </p>
            <ul className="mt-2 text-sm text-blue-200 space-y-1 list-disc list-inside">
              <li><strong>1° Permesso - Condivisione Schermo:</strong> Seleziona la scheda con Google Meet/Zoom e spunta "Condividi audio scheda" (cattura audio altri partecipanti)</li>
              <li><strong>2° Permesso - Microfono:</strong> Autorizza l'accesso al microfono (cattura il tuo audio)</li>
              <li>✅ Entrambi gli audio verranno mixati e analizzati in tempo reale!</li>
            </ul>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-lg">
            <p className="text-sm text-red-200">
              <strong>⚠️ Errore:</strong> {error}
            </p>
          </div>
        )}
      </div>

      {/* Suggestions feed */}
      <div className="space-y-3">
        {suggestions.length === 0 && isSharing && (
          <div className="text-center py-12 text-gray-500">
            In ascolto... I suggerimenti appariranno qui in tempo reale.
          </div>
        )}

        {suggestions.map((suggestion) => {
          const meta = CATEGORY_META[suggestion.category];
          return (
            <div
              key={suggestion.id}
              className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl transition-all hover:border-zinc-700"
            >
              {/* Header con categoria */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{meta.icon}</span>
                <strong className="text-white">{meta.label}</strong>
                <span
                  className={`ml-auto text-xs px-2 py-1 rounded ${
                    suggestion.status === 'live'
                      ? 'bg-green-900/30 text-green-400 animate-pulse'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {suggestion.status === 'live' ? 'live' : 'completato'}
                </span>
              </div>

              {/* Testo suggerimento */}
              <div className="text-gray-200 leading-relaxed">
                {suggestion.text || <span className="text-gray-500 italic">Generazione in corso...</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer con limiti */}
      {suggestions.length > 20 && (
        <div className="mt-4 text-center text-sm text-gray-500">
          Mostrando gli ultimi 20 suggerimenti
        </div>
      )}
    </div>
  );
}
