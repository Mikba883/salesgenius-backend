# 🚀 SalesGenius - Real-time AI Sales Assistant

Sistema completo di assistenza vendita in tempo reale con cattura schermo+audio, trascrizione live e suggerimenti AI categorizzati.

## 📋 Caratteristiche

- ✅ **Cattura schermo + audio** via `getDisplayMedia`
- ✅ **Streaming audio PCM16** a 16kHz verso backend WebSocket
- ✅ **Trascrizione live** con Deepgram (senza mostrare il testo al client)
- ✅ **Suggerimenti AI streaming** via OpenAI categorizzati in 4 aree
- ✅ **UI React/Next.js** pronta all'uso
- ✅ **Backend Node.js/TypeScript** con WebSocket

## 🎯 Categorie Suggerimenti

1. **🎧 Conversational & Discovery** - Domande aperte, esplorazione bisogni
2. **💎 Value & Objection Handling** - Gestione obiezioni, ROI, benefici
3. **✅ Closing & Next Steps** - Chiusura, next step, commitment
4. **🌐 Market & Context Intelligence** - Posizionamento, competitor, trend

---

## 📦 Struttura Progetto

```
salesgenius/
├── client/
│   ├── app/
│   │   └── stream/
│   │       └── page.tsx           # Usa il componente SalesGeniusStream
│   └── components/
│       └── salesgenius-stream.tsx  # Component principale
│
├── server/
│   ├── src/
│   │   └── server.ts              # Backend WebSocket
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                       # Configurazione (copia da .env.example)
│
└── README.md
```

---

## 🛠️ Setup Backend

### 1. Prerequisiti

