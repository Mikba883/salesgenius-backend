/**
 * SalesGenius - GPT Handler (modulare + logging Supabase)
 * =======================================================
 * Gestisce le chiamate a GPT usando il sistema di prompt strutturato.
 * Importato da server.ts quando serve generare suggerimenti.
 * Ogni risposta viene salvata nella tabella "sales_events".
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { buildMessages, QUALITY_PRESETS } from "./prompts";

// ==========================================
// CONFIGURAZIONE
// ==========================================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ⚠️ Usa la SERVICE_KEY per scritture lato server (non la anon key)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ==========================================
// FUNZIONE PRINCIPALE
// ==========================================
export async function generateSuggestion({
  transcript,
  context = "",
  category = "Discovery",
  confidence = 0.7,
  orgId,
  userId,
  meetingId,
}: {
  transcript: string;
  context?: string;
  category?: string;
  confidence?: number;
  orgId?: string;
  userId?: string;
  meetingId?: string;
}) {
  try {
    // Costruzione prompt dinamico
    const messages = buildMessages({
      category,
      transcript,
      context,
      confidence,
    });

    const start = Date.now();

    // Chiamata a GPT
    const response = await openai.chat.completions.create({
      ...QUALITY_PRESETS.balanced,
      messages,
    });

    const raw = response.choices?.[0]?.message?.content?.trim() || "";
    let output;

    try {
      output = JSON.parse(raw);
    } catch {
      // fallback se GPT non restituisce JSON valido
      output = {
        language: "unknown",
        intent: "unspecified",
        category,
        suggestion: raw,
      };
    }

    const latency_ms = Date.now() - start;
    const tokens_used = response.usage?.total_tokens ?? 0;

    const result = {
      ...output,
      latency_ms,
      tokens_used,
      model: QUALITY_PRESETS.balanced.model,
    };

    console.log("🧠 GPT structured output:", result);

    // ==========================================
    // SALVATAGGIO SU SUPABASE
    // ==========================================
    try {
      const { error } = await supabase.from("sales_events").insert([
        {
          organization_id: orgId || null,
          user_id: userId || null,
          meeting_id: meetingId || null,
          transcript,
          confidence,
          language: result.language,
          intent: result.intent,
          category: result.category,
          suggestion: result.suggestion,
          latency_ms: result.latency_ms,
          tokens_used: result.tokens_used,
          model: result.model,
          confidence_threshold: confidence,
        },
      ]);

      if (error) {
        console.warn("⚠️ Errore salvataggio Supabase:", error.message);
      } else {
        console.log("✅ Evento salvato in sales_events");
      }
    } catch (dbErr: any) {
      console.error("❌ Errore DB Supabase:", dbErr.message || dbErr);
    }

    // ==========================================
    // RITORNO RISULTATO
    // ==========================================
    return result;
  } catch (e: any) {
    console.error("❌ GPT Handler Error:", e);
    return {
      language: "error",
      intent: "error",
      category: "System",
      suggestion: "GPT request failed.",
      latency_ms: 0,
      tokens_used: 0,
    };
  }
}
