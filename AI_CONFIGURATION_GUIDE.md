# ⚙️ Guida Configurazione AI - SalesGenius

## 🎯 Panoramica Sistema AI

SalesGenius usa 3 servizi AI principali:

1. **Deepgram** - Speech-to-Text (trascrizione audio in tempo reale)
2. **GPT-4o-mini** - Generazione suggerimenti intelligenti
3. **Language Detection** - Auto-detect lingua conversazione

---

## 🌍 Multi-Language Support

### Come Funziona

Il sistema **rileva automaticamente** la lingua dall'ultima frase del cliente:

```typescript
User speaks: "How much does this cost?"
→ AI detects: ENGLISH
→ Suggestion in: ENGLISH

User speaks: "Quanto costa questo?"
→ AI detects: ITALIAN
→ Suggestion in: ITALIAN

User speaks: "¿Cuánto cuesta?"
→ AI detects: SPANISH  
→ Suggestion in: SPANISH
```

### Lingue Supportate

✅ **Inglese** (EN) - Default  
✅ **Italiano** (IT)  
✅ **Spagnolo** (ES)  
✅ **Francese** (FR)  
✅ **Tedesco** (DE)  
✅ **Portoghese** (PT)  
✅ Qualsiasi lingua supportata da GPT-4

### Fallback

Se la lingua non è riconoscibile → **Default: Inglese**

---

## ⚡ Quality Presets (3 Modalità)

Nel file `server/.env` puoi scegliere la qualità:

```bash
# Scegli una modalità:
QUALITY_MODE=fast       # Veloce, per demo
QUALITY_MODE=balanced   # Bilanciato (CONSIGLIATO)
QUALITY_MODE=premium    # Massima qualità
```

### Confronto Modalità

| Preset | Latenza | Qualità | Costo/ora | Model | Max Tokens |
|--------|---------|---------|-----------|-------|------------|
| **fast** | 1.5-2.5s | 7/10 | $0.25 | gpt-4o-mini | 80 |
| **balanced** ⭐ | 2-4s | 8.5/10 | $0.40 | gpt-4o-mini | 150 |
| **premium** | 3-6s | 9.5/10 | $0.70 | gpt-4o | 200 |

**Consiglio:** Usa `balanced` per produzione. È il miglior compromesso!

---

## 🎛️ Parametri Deepgram (Trascrizione)

Nel file `server/src/server.ts`, cerca la funzione `setupDeepgram()`:

```typescript
const dgLive = deepgram.listen.live({
  // ============= MODELLO =============
  model: 'nova-2',              // 🎯 Più accurato (consigliato)
  // model: 'nova',             // Veloce
  // model: 'base',             // Economico
  
  // ============= LINGUA =============
  language: 'it',               // it = Italiano
  // language: 'en',            // en = Inglese
  // language: 'es',            // es = Spagnolo
  // language: 'multi',         // Multi-language (auto-detect)
  
  // ============= PERFORMANCE =============
  utterance_end_ms: 1200,       // 🎯 Attendi 1.2s silenzio prima di finalizzare
  // 800-1000ms = Più veloce, può tagliare frasi
  // 1200-1500ms = Bilanciato (consigliato)
  // 1500-2000ms = Più accurato, più lento
  
  interim_results: true,        // 🎯 Mostra risultati parziali (UX migliore)
  smart_format: true,           // Aggiungi punteggiatura automatica
  punctuate: true,              // Punteggiatura
  
  // ============= ACCURACY =============
  endpointing: 300,             // Fine frase dopo 300ms silenzio
  vad_events: true,             // Voice Activity Detection
  diarize: false,               // true = Distingui chi parla (speaker 1, 2...)
  
  // ============= AUDIO =============
  channels: 1,                  // Mono (1) o Stereo (2)
  sample_rate: 16000,           // 16kHz standard
  encoding: 'linear16',         // PCM16
  
  // ============= OPZIONALI =============
  numerals: true,               // "venti" → "20"
  profanity_filter: false,      // Censura parolacce
  redact: false,                // Redatta carte di credito, etc
});
```