- Node.js >= 18
- Account Deepgram (https://console.deepgram.com/)
- Account OpenAI (https://platform.openai.com/)

### 2. Installazione

```bash
cd server
npm install
```

### 3. Configurazione

Crea un file `.env` copiando `.env.example`:

```bash
cp .env.example .env
```

Compila con le tue chiavi API:

```env
PORT=8080
DEEPGRAM_API_KEY=your_deepgram_key
OPENAI_API_KEY=your_openai_key
```

### 4. Avvio

```bash
# Development con hot-reload
npm run dev

# Production
npm run build
npm start
```

Il server sarà disponibile su `ws://localhost:8080`

---

## 💻 Setup Client (Next.js)

### 1. Installazione Component

Copia `salesgenius-stream.tsx` nella tua cartella `components/`:

```bash
cp salesgenius-stream.tsx your-nextjs-app/components/
```

### 2. Configurazione URL WebSocket

Crea/modifica `.env.local`:

```env
NEXT_PUBLIC_WS_URL=ws://localhost:8080/stream-audio
# Per production: wss://your-backend.com/stream-audio
```

### 3. Utilizzo nel tuo app

```tsx
// app/stream/page.tsx
import SalesGeniusStream from '@/components/salesgenius-stream';

export default function StreamPage() {
  return <SalesGeniusStream />;
}
```

### 4. Styling

Il componente usa Tailwind CSS. Assicurati di avere Tailwind configurato nel tuo progetto Next.js.

---

## 🎮 Come Usare

### Per l'utente:

1. **Avvia una chiamata** su Google Meet, Zoom, Teams, ecc.
2. **Clicca "Avvia Condivisione"** nell'app SalesGenius
3. **Nel prompt del browser:**
   - **Windows/Chrome:** Seleziona "Schermo intero" + spunta "Condividi audio"
   - **macOS:** Seleziona "Scheda di Chrome" + spunta "Condividi audio scheda"
   - Per Meet/Zoom: condividi la scheda del browser
4. **Parla normalmente** - i suggerimenti appariranno in tempo reale
5. **Clicca "Ferma"** quando hai finito

### Suggerimenti vengono mostrati:

- In tempo reale durante la conversazione
- Categorizzati per tipo (icona + label)
- Con status "live" durante generazione
- Brevi e actionable (max 20 parole)

---

## 🔧 Architettura Tecnica

### Flusso Dati

```
[Browser] ──► [AudioContext 16kHz] ──► [AudioWorklet PCM16] 
    │
    ▼
[WebSocket Client] ──► { op:"audio", seq, sr, ch } + Binary(PCM16)
    │
    ▼
[WebSocket Server] ──► [Deepgram Live] ──► Trascrizione
    │                                          │
    │                                          ▼
    │                                     [Classificazione]
    │                                          │
    │                                          ▼
    │                                    [OpenAI Stream]
    │                                          │
    ▼◄─────────────────────────────────────────┘
{ type:"suggestion.start/delta/end", id, category, textChunk }
```

### Protocollo WebSocket

**Client → Server:**

```json
// Hello
{ "op": "hello", "app": "salesgenius-web", "version": "0.1" }

// Audio header (seguito da frame binario)
{ "op": "audio", "seq": 123, "sr": 16000, "ch": 1, "samples": 640 }
[Binary PCM16 Int16Array buffer]
```

**Server → Client:**

```json
// Nuovo suggerimento
{ "type": "suggestion.start", "id": "s-uuid", "category": "closing" }

// Chunk di testo streaming
{ "type": "suggestion.delta", "id": "s-uuid", "textChunk": "Proponi un..." }

// Fine suggerimento
{ "type": "suggestion.end", "id": "s-uuid" }
```

---

## 🎛️ Configurazione Avanzata

### Debounce Suggerimenti

Nel server (`server.ts`):

```typescript
const SUGGESTION_DEBOUNCE_MS = 180; // Minimo 180ms tra suggerimenti
```

### Confidenza Trascrizione

```typescript
if (isFinal && confidence >= 0.7) { // Solo confidence >= 70%
  // Trigger suggerimento
}
```

### Modello OpenAI

```typescript
model: 'gpt-4o-mini', // Veloce ed economico
// model: 'gpt-4o',   // Qualità superiore
```

### Lingua Deepgram

```typescript
language: 'it', // Italiano
// language: 'en', // Inglese
```

---

## 🚀 Deploy Production

### Backend (Render, Fly.io, Railway)

1. **Push su GitHub**
2. **Connetti il repo** al servizio
3. **Set env vars:** `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`
4. **Build command:** `npm run build`
5. **Start command:** `npm start`
6. **Importante:** Assicurati che il servizio supporti WebSocket

### Client (Vercel, Netlify)

1. **Deploy Next.js** normalmente
2. **Set env var:** `NEXT_PUBLIC_WS_URL=wss://your-backend.com`
3. **Verifica CORS** se necessario

---

## 🐛 Troubleshooting

### "Nessuna traccia audio condivisa"

- ✅ Assicurati di **spuntare "Condividi audio"** nel prompt
- ✅ Su macOS: usa "Scheda di Chrome" invece di "Schermo intero"
- ✅ Su Windows: "Schermo intero" funziona con audio di sistema

### WebSocket non si connette

- ✅ Verifica che il backend sia avviato
- ✅ Controlla l'URL nel `.env.local`
- ✅ Verifica firewall/network
- ✅ Su production: usa `wss://` (non `ws://`)

### Nessun suggerimento appare

- ✅ Verifica le chiavi API (Deepgram + OpenAI)
- ✅ Controlla i log del server
- ✅ Verifica che l'audio arrivi (log Deepgram)
- ✅ Prova con frasi più chiare/lunghe

### Performance audio scadente

- ✅ Riduci il gain se troppo alto: `gain.gain.value = 0.8`
- ✅ Verifica la qualità dell'audio sorgente
- ✅ Chiudi altre app che usano audio

---

## 📊 Limiti e Costi

### Deepgram

- **Nova-2:** ~$0.0043/min (~$0.26/ora)
- **500 ore gratis** nei primi 12 mesi
- [Pricing](https://deepgram.com/pricing)

### OpenAI

- **GPT-4o-mini:** ~$0.15/1M input tokens + $0.60/1M output
- Suggerimento medio: ~100 token = $0.00007
- [Pricing](https://openai.com/api/pricing/)

### Esempio costo 1 ora di chiamata

- Deepgram: $0.26
- OpenAI: ~$0.01 (10 suggerimenti)
- **Totale: ~$0.27/ora**

---

## 🔐 Sicurezza

### TODO Production:

1. **Autenticazione JWT** con Supabase/Auth0
2. **Rate limiting** per prevenire abusi
3. **HTTPS/WSS** obbligatorio in production
4. **Input validation** su tutti i messaggi
5. **Logging** e monitoring (Sentry, LogRocket)

---

## 📝 License

MIT

---

## 🤝 Support

Per domande o issue:
- Controlla i log del server
- Verifica le configurazioni API
- Testa con audio semplice prima

**Buona vendita! 🎯💰**
