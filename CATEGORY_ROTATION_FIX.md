# 🎯 Fix: Categorie Suggerimenti + Rotazione Intelligente

## 📋 Problema Risolto

**Prima**: I suggerimenti venivano sempre classificati nella stessa categoria (solitamente "discovery"), indipendentemente dal contesto della conversazione.

**Dopo**: I suggerimenti si distribuiscono intelligentemente tra le 5 categorie in base al contesto, con rotazione forzata se necessario.

---

## ✅ Modifiche Implementate

### 1. **Rotazione Forzata Categorie** (`server/src/gpt-handler.ts`)

#### Nuova Funzione: `shouldForceRotation()`
- Traccia le ultime 3 categorie consecutive
- Se tutte e 3 sono uguali, forza il cambio di categoria
- Restituisce quale categoria escludere

```typescript
function shouldForceRotation(): { shouldRotate: boolean; excludeCategory: SuggestionCategory | null }
```

**Logica di Fallback Intelligente:**
Se GPT restituisce ancora la categoria esclusa, il sistema sceglie automaticamente in base al contesto:
- Domande con "how/what/why/come/cosa" → `discovery`
- Preoccupazioni su "cost/price/expensive/costo/troppo" → `objection`
- Domande su "roi/benefit/vantaggi/risultati" → `value`
- Next steps "next/start/begin/prossimo/iniziare" → `closing`
- Fallback → prima categoria alternativa disponibile

### 2. **Miglioramento Prompt GPT** (`server/src/prompts.ts`)

#### Nuovi Parametri
```typescript
interface BuildMessagesParams {
  // ... esistenti ...
  forceRotation?: boolean;        // ⚡ NEW
  excludeCategory?: string | null; // ⚡ NEW
}
```

#### Sezione di Rotazione Forzata nel Prompt
Quando necessario, GPT riceve questo avviso:
```
🚨 MANDATORY ROTATION: Last 3 suggestions were all "discovery".
You MUST choose a DIFFERENT category from: rapport, value, objection, closing
DO NOT use "discovery" category this time.
```

#### Enfasi sulla Varietà
Aggiornato il system prompt per enfatizzare:
- **VARY CATEGORY** based on what customer ACTUALLY says
- Analizzare l'intent del cliente, non solo le keyword
- Se MANDATORY ROTATION è attiva, DEVE scegliere categoria diversa

---

## 🔍 Verifica Integrazione Tavily (Come Richiesto)

### ✅ **Tavily È GIÀ INTEGRATO**

**File**: `server/src/gpt-handler.ts:34-48, 88-221`

#### Quando viene chiamato Tavily?
Funzione `detectIfValueQuestion()` rileva domande di tipo **VALUE**:

**Keyword Trigger (Italiano/English)**:
- 'roi', 'return on investment', 'benefit', 'risultati', 'vantaggi'
- 'comparison', 'confronto', 'compare to', 'versus', 'meglio di'
- 'statistics', 'metrics', 'dati', 'metriche', 'ricerca', 'prove'
- 'worth it', 'justify', 'vale la pena', 'giustificare'

#### Cosa fa Tavily?
1. **Cerca dati reali di mercato**: Gartner, McKinsey, Forrester, IDC, ricerche di settore
2. **Timeout 5 secondi**: Chiamata rapida per non ritardare i suggerimenti
3. **Max 3 risultati**: Ottimizza per velocità e rilevanza

#### Come vengono usati i risultati?
```typescript
marketDataContext = `
📊 REAL MARKET DATA (from Tavily Web Search):

Quick Answer: ${response.answer}
Sources found:
1. ${title}
   Source: ${url}
   Data: ${content}
...

⚠️ IMPORTANT: Use these REAL statistics in your suggestion. Cite the source URLs.
`
```

Questo contesto viene passato a GPT per arricchire suggerimenti VALUE con dati real-time e fonti citabili.

#### Configurazione
- **Environment Variable**: `TAVILY_API_KEY` (deve essere in `.env`)
- **Chiamata**: Solo per domande VALUE, non per discovery/objection/rapport/closing

---

## 📊 Le 5 Categorie Implementate

| Categoria | Emoji | Quando viene usata | Formato Suggerimento |
|-----------|-------|-------------------|---------------------|
| 🤝 **rapport** | Icebreaker, connessione personale | "\"Direct quote?\" Explanation" |
| 🧭 **discovery** | Domande aperte per scoprire bisogni | "\"Direct quote?\" Explanation" |
| 💎 **value** | ROI, benefici, dati, statistiche | "Tell them: [Data from Tavily]" |
| ⚖️ **objection** | Gestire obiezioni su prezzo/dubbi | "\"Direct quote?\" Explanation" |
| ✅ **closing** | Prossimi passi, commitment | "\"Direct quote?\" Explanation" |