### 🎯 Parametri Chiave da Ottimizzare

#### `utterance_end_ms` (Quanto aspettare prima di finalizzare)

```bash
# Veloce (ma rischi di tagliare frasi)
utterance_end_ms: 800

# Bilanciato (CONSIGLIATO)
utterance_end_ms: 1200

# Accurato (più lento)
utterance_end_ms: 1500
```

**Effetto:** Ridurre questo valore → Suggerimenti più veloci ma meno accurati

#### `language` (Lingua audio)

```bash
# Se TUTTI i tuoi clienti parlano italiano
language: 'it'

# Se clienti internazionali (auto-detect)
language: 'multi'

# Se principalmente inglese
language: 'en'
```

**Importante:** Il suggerimento sarà SEMPRE nella lingua rilevata da GPT, anche se Deepgram trascrizione è in un'altra lingua!

#### `diarize` (Distinguere chi parla)

```bash
# Se vuoi sapere CHI dice cosa
diarize: true

# Altrimenti (più veloce)
diarize: false
```

**Use case:** Con `diarize: true`, puoi dare suggerimenti diversi se parla il venditore vs il cliente.

---

## 🤖 Parametri OpenAI (Generazione Suggerimenti)

Nel file `server/src/prompts.ts`, cerca `QUALITY_PRESETS`:

```typescript
export const QUALITY_PRESETS = {
  balanced: {
    // ============= MODELLO =============
    model: 'gpt-4o-mini',       // 🎯 Veloce ed economico
    // model: 'gpt-4o',         // Più intelligente, più lento/costoso
    
    // ============= CREATIVITÀ =============
    temperature: 0.7,           // 0-2: quanto creativo
    // 0-0.3 = Deterministico, prevedibile
    // 0.4-0.7 = Bilanciato (consigliato)
    // 0.8-1.2 = Creativo, variegato
    // 1.3-2.0 = Molto random (sconsigliato)
    
    top_p: 1.0,                 // 0-1: diversità output
    
    // ============= LUNGHEZZA =============
    max_tokens: 150,            // Max parole output
    // 50 tokens = ~35 parole (breve)
    // 100 tokens = ~75 parole (medio)
    // 150 tokens = ~110 parole (ideale) 🎯
    // 200+ tokens = Troppo lungo
    
    // ============= ANTI-RIPETIZIONE =============
    presence_penalty: 0.2,      // -2 a 2: incoraggia nuovi topic
    frequency_penalty: 0.1,     // -2 a 2: penalizza ripetizioni
  }
};
```

### 🎯 Parametri Chiave da Ottimizzare

#### `temperature` (Creatività AI)

```bash
# Deterministico (sempre simile)
temperature: 0.3

# Bilanciato (CONSIGLIATO)
temperature: 0.7

# Creativo (più variato)
temperature: 1.0
```

**Effetto:** 
- Basso (0.3) → Suggerimenti più prevedibili, "safe"
- Alto (1.0) → Suggerimenti più creativi, rischiosi

#### `max_tokens` (Lunghezza suggerimento)

```bash
# Brevissimo (~35 parole)
max_tokens: 50

# Breve (~75 parole)
max_tokens: 100

# Medio (~110 parole) - CONSIGLIATO
max_tokens: 150

# Lungo (~150 parole) - Troppo!
max_tokens: 200
```

**Importante:** L'utente deve leggere velocemente durante la call! 100-150 è ideale.

#### `presence_penalty` & `frequency_penalty` (Anti-ripetizione)

```bash
# Nessuna penalità (può ripetersi)
presence_penalty: 0
frequency_penalty: 0

# Leggera penalità (CONSIGLIATO)
presence_penalty: 0.2
frequency_penalty: 0.1

# Forte penalità (massima varietà)
presence_penalty: 0.5
frequency_penalty: 0.3
```

