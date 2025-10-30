/**
 * SalesGenius - GPT Handler (modulare)
 * ====================================
 * Gestisce le chiamate a GPT usando il sistema di prompt strutturato.
 * Importato da server.ts quando serve generare suggerimenti.
 */

import OpenAI from "openai";
import { buildMessages, QUALITY_PRESETS } from "./prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Crea un suggerimento GPT strutturato.
 * @param transcript  → frase finale trascritta da Deepgram
 * @param context     → ultime frasi (buffer conversazione)
 * @param confidence  → livello di confidenza Deepgram
 */
export async function generateSuggestion({
  transcript,
  context = "",
  category = "Discovery",
  confidence = 0.7,
}: {
  transcript: string;
  context?: string;
  category?: string;
  confidence?: number;
}) {
  try {
    const messages = buildMessages({
      category,
      transcript,
      context,
      confidence,
    });

    const start = Date.now();

    const response = await openai.chat.completions.create({
      ...QUALITY_PRESETS.balanced,
      messages,
    });

    const raw = response.choices?.[0]?.message?.content?.trim() || "";
    let output;

    try {
      output = JSON.parse(raw);
    } catch {
      output = {
        language: "unknown",
        intent: "unspecified",
        category,
        suggestion: raw,
      };
    }

    const latency_ms = Date.now() - start;
    const tokens_used = response.usage?.total_tokens ?? 0;

    const result = { ...output, latency_ms, tokens_used };
    console.log("🧠 GPT structured output:", result);

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