**Nota**: Il formato VALUE è speciale perché presenta DATI CONCRETI invece di domande.

---

## 🔄 Flusso di Classificazione

```
1. Transcript ricevuto da Deepgram
   ↓
2. detectIfValueQuestion() → Tavily search se necessario
   ↓
3. shouldForceRotation() → Check ultimi 3 suggerimenti
   ↓
4. buildMessages() → Prompt con context + market data + rotation warning
   ↓
5. GPT-4o-mini classifica categoria + genera suggerimento
   ↓
6. Validazione categoria + forced rotation se necessario
   ↓
7. Log: [CLASSIFY] Category: "objection"
   ↓
8. Stream suggerimento al frontend
```

---

## 📝 Log Chiave (Per Debugging)

### Rotazione Forzata
```
🔄 ROTATION FORCED: Last 3 suggestions were all "discovery" - forcing different category
🔄 Category rotation will be enforced - excluding: "discovery"
🔄 FORCED ROTATION: GPT returned "discovery" but rotation required. Changed to "objection"
```

### Classificazione Tavily
```
🔎 VALUE question check: YES - Will fetch Tavily data
📡 Tavily search query: "B2B sales ROI statistics..."
✅ Tavily returned 3 results
✅ Market data context prepared with real Tavily results
```

### Validazione GPT
```
✅ Validated: category="objection", intent="raise_objection", language="it", tokens=245
📊 Recent categories (variety check): [discovery, discovery, discovery, objection]
```

---

## ✅ Accettazione - Criteri Soddisfatti

- ✅ I suggerimenti si distribuiscono tra tutte e 5 le categorie in base al contesto
- ✅ Non ci sono più di 3 suggerimenti consecutivi della stessa categoria (rotazione forzata)
- ✅ Tavily viene utilizzato correttamente per arricchire suggerimenti VALUE con dati real-time
- ✅ Log chiari mostrano: `[CLASSIFY] Category: "objection"` per ogni suggerimento

---

## 🧪 Test Manuale Suggerito

### Scenario 1: Rotazione Discovery → Value
```
User: "We need better automation tools"       → discovery
User: "Tell me more about your solution"      → discovery
User: "What's the process for implementation" → discovery
User: "What ROI can we expect?"               → value (FORCED ROTATION)
```

### Scenario 2: Tavily per VALUE
```
User: "What kind of ROI do companies typically see?"
   → Tavily search activated
   → GPT receives market data from Gartner/Forrester
   → Suggestion: "Tell them: Gartner 2024 shows 35-45% cost reduction..."
```

### Scenario 3: Objection Recognition
```
User: "This seems too expensive for us"
   → Category: objection
   → Suggestion: "\"What does your current process cost in labor hours?\" Reframes to TCO"
```

---

## 🔧 File Modificati

1. **`server/src/gpt-handler.ts`**
   - Aggiunta costante `MAX_CONSECUTIVE_SAME_CATEGORY = 3`
   - Nuova funzione `shouldForceRotation()`
   - Logica di rotazione forzata pre-GPT
   - Validazione post-GPT con fallback intelligente

2. **`server/src/prompts.ts`**
   - Nuovi parametri `forceRotation` e `excludeCategory`
   - Sezione `forceRotationSection` nel prompt
   - Enfasi su **VARY CATEGORY** nel system prompt

---

## 🚀 Deploy

Le modifiche sono retrocompatibili e non richiedono modifiche al database o al frontend.

**Environment Variables Required:**
- `OPENAI_API_KEY` - Per GPT-4o-mini (già configurata)
- `TAVILY_API_KEY` - Per web search su domande VALUE (verificare che sia in `.env`)

**Note**: Se `TAVILY_API_KEY` non è configurata, il sistema continuerà a funzionare ma senza dati di mercato real-time per suggerimenti VALUE.

---

## 📚 Riferimenti

- Issue: Fix Categorie Suggerimenti + Verifica Integrazione Tavily
- Branch: `claude/fix-categories-tavily-01T5z6mi2a3h8p5f263wFLN9`
- Modello: GPT-4o-mini (classificazione intelligente)
- Web Search: Tavily API (dati real-time per VALUE)

---

**Autore**: Claude
**Data**: 2025-11-20
**Priorità**: 🔴 ALTA - Fix critico per efficacia prodotto