**Effetto:** Valori più alti → Suggerimenti più vari, meno ripetitivi

---

## 📝 Personalizzazione Prompts

I prompt sono in `server/src/prompts.ts`. Puoi personalizzarli!

### Esempio: Cambiare Tono per Categoria

```typescript
// In prompts.ts - cerca "categoryInstructions"

const categoryInstructions = {
  conversational: `
━━━ FOCUS: DISCOVERY & RAPPORT BUILDING ━━━

TONE: Curioso, empatico, consultativo.  // ← CAMBIA QUI

TECNICHE DA SUGGERIRE:
• Domande SPIN
• Esplorazione bisogni
• ...
`,

  closing: `
━━━ FOCUS: CLOSING & COMMITMENT ━━━

TONE: Deciso, action-oriented, assertivo.  // ← CAMBIA QUI

TECNICHE DA SUGGERIRE:
• Next step specifici
• Assumptive close
• ...
`
}
```

### Esempio: Aggiungere Esempi Specifici al Tuo Settore

```typescript
// In prompts.ts - cerca "GOOD EXAMPLES"

GOOD EXAMPLES:
✅ "Chiedi: 'Quali processi manuali vi portano via più tempo?'"
✅ "Esplora il budget annuale per software HR"  // ← AGGIUNGI esempi del TUO settore
✅ "Domanda: 'Chi altro è coinvolto nella decisione d'acquisto?'"

// Aggiungi esempi specifici:
✅ "Per settore manifatturiero: 'Quanto tempo dedicate a tracciamento inventario?'"
✅ "Per HR: 'Quanti candidati processate al mese in media?'"
```

### Esempio: Cambiare Lunghezza Default

```typescript
// In prompts.ts - cerca "SYSTEM_PROMPT"

OUTPUT REQUIREMENTS:
- Maximum 25 words (strict limit)    // ← CAMBIA da 25 a 15 o 30
- Be specific and actionable
- ...
```

---

## ⏱️ Timing & Performance

### Latenza Totale (dall'audio al suggerimento)

```
🎤 Audio chunk (40ms)
  ↓ ~10ms
🎯 Deepgram (500-800ms)
  ↓ ~50ms
🧠 Classification (50-250ms)
  ↓ ~800ms
💬 OpenAI first token (800-1500ms)
  ↓ ~1-2s
📱 Streaming completo
━━━━━━━━━━━━━━━━━━━
TOTALE: 2-5 secondi
```

### Come Ridurre Latenza

1. **Riduci `utterance_end_ms`**
   ```typescript
   utterance_end_ms: 1000  // Da 1200 a 1000 = -200ms
   ```

2. **Usa `fast` preset**
   ```bash
   QUALITY_MODE=fast
   ```

3. **Riduci `max_tokens`**
   ```typescript
   max_tokens: 80  // Da 150 a 80 = suggerimenti più brevi e veloci
   ```

4. **Usa `interim_results`**
   ```typescript
   interim_results: true  // Mostra trascrizione parziale subito
   ```

---

## 💰 Costi Stimati

### Per Ora di Utilizzo

| Componente | Preset | Costo |
|------------|--------|-------|
| Deepgram (nova-2) | - | $0.26/ora |
| OpenAI | fast | $0.10/ora |
| OpenAI | balanced | $0.15/ora |
| OpenAI | premium | $0.45/ora |
| **TOTALE** | balanced | **~$0.41/ora** |

### Per Chiamata (30 minuti)

- Deepgram: $0.13
- OpenAI (10 suggerimenti): $0.08
- **TOTALE: ~$0.21 per chiamata**

### Per Utente (20 ore/mese)

- Deepgram: $5.20
- OpenAI (~100 suggerimenti): $1.50
- **TOTALE: ~$6.70/utente/mese**

**Budget per 100 utenti attivi:** ~$670/mese

---

## 🧪 Testing Configurazione

### Test Locale

