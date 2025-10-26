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

      // 1) Richiedi condivisione schermo + audio
      const dispStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      // Verifica presenza traccia audio
      const audioTrack = dispStream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error(
          "Nessuna traccia audio condivisa. Riavvia e spunta 'Condividi audio' nel prompt del browser."
        );
      }

      dispStreamRef.current = dispStream;

      // 2) Setup AudioContext a 16kHz + AudioWorklet per PCM16
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;

      // Worklet inline per conversione PCM16
      const workletCode = `
        class PCMWorklet extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (!input || !input[0]) return true;
            const ch0 = input[0];
            const pcm = new Int16Array(ch0.length);
            for (let i = 0; i < ch0.length; i++) {
              let s = Math.max(-1, Math.min(1, ch0[i]));
              pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(pcm);
            return true;
          }
        }
        registerProcessor('pcm-worklet', PCMWorklet);
      `;

      const blob = new Blob([workletCode], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      // Connessione audio: source -> gain -> worklet
      const source = ctx.createMediaStreamSource(dispStream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);

      const workletNode = new AudioWorkletNode(ctx, 'pcm-worklet', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
      });
      workletNodeRef.current = workletNode;
      gain.connect(workletNode);

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
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const pcm = e.data as Int16Array;

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

      // Cleanup WebSocket
      if (wsRef.current) {
        wsRef.current.close();
      }

    } finally {
      // Reset refs
      workletNodeRef.current = null;
      ctxRef.current = null;
      dispStreamRef.current = null;
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
              <li><strong>Windows/Chrome:</strong> Seleziona "Schermo intero" e spunta "Condividi audio"</li>
              <li><strong>macOS:</strong> Seleziona "Scheda di Chrome" e spunta "Condividi audio scheda"</li>
              <li>Per Google Meet/Zoom: condividi la scheda del browser con l'audio</li>
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
