import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import dotenv from "dotenv";
import { generateSuggestion } from "./gpt-handler"; // 🔹 nuovo handler GPT
dotenv.config();

// ==========================================
// CONFIGURAZIONE
// ==========================================
const PORT = parseInt(process.env.PORT || "8080", 10);
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;
const deepgram = createClient(DEEPGRAM_API_KEY);

// ==========================================
// EXPRESS
// ==========================================
const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

app.get("/health", (_, res) =>
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "3.1.0",
  })
);

const server = createServer(app);
const wss = new WebSocketServer({ server });

// ==========================================
// HELPER: Rimozione dati sensibili
// ==========================================
function sanitizeTranscript(text: string): string {
  // 🔹 Rimuove email, numeri di telefono e codici numerici lunghi
  return text.replace(
    /(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)|(\+\d{6,})|(\b\d{6,}\b)/gi,
    "[REDACTED]"
  );
}

// ==========================================
// GESTIONE CONNESSIONE
// ==========================================
wss.on("connection", (ws: WebSocket) => {
  console.log("🔌 Nuovo client connesso");

  let deepgramLive: any = null;
  let conversationHistory: string[] = [];
  let audioChunksReceived = 0;
  let lastTranscriptTime = Date.now();
  let lastSuggestionTime = 0;
  let confidenceThreshold = 0.7;

  const FLUSH_INTERVAL_MS = 5000;

  // ==========================================
  // AVVIO DEEPGRAM
  // ==========================================
  try {
    deepgramLive = deepgram.listen.live({
      model: "nova-2",
      language: "it",
      smart_format: true,
      interim_results: true,
      vad_events: true,
      encoding: "linear16",
      sample_rate: 16000,
      channels: 1,
    });

    console.log("🎙️ Deepgram configurato (16kHz, mono)");

    deepgramLive.on(LiveTranscriptionEvents.Open, () => {
      console.log("✅ Deepgram connesso");
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

      console.log(
        `[DG] ${isFinal ? "FINAL" : "INTERIM"} (${conf.toFixed(
          2
        )}, thr=${confidenceThreshold.toFixed(2)}): "${text}"`
      );
      lastTranscriptTime = Date.now();

      // 🔹 Aggiorna soglia dinamica
      if (conf < confidenceThreshold - 0.2)
        confidenceThreshold = Math.max(0.5, confidenceThreshold - 0.05);
      if (conf > confidenceThreshold + 0.1)
        confidenceThreshold = Math.min(0.9, confidenceThreshold + 0.05);

      // 🔹 Solo frasi finali e di qualità sufficiente
      if (isFinal && conf >= confidenceThreshold && text.split(" ").length > 4) {
        const sanitizedText = sanitizeTranscript(text); // ✅ protezione PII
        ws.send(JSON.stringify({ type: "transcript", text: sanitizedText, confidence: conf }));

        conversationHistory.push(sanitizedText);
        if (conversationHistory.length > 15) conversationHistory.shift();

        // 🔹 Evita spam GPT
        if (Date.now() - lastSuggestionTime > 500) {
          lastSuggestionTime = Date.now();
          const context = conversationHistory.slice(-7).join("\n");

          console.log("🧠 Generando suggerimento strutturato...");
          const gpt = await generateSuggestion({
            transcript: sanitizedText,
            context,
            confidence: conf,
            // se vuoi: orgId, userId, meetingId possono essere aggiunti qui
          });

          if (ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                type: "suggestion",
                ...gpt,
                timestamp: new Date().toISOString(),
              })
            );
          }
        }
      }
    });

    // ==========================================
    // ERRORI / CLOSE
    // ==========================================
    deepgramLive.on(LiveTranscriptionEvents.Error, (e: any) => {
      console.error("❌ Deepgram error:", e);
    });

    deepgramLive.on(LiveTranscriptionEvents.Close, (ev: any) => {
      console.log("🔌 Deepgram disconnesso:", ev.reason || ev.code);
    });

    // ==========================================
    // FORZA FLUSH OGNI 5s
    // ==========================================
    setInterval(() => {
      if (deepgramLive && deepgramLive.getReadyState() === 1) {
        const idle = Date.now() - lastTranscriptTime;
        if (idle > FLUSH_INTERVAL_MS) {
          console.log("🧹 Flush forzato (idle > 5s)");
          deepgramLive.send(JSON.stringify({ type: "flush" }));
        }
      }
    }, FLUSH_INTERVAL_MS);
  } catch (e) {
    console.error("❌ Errore inizializzazione Deepgram:", e);
  }

  // ==========================================
  // RICEZIONE AUDIO
  // ==========================================
  ws.on("message", (msg: Buffer) => {
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

  // ==========================================
  // CHIUSURA
  // ==========================================
  ws.on("close", () => {
    console.log("👋 Client disconnesso");
    if (deepgramLive) deepgramLive.finish();
  });

  ws.on("error", (err) => console.error("❌ WebSocket errore:", err));
});

// ==========================================
// AVVIO SERVER
// ==========================================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SalesGenius Backend running on port ${PORT}`);
});
