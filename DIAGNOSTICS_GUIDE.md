# 🔍 Guida Diagnostica - Suggerimenti Non Arrivano

## ✅ ROLLBACK COMPLETATO

Ho ripristinato la configurazione originale che funzionava:

| Parametro | Valore Ripristinato | Comportamento Atteso |
|-----------|---------------------|----------------------|
| **SUGGESTION_DEBOUNCE_MS** | 10000 (10s) | Massimo 1 suggerimento ogni 10s |
| **MAX_SUGGESTIONS_PER_5MIN** | 10 | ~5 suggerimenti in 3 minuti |
| **MIN_CONFIDENCE** | 0.75 | Solo trascrizioni di alta qualità |
| **MIN_BUFFER_LENGTH** | 25 caratteri | Minimo contesto per suggerimenti |
| **Sample Rate** | 16000 Hz | Compatibilità Deepgram |

---

## 🚨 PROBLEMA DA DIAGNOSTICARE

**Sintomo:** I suggerimenti hanno smesso di arrivare dopo le modifiche
**Status:** Configurazione ripristinata, ma bisogna verificare che tutto funzioni

---

## 📋 CHECKLIST DEPLOYMENT

### 1. REDEPLOY BACKEND SU RENDER

```bash
1. Vai su Render Dashboard
2. Seleziona "salesgenius-backend"
3. Click "Manual Deploy"
4. Seleziona "Clear build cache & deploy"
5. Attendi 3-5 minuti per completamento
```

### 2. VERIFICA LOGS SU RENDER (CRITICO!)

**Apri i logs di Render e cerca questi indicatori:**

---

## 🔬 DIAGNOSTIC CHECKLIST

### ✅ FASE 1: Verifica Connessione Deepgram

**Cerca nei logs:**
```bash
✅ Deepgram connection opened
```

**Se NON appare:**
- ❌ Problema: Deepgram API key non configurata o invalida
- 🔧 Fix: Verifica `DEEPGRAM_API_KEY` nelle env vars di Render

---

### ✅ FASE 2: Verifica Ricezione Audio

**Cerca nei logs:**
```bash
🎵 Audio packet received: 4096 bytes
✅ Sending audio packet directly to Deepgram (4096 bytes)
📊 Audio Stats - Ricevuti: X, Inviati: X, In Buffer: 0
```

**Se appare:**
- ✅ Frontend sta inviando audio correttamente
- ✅ Audio sta arrivando a Deepgram

**Se NON appare:**
- ❌ Problema: WebSocket non riceve audio dal frontend
- 🔧 Fix: Verifica connessione WebSocket e audio capture nel browser

---

### ✅ FASE 3: Verifica Trascrizioni Deepgram (CRITICO!)

**Cerca nei logs:**
```bash
🎤 [INTERIM] "testo parziale" (conf: 0.85, lang: it)
🎤 [FINAL] "testo completo della frase" (conf: 0.95, lang: it)
📊 Buffer length: 35 chars
```

**Se appare:**
- ✅ Deepgram sta trascrivendo correttamente
- ✅ Il problema è nella generazione suggerimenti (vai a FASE 4)

**Se NON appare (PROBLEMA PRINCIPALE!):**
- ❌ **Deepgram riceve audio ma NON trascrive**
- ⚠️ Possibili cause:
  1. **Sample rate mismatch** (frontend vs backend)
  2. **Audio format incompatibile**
  3. **Deepgram API quota esaurita**
  4. **Audio silenzioso o corrotto**

**🔧 Debug Sample Rate Mismatch:**

Nei logs frontend (Console browser F12), verifica:
```javascript
// Dovrebbe mostrare:
- Sample rate: 16000Hz  ✅ CORRETTO
// Se mostra altro:
- Sample rate: 48000Hz  ❌ PROBLEMA! Frontend non aggiornato
- Sample rate: 44100Hz  ❌ PROBLEMA! Frontend non aggiornato
```

**Frontend DEVE inviare audio a 16kHz!**

File da controllare: `client/salesgenius-stream.tsx:116`
```typescript
// DEVE essere:
const ctx = new AudioContext({ sampleRate: 16000 }); ✅

// Se è questo, ERRORE:
const ctx = new AudioContext(); ❌ (usa sample rate nativo 44.1k/48k)
```

