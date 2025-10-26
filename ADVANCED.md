# 🎨 Advanced Configuration & Customization

Guida per personalizzare SalesGenius per le tue esigenze specifiche.

---

## 📝 Custom System Prompts

### Modifica Prompts per Settore

Personalizza i prompt in `server/src/server.ts`:

```typescript
const buildSystemPrompt = (category: CategoryKey): string => {
  const basePrompt = `Sei un assistente esperto di vendita B2B SaaS nel settore enterprise.`;

  const categoryPrompts: Record<CategoryKey, string> = {
    conversational: `${basePrompt}
      Focus: Fai domande SPIN selling (Situation, Problem, Implication, Need-payoff).
      Scopri pain points tecnici e organizzativi.
      Identifica stakeholder e decision makers.`,
    
    value: `${basePrompt}
      Focus: Quantifica ROI in termini di risparmio tempo/costi.
      Cita case study simili nel loro settore.
      Gestisci obiezioni su sicurezza, compliance, integrazione.`,
    
    closing: `${basePrompt}
      Focus: Proponi POC/trial di 30 giorni.
      Definisci success criteria misurabili.
      Chiedi commitment su timeline decision.`,
    
    market: `${basePrompt}
      Focus: Posiziona vs Salesforce, HubSpot, competitor specifici.
      Evidenzia differenziatori unici (es. AI, UX, pricing).
      Cita trend mercato (es. adoption rate, forecast Gartner).`,
  };

  return categoryPrompts[category];
};
```

### Esempi Prompt per Altri Settori

**Immobiliare:**
```typescript
conversational: `Esplora esigenze abitative: metratura, zona, budget, tempistiche. 
                 Identifica must-have vs nice-to-have.`,
value: `Evidenzia: posizione strategica, rivalutazione storica zona, 
        potenziale affitto, costi manutenzione bassi.`,
closing: `Proponi visita urgente, offerta limitata nel tempo, 
         richiedi caparra per bloccare immobile.`,
```

**Consulenza/Servizi:**
```typescript
conversational: `Scopri sfide attuali, processi inefficienti, team coinvolti.`,
value: `Quantifica: ore risparmiate/settimana, errori evitati, 
        produttività aumentata.`,
closing: `Proponi engagement pilota 3 mesi, definisci KPI misurabili.`,
```

---

## 🔧 Custom Category Classification

### Aggiungere Nuova Categoria

```typescript
// 1. Aggiungi tipo
type CategoryKey = 'conversational' | 'value' | 'closing' | 'market' | 'technical';

// 2. Aggiungi keywords
const CATEGORY_KEYWORDS: Record<CategoryKey, string[]> = {
  // ... esistenti ...
  technical: ['integration', 'api', 'security', 'performance', 'scalability', 'architecture'],
};

// 3. Aggiungi prompt
const categoryPrompts = {
  // ... esistenti ...
  technical: `${basePrompt}
    Focus: Rispondi a domande tecniche su architettura, integrazioni, sicurezza.
    Sii preciso ma evita gergo eccessivo. Proponi demo tecnica se necessario.`,
};

// 4. Aggiungi metadata nel client
const CATEGORY_META = {
  // ... esistenti ...
  technical: { icon: "⚙️", label: "Technical & Integration" },
};
```

### Classification con LLM (Avanzato)

Per classificazione più accurata, usa GPT:

```typescript
const classifyCategory = async (text: string): Promise<CategoryKey> => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: `Classifica questa frase in una categoria:
        - conversational: domande esplorative, discovery
        - value: prezzo, ROI, benefici, obiezioni
        - closing: next step, decisione, timeline
        - market: competitor, trend, confronti
        Rispondi SOLO con il nome della categoria.`
    }, {
      role: 'user',
      content: text
    }],
    temperature: 0,
    max_tokens: 20,
  });

  return response.choices[0].message.content?.trim() as CategoryKey || 'conversational';
};
```

---

## ⚡ Performance Tuning

### Debounce Dinamico

Adatta il debounce alla velocità di conversazione:

```typescript
let adaptiveDebounce = SUGGESTION_DEBOUNCE_MS;
let lastTranscriptTime = 0;

const handleTranscriptForSuggestion = async (text: string) => {
  const now = Date.now();
  const timeSinceLastTranscript = now - lastTranscriptTime;
  lastTranscriptTime = now;

  // Se parlano velocemente, aumenta debounce
  if (timeSinceLastTranscript < 1000) {
    adaptiveDebounce = Math.min(adaptiveDebounce * 1.2, 500);
  } else {
    adaptiveDebounce = Math.max(adaptiveDebounce * 0.9, 180);
  }

  if (now - state.lastSuggestionTime < adaptiveDebounce) return;
  
  // ... resto logica
};
```

### Caching Suggerimenti

Cache per domande comuni:

