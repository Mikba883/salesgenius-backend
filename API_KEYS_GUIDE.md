# 🔑 Riepilogo Chiavi API e Configurazione

## ✅ Chiavi Necessarie

### 1️⃣ Deepgram (OBBLIGATORIA)
**Dove ottenerla:** https://console.deepgram.com/

1. Crea account (500 ore gratis!)
2. Vai in **API Keys**
3. Crea nuova chiave
4. Copia la chiave che inizia con: `a1b2c3d4e5f6...`

**Dove usarla:**
```env
# server/.env
DEEPGRAM_API_KEY=a1b2c3d4e5f6...
```

---

### 2️⃣ OpenAI (OBBLIGATORIA)
**Dove ottenerla:** https://platform.openai.com/api-keys

1. Crea account OpenAI
2. Vai in **API Keys**
3. Clicca "Create new secret key"
4. Copia la chiave che inizia con: `sk-proj-...`

**Dove usarla:**
```env
# server/.env
OPENAI_API_KEY=sk-proj-...
```

---

### 3️⃣ Supabase (OPZIONALE - per autenticazione)
**Dove ottenerle:** https://supabase.com → Settings → API

Ti servono **3 valori diversi**:

#### A) Project URL
```
https://xxxxx.supabase.co
```

#### B) Anon Key (pubblica - per il client)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...
```

#### C) Service Role Key (SEGRETA - solo server!)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...
```

⚠️ **ATTENZIONE:** Le tre chiavi sono DIVERSE!

**Dove usarle:**

```env
# server/.env (Backend)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... (la SERVICE ROLE - segreta!)
```

```env
# .env.local (Frontend - Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (la ANON - pubblica)
```

---

## 📋 Checklist Configurazione

### Server (Backend)
```bash
cd server
cp .env.example .env
nano .env  # o usa il tuo editor preferito
```

Compila:
```env
PORT=8080
DEEPGRAM_API_KEY=tua_chiave_deepgram
OPENAI_API_KEY=tua_chiave_openai

# Se usi Supabase:
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tua_service_role_key
```

### Frontend (Next.js)
```bash
cd your-nextjs-app
cp .env.local.example .env.local
nano .env.local
```

Compila:
```env
NEXT_PUBLIC_WS_URL=ws://localhost:8080

# Se usi Supabase:
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tua_anon_key
```

---

## 🔒 Sicurezza Chiavi

### ✅ Cose GIUSTE da fare:
- ✅ Metti chiavi in file `.env` (gitignored)
- ✅ Usa `NEXT_PUBLIC_` solo per chiavi pubbliche
- ✅ SERVICE_ROLE_KEY **SOLO** nel backend
- ✅ Ruota chiavi ogni 6 mesi
- ✅ Non committare `.env` in Git

### ❌ Cose SBAGLIATE da NON fare:
- ❌ Mai committare chiavi in Git
- ❌ Mai esporre SERVICE_ROLE_KEY nel browser
- ❌ Mai hardcodare chiavi nel codice
- ❌ Mai condividere chiavi pubblicamente
- ❌ Mai usare chiavi di produzione in sviluppo

---

## 🎯 Configurazione per Ambiente

### Development (Locale)
```env
# server/.env
PORT=8080
DEEPGRAM_API_KEY=dev_key_xxx
OPENAI_API_KEY=sk-proj-xxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key

# .env.local (frontend)
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

### Production (Render + Vercel)

**Render (Backend):**
Nel dashboard Render → Environment variables:
```
PORT=10000
DEEPGRAM_API_KEY=prod_key_xxx
OPENAI_API_KEY=sk-proj-xxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
NODE_ENV=production
```

**Vercel (Frontend):**
Nel dashboard Vercel → Settings → Environment Variables:
```
NEXT_PUBLIC_WS_URL=wss://salesgenius-backend.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

---

## 🧪 Test Configurazione

### Test 1: Verifica chiavi sono caricate
```bash
# Backend
cd server
npm run dev

# Dovresti vedere nel log:
# 🚀 SalesGenius Backend running on ws://localhost:8080
# (senza errori di chiavi mancanti)
```

### Test 2: Test Deepgram
```bash
# Il server tenta connessione Deepgram quando riceve audio
# Guarda i log per messaggi come:
# 🎤 [FINAL] (0.95): testo trascritto
```

### Test 3: Test OpenAI
```bash
# Quando viene generato un suggerimento, nei log vedi:
# 🏷️ Category: conversational
# (seguito dal suggerimento streamato)
```

### Test 4: Test Supabase (se abilitato)
```bash
# Quando ti autentichi, nei log vedi:
# 🔐 Authenticating user...
# ✅ User authenticated: email@example.com (user-id)
```

---

## 💰 Costi Stimati

### Setup Minimo (SENZA Supabase)
- Deepgram: 500 ore gratis, poi $0.26/ora
- OpenAI GPT-4o-mini: ~$0.00007 per suggerimento
- **Ideale per:** Testing, MVP, uso personale

### Setup Completo (CON Supabase)
- Deepgram: come sopra
- OpenAI: come sopra  
- Supabase: Free tier (fino a 500MB DB + 50k MAU)
- **Ideale per:** Produzione, multi-utente, analytics

### Budget Esempio (50 ore/mese)
- Deepgram: $13/mese
- OpenAI (500 suggerimenti): $0.50/mese
- Supabase: $0 (free tier)
- Hosting: $0 (tier gratuiti Render/Vercel)
- **TOTALE: ~$14/mese**

---

## 🆘 Problemi Comuni

### "DEEPGRAM_API_KEY is not defined"
- ✅ Hai creato il file `.env`?
- ✅ Hai riavviato il server dopo averlo creato?
- ✅ La chiave è corretta (no spazi extra)?

### "OpenAI API error: Incorrect API key"
- ✅ La chiave inizia con `sk-proj-` o `sk-`?
- ✅ Hai crediti disponibili nell'account OpenAI?
- ✅ Non hai spazi prima/dopo la chiave?

### "Supabase: Invalid API key"
- ✅ Stai usando ANON key nel client e SERVICE_ROLE nel server?
- ✅ Hai copiato tutta la chiave (è molto lunga)?
- ✅ Il progetto Supabase è attivo?

---

## 📚 Riferimenti

- [Deepgram Docs](https://developers.deepgram.com/)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Guide Completa Supabase](SUPABASE_SETUP.md)

---

## ✅ Checklist Finale

Prima di procedere, verifica:

- [ ] Deepgram API key ottenuta
- [ ] OpenAI API key ottenuta
- [ ] (Opzionale) Supabase keys ottenute
- [ ] File `.env` creato nel server
- [ ] File `.env.local` creato nel frontend
- [ ] Tutte le chiavi copiate correttamente
- [ ] Nessuno spazio extra nelle chiavi
- [ ] File `.env` in `.gitignore`
- [ ] Server parte senza errori
- [ ] Test di connessione funzionante

**Tutto ok? Sei pronto! 🚀**

---

**Pro tip:** Salva le tue chiavi in un password manager (1Password, Bitwarden) per non perderle!