```bash
cd server
npm run dev

# In un'altra finestra
node test-client.js

# Parla nel microfono e verifica:
# 1. Latenza trascrizione
# 2. Accuratezza lingua
# 3. Qualità suggerimenti
# 4. Tempo risposta
```

### Metriche da Monitorare

Il server logga automaticamente:

```bash
🌍 Language detected: IT
⚡ First token in 1234ms
✅ Suggestion complete in 3456ms (89 chars)
```

**Obiettivi:**
- First token: < 2000ms
- Complete: < 5000ms
- Accuracy: > 80% (valutazione manuale)

---

## 🎯 Best Practices

### ✅ DO

1. **Usa `balanced` preset** per produzione
2. **Testa con utenti reali** prima di ottimizzare troppo
3. **Monitora i costi** settimanalmente
4. **Personalizza i prompts** per il tuo settore
5. **Usa multi-language** se clientela internazionale

### ❌ DON'T

1. **Non usare `temperature > 1.0`** (troppo random)
2. **Non usare `max_tokens > 200`** (troppo lungo)
3. **Non ridurre troppo `utterance_end_ms`** (< 800ms taglia frasi)
4. **Non usare `premium` preset** se non necessario (3x costo!)
5. **Non cambiare troppi parametri insieme** (testa uno alla volta)

---

## 📊 A/B Testing Consigliato

Per trovare la config ottimale:

```bash
# Settimana 1: Baseline
QUALITY_MODE=balanced
utterance_end_ms: 1200

# Settimana 2: Test velocità
QUALITY_MODE=fast
utterance_end_ms: 1000

# Settimana 3: Test qualità
QUALITY_MODE=premium
utterance_end_ms: 1500

# Confronta:
- User satisfaction score
- Completion rate
- Time to first suggestion
- Cost per user
```

**Winner:** Quello con il miglior rapporto qualità/costo/velocità!

---

## 🔧 Troubleshooting

### Suggerimenti sempre in inglese (ma parlo italiano)

**Problema:** Language detection non funziona

**Soluzione:**
1. Verifica che `language: 'multi'` in Deepgram
2. Parla frasi più lunghe (min 5-6 parole)
3. Controlla log: `🌍 Language detected: ...`

### Suggerimenti troppo lenti

**Problema:** Latenza > 7 secondi

**Soluzione:**
1. Riduci `utterance_end_ms` a 1000
2. Usa `QUALITY_MODE=fast`
3. Riduci `max_tokens` a 100
4. Verifica connessione internet

### Suggerimenti troppo generici

**Problema:** Sempre "Chiedi al cliente..." senza specificità

**Soluzione:**
1. Aumenta `temperature` a 0.8-0.9
2. Aggiungi più esempi nei prompts
3. Aumenta `presence_penalty` a 0.3
4. Personalizza prompts per il tuo settore

### Suggerimenti si ripetono

**Problema:** Sempre stessi suggerimenti

**Soluzione:**
1. Aumenta `frequency_penalty` a 0.3
2. Aumenta `presence_penalty` a 0.3
3. Aumenta `temperature` a 0.8
4. Verifica che il context window funzioni

---

## ✅ Checklist Configurazione Ottimale

### Setup Iniziale:
- [ ] `QUALITY_MODE=balanced` in .env
- [ ] `language: 'multi'` in Deepgram (se clientela internazionale)
- [ ] `utterance_end_ms: 1200` (bilanciato)
- [ ] `max_tokens: 150` (lunghezza ideale)
- [ ] Prompts personalizzati per il tuo settore

### Monitoring:
- [ ] Log performance metrics attivo
- [ ] Alert su costi > soglia
- [ ] Dashboard utilizzo
- [ ] Feedback utenti raccolto

### Ottimizzazione:
- [ ] A/B test fatto (2+ configurazioni)
- [ ] Parametri calibrati su dati reali
- [ ] Costi sotto budget target
- [ ] Latenza < 5s nel 95% dei casi

---

**Hai domande su un parametro specifico? Vuoi testare una configurazione custom? Chiedimi! 🚀**