```typescript
import { createHash } from 'crypto';

const suggestionCache = new Map<string, string>();
const CACHE_TTL = 3600000; // 1 ora

const getCachedSuggestion = (text: string, category: CategoryKey): string | null => {
  const key = createHash('md5').update(`${category}:${text}`).digest('hex');
  return suggestionCache.get(key) || null;
};

const cacheSuggestion = (text: string, category: CategoryKey, suggestion: string) => {
  const key = createHash('md5').update(`${category}:${text}`).digest('hex');
  suggestionCache.set(key, suggestion);
  setTimeout(() => suggestionCache.delete(key), CACHE_TTL);
};
```

---

## 🎛️ Audio Configuration

### Noise Reduction (Client-side)

```typescript
// In salesgenius-stream.tsx
const setupDeepgram = () => {
  const dgLive = deepgram.listen.live({
    model: 'nova-2',
    language: 'it',
    smart_format: true,
    interim_results: true,
    punctuate: true,
    utterance_end_ms: 1200,
    
    // Noise reduction avanzato
    vad_turnoff: 500,
    endpointing: 300,
    
    // Migliora per audio con rumore
    diarize: false, // true se vuoi distinguere speaker
  });
};
```

### Gain Control Dinamico

```typescript
// Regola gain basato su volume
const analyser = ctx.createAnalyser();
source.connect(analyser);
analyser.connect(gain);

const checkVolume = () => {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  
  const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
  
  if (average < 30) {
    gain.gain.value = Math.min(2.0, gain.gain.value * 1.1);
  } else if (average > 150) {
    gain.gain.value = Math.max(0.5, gain.gain.value * 0.9);
  }
};

setInterval(checkVolume, 500);
```

---

## 🔐 Authentication & Authorization

### JWT con Supabase

**Client:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// In startShare()
const { data: { session } } = await supabase.auth.getSession();
const jwt = session?.access_token;

ws.send(JSON.stringify({ op: "auth", jwt }));
```

**Server:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

ws.on('message', async (data) => {
  const msg = JSON.parse(data);
  
  if (msg.op === 'auth') {
    const { data: { user }, error } = await supabase.auth.getUser(msg.jwt);
    
    if (error || !user) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      ws.close();
      return;
    }
    
    // Store user context
    state.userId = user.id;
    state.authenticated = true;
  }
});
```

### Rate Limiting

```typescript
import rateLimit from 'ws-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // max 100 messaggi/minuto
});

ws.on('message', async (data) => {
  if (!limiter.check(ws)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
    return;
  }
  // ... resto logica
});
```

---

## 📊 Analytics & Logging

### Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Usage
logger.info('Suggestion generated', {
  userId: state.userId,
  category,
  latencyMs: Date.now() - startTime,
  textLength: text.length,
});
```

### Metrics con Prometheus

```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();

const suggestionsCounter = new promClient.Counter({
  name: 'suggestions_generated_total',
  help: 'Total suggestions generated',
  labelNames: ['category'],
  registers: [register],
});

const suggestionLatency = new promClient.Histogram({
  name: 'suggestion_generation_duration_seconds',
  help: 'Suggestion generation latency',
  registers: [register],
});

// Endpoint metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Usage
suggestionsCounter.inc({ category: 'closing' });
const end = suggestionLatency.startTimer();
// ... generate suggestion ...
end();
```

---

## 🌍 Multi-Language Support

### Client:
```typescript
const CATEGORY_META = {
  conversational: {
    icon: "🎧",
    label: {
      en: "Conversational & Discovery",
      it: "Conversazionale & Scoperta",
      es: "Conversacional y Descubrimiento",
    }
  },
  // ... altre categorie
};

const userLang = navigator.language.split('-')[0]; // 'en', 'it', 'es'
const label = CATEGORY_META[category].label[userLang] || CATEGORY_META[category].label.en;
```

### Server:
```typescript
// Rileva lingua da trascrizione
import { franc } from 'franc';

const detectedLang = franc(text); // 'eng', 'ita', 'spa'

const langMap = {
  'eng': 'en',
  'ita': 'it',
  'spa': 'es',
};

const deepgramLang = langMap[detectedLang] || 'en';

// Usa nella config Deepgram
dgLive = deepgram.listen.live({
  language: deepgramLang,
  // ...
});
```

---

## 🚨 Error Handling Best Practices

### Retry Logic

```typescript
const generateSuggestionWithRetry = async (
  category: CategoryKey,
  text: string,
  maxRetries = 3
) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await generateSuggestion(category, text);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const backoff = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
};
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > 30000) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();
    if (this.failures >= 5) {
      this.state = 'open';
    }
  }
}

const openaiBreaker = new CircuitBreaker();

// Usage
await openaiBreaker.call(() => generateSuggestion(category, text));
```

---

## 💡 Tips & Tricks

1. **Context Window Management**: Mantieni solo le ultime 5-10 frasi per prompt più efficaci
2. **Token Optimization**: Usa `max_tokens` per limitare costi e latenza
3. **Streaming Chunking**: Invia chunk di ~20-30 caratteri per UX fluida
4. **WebSocket Ping/Pong**: Implementa keepalive ogni 30s per evitare timeout
5. **Graceful Degradation**: Fallback a suggerimenti pre-generati se LLM fallisce
6. **A/B Testing**: Testa varianti prompt e traccia conversion rate

---

**Happy Customizing! 🎨**
