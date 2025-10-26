# ⚡ Quick Start Guide

Inizia in 5 minuti con SalesGenius!

## 🎯 Prerequisiti

- Node.js 18+ installato
- Account [Deepgram](https://console.deepgram.com/) (500 ore gratis)
- Account [OpenAI](https://platform.openai.com/) con API key

---

## 🚀 Setup in 3 Step

### 1️⃣ Backend

```bash
cd server

# Installa dipendenze
npm install

# Configura environment
cp .env.example .env
nano .env  # Inserisci le tue API keys

# Avvia server
npm run dev
```

Il server parte su `ws://localhost:8080` ✅

---

### 2️⃣ Frontend (Next.js)

**Opzione A: Nuovo progetto Next.js**

```bash
npx create-next-app@latest salesgenius-app --typescript --tailwind --app
cd salesgenius-app

# Copia componente
cp ../client/salesgenius-stream.tsx ./components/

# Crea pagina
mkdir -p app/stream
cp ../client/page.tsx ./app/stream/

# Configura WebSocket URL
echo 'NEXT_PUBLIC_WS_URL=ws://localhost:8080' > .env.local

# Avvia
npm run dev
```

**Opzione B: Progetto Next.js esistente**

```bash
# Copia componente nel tuo progetto
cp client/salesgenius-stream.tsx your-nextjs-app/components/

# Aggiungi env var
echo 'NEXT_PUBLIC_WS_URL=ws://localhost:8080' >> .env.local

# Usa il componente in una pagina
```

---

### 3️⃣ Test

1. Apri `http://localhost:3000/stream`
2. Clicca **"Avvia Condivisione"**
3. Seleziona schermo/scheda + **spunta "Condividi audio"**
4. Parla o riproduci un video con audio
5. Osserva i suggerimenti apparire! 🎉

---

## 🧪 Test Backend (senza frontend)

```bash
cd server
node test-client.js ws://localhost:8080
```

Questo invia frame audio simulati e mostra i suggerimenti nel terminale.

---

## 📦 Struttura Progetto

```
salesgenius/
├── README.md              ← Documentazione completa
├── DEPLOYMENT.md          ← Guide deployment
├── QUICKSTART.md          ← Questo file
│
├── client/
│   ├── salesgenius-stream.tsx   ← Componente React principale
│   └── page.tsx                 ← Esempio pagina Next.js
│
└── server/
    ├── src/
    │   └── server.ts            ← Backend WebSocket
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    └── test-client.js           ← Test script
```

---

## 🎮 Come Funziona

```
[Browser Audio] → [WebSocket] → [Deepgram] → [Transcript]
                                                   ↓
[UI Suggestions] ← [OpenAI Stream] ← [Classifier]
```

1. **Cattura audio** dal browser (schermo condiviso)
2. **Stream PCM16** a 16kHz verso backend
3. **Deepgram** trascrive in tempo reale
4. **Classifier** categorizza in 4 aree vendita
5. **OpenAI** genera suggerimenti streaming
6. **UI** mostra suggerimenti con icone/categorie

---

## 🔧 Troubleshooting Rapido

### ❌ "Cannot connect to WebSocket"

```bash
# Verifica che il server sia avviato
cd server
npm run dev

# Controlla il log - dovresti vedere:
# 🚀 SalesGenius Backend running on ws://localhost:8080
```

### ❌ "Nessuna traccia audio condivisa"

- **Hai spuntato "Condividi audio"?** È fondamentale!
- Su macOS: usa **"Scheda di Chrome"** invece di schermo intero
- Su Windows: **"Schermo intero"** funziona

### ❌ "Nessun suggerimento appare"

```bash
# Verifica le API keys nel server
cat server/.env

# Controlla i log del server - dovresti vedere:
# 🎤 [FINAL] (0.95): testo trascritto...
# 🏷️  Category: conversational
```

### ❌ Deepgram/OpenAI errors

- Verifica le API keys
- Controlla crediti disponibili
- Verifica network/firewall

---

## 🎯 Test Scenario Consigliato

1. **Apri Google Meet/YouTube** in una scheda
2. **Riproduci un video** con parlato (es. TED talk)
3. **Avvia SalesGenius** e condividi quella scheda
4. **Osserva i suggerimenti** categorizzati apparire!

---

## 🚀 Next Steps

Una volta che tutto funziona:

1. **Personalizza le categorie** in `server/src/server.ts`
2. **Modifica i prompt** per il tuo settore
3. **Aggiungi autenticazione** (JWT/Supabase)
4. **Deploy in production** → vedi [DEPLOYMENT.md](DEPLOYMENT.md)
5. **Monitora performance** e costi API

---

## 📚 Risorse

- [Documentazione completa](README.md)
- [Guide deployment](DEPLOYMENT.md)
- [Deepgram Docs](https://developers.deepgram.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Next.js Docs](https://nextjs.org/docs)

---

## 💡 Tips

- **Usa gpt-4o-mini** per sviluppo (veloce, economico)
- **Passa a gpt-4o** per produzione (qualità superiore)
- **Monitora i costi** nelle dashboard Deepgram/OpenAI
- **Rate limiting** importante in produzione!

---

**Buon coding! 🎉**

Problemi? Controlla i log del server - sono molto verbosi e ti diranno esattamente cosa sta succedendo.