---

### ✅ FASE 4: Verifica Trigger Suggerimenti

**Cerca nei logs:**
```bash
🔍 Check suggestion conditions: confidence=0.92 (min: 0.75), bufferLen=125 (min: 25), timeSince=12000ms (min: 10000ms)
✅ Conditions met for HIGH-QUALITY suggestion, generating...
```

**Se appare:**
- ✅ Trigger funziona, il problema è nella chiamata GPT (vai a FASE 5)

**Se NON appare ma le trascrizioni ci sono:**
```bash
⏸️ Suggestion skipped (waiting for quality): confidence too low (0.65 < 0.75)
⏸️ Suggestion skipped (waiting for quality): buffer too short (18 < 25 chars)
⏸️ Suggestion skipped (waiting for quality): cooldown active (7s / 10s)
```

**Significato:**
- ⏸️ Sistema sta aspettando condizioni migliori
- ⏸️ **NORMALE** - continua a parlare e aspetta

**Se continua a skippare sempre:**
- ❌ Audio quality troppo bassa (microfono/rumore)
- ❌ Frasi troppo brevi (parla più a lungo)
- ❌ Confidence sempre bassa (audio distorto)

---

### ✅ FASE 5: Verifica Chiamata GPT

**Cerca nei logs:**
```bash
🤖 CHIAMATA GPT - INIZIO
📝 Transcript completo (125 caratteri):
   "ciao come stai, ti chiamo per parlare del nostro prodotto..."
🔄 Calling OpenAI API (model: gpt-4o-mini, timeout: 8000ms)...
💡 AI Suggestion generated:
   Category: rapport
   Intent: greet_prospect
   Tokens: 145
   Latency: 1240ms
```

**Se appare:**
- ✅ GPT funziona, il problema è nel salvataggio Supabase (vai a FASE 6)

**Se NON appare dopo "CHIAMATA GPT - INIZIO":**
- ❌ GPT call fallita
- 🔧 Cerca errori tipo:
```bash
❌ GPT timeout exceeded
❌ OpenAI API error: rate_limit_exceeded
❌ OpenAI API error: invalid_api_key
```

---

### ✅ FASE 6: Verifica Salvataggio Supabase

**Cerca nei logs:**
```bash
📤 Attempting to save sales_event to Supabase: [rapport/greet_prospect]
   SUPABASE_SERVICE_KEY present: YES ✅
✅ Sales event saved successfully to Supabase
```

**Se appare:**
- ✅ Tutto funziona! I suggerimenti dovrebbero apparire nel frontend

**Se appare errore:**
```bash
❌ Supabase save FAILED!
   Error code: 42501
   Error message: insufficient_privilege
```
- ⚠️ Supabase logging fallisce MA i suggerimenti dovrebbero comunque arrivare al frontend
- 🔧 Verifica `SUPABASE_SERVICE_KEY` e `SUPABASE_URL` su Render

---

### ✅ FASE 7: Verifica Tavily (Solo per VALUE questions)

**Cerca nei logs (solo se fai domanda tipo "Qual è il ROI?"):**
```bash
🔍 VALUE question detected - fetching real market data from Tavily...
🔑 Tavily API Key present: YES ✅
📡 Tavily search query: "B2B sales ROI statistics..."
✅ Tavily API call completed successfully
✅ Tavily returned 3 results
```

**Se appare errore:**
```bash
❌ TAVILY_API_KEY not configured! Skipping web search.
```
- ⚠️ Tavily non configurata MA suggerimenti dovrebbero comunque funzionare (senza dati web)

---

## 🎯 SEQUENZA NORMALE FUNZIONANTE

Quando tutto funziona, vedrai questa sequenza nei logs:

```bash
# 1. CONNESSIONE
✅ Deepgram connection opened

# 2. AUDIO
🎵 Audio packet received: 4096 bytes
✅ Sending audio packet directly to Deepgram

# 3. TRASCRIZIONE (ogni ~1-3 secondi mentre parli)
🎤 [INTERIM] "ciao" (conf: 0.82, lang: it)
🎤 [FINAL] "ciao come stai" (conf: 0.95, lang: it)
📊 Buffer length: 15 chars

# 4. BUFFER ACCUMULA (continui a parlare...)
🎤 [FINAL] "ti chiamo per il nostro prodotto" (conf: 0.93, lang: it)
📊 Buffer length: 48 chars

# 5. TRIGGER SUGGERIMENTO (dopo 10s e 25+ chars)
🔍 Check suggestion conditions: confidence=0.93, bufferLen=48, timeSince=12000ms
✅ Conditions met for HIGH-QUALITY suggestion, generating...

# 6. CHIAMATA GPT
🤖 CHIAMATA GPT - INIZIO
🔄 Calling OpenAI API (model: gpt-4o-mini)...

# 7. SUGGERIMENTO GENERATO
💡 AI Suggestion generated:
   Category: rapport
   Tokens: 145
   Latency: 1240ms

# 8. SALVATAGGIO SUPABASE
📤 Attempting to save sales_event to Supabase
✅ Sales event saved successfully to Supabase
```

---

## 🚩 RED FLAGS (Errori Critici)

### ❌ CRITICAL: Nessuna trascrizione Deepgram

**Sintomo:**
```bash
# Vedi questo:
✅ Sending audio packet directly to Deepgram (4096 bytes)
✅ Sending audio packet directly to Deepgram (4096 bytes)
✅ Sending audio packet directly to Deepgram (4096 bytes)

# MA NON vedi MAI:
🎤 [FINAL] "..."
🎤 [INTERIM] "..."
```

**Causa:** Sample rate mismatch o Deepgram API issue

**Fix Immediato:**
1. Verifica frontend stia inviando 16kHz (vedi Console browser)
2. Se frontend invia 48kHz o 44.1kHz → Problema sample rate
3. Controlla credito Deepgram API

---

### ❌ CRITICAL: GPT Timeout

**Sintomo:**
```bash
🤖 CHIAMATA GPT - INIZIO
❌ GPT timeout exceeded (8000ms)
```

**Causa:** OpenAI API lenta o down

**Fix:**
- Aspetta qualche minuto e riprova
- Verifica status OpenAI: https://status.openai.com/

---

### ❌ WARNING: Rate Limit Reached

**Sintomo:**
```bash
⚠️ User user_abc exceeded suggestion rate limit (10/10)
```

**Causa:** Hai raggiunto il limite di 10 suggerimenti in 5 minuti

**Fix:**
- Aspetta qualche minuto (il contatore si resetta automaticamente)
- Questo è NORMALE per proteggere da costi eccessivi

---

## 📤 COSA INVIARE PER DEBUG

**Per aiutarti, ho bisogno dei logs che mostrano:**

1. **Connessione Deepgram:**
   ```bash
   Cerca: "Deepgram connection opened"
   ```

2. **Trascrizioni (o assenza di):**
   ```bash
   Cerca: "🎤 [FINAL]" o "🎤 [INTERIM]"
   ```

3. **Trigger suggerimenti (o skip reasons):**
   ```bash
   Cerca: "Check suggestion conditions"
   Cerca: "Suggestion skipped"
   ```

4. **Chiamate GPT:**
   ```bash
   Cerca: "CHIAMATA GPT - INIZIO"
   Cerca: "AI Suggestion generated"
   ```

5. **Errori:**
   ```bash
   Cerca: "❌" (tutti i messaggi con X rossa)
   ```

**Copia e incolla qui l'intera sequenza di logs da quando:**
- Avvii la condivisione schermo
- Parli per almeno 30 secondi
- Fino a quando dovresti ricevere il primo suggerimento (o non arriva)

---

## ⏭️ NEXT STEPS

1. ✅ **Redeploy** backend su Render ("Clear build cache & deploy")
2. ⏱️ **Attendi** 3-5 minuti deploy completo
3. 🎤 **Fai test** parlando per almeno 30 secondi
4. 📋 **Copia logs** da Render (dalla connessione fino a 30s di audio)
5. 📤 **Inviami i logs** per analisi dettagliata

Con i logs posso identificare esattamente dove si blocca il sistema! 🔍
