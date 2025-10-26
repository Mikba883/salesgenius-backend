# ✅ Installation Checklist

Usa questa checklist per verificare di aver completato tutti i passaggi.

---

## 📋 Pre-Requirements

- [ ] Node.js 18+ installato (`node --version`)
- [ ] npm o yarn installato (`npm --version`)
- [ ] Git installato (opzionale, per version control)
- [ ] Chrome/Edge browser aggiornato

---

## 🔑 Account & API Keys

- [ ] Account Deepgram creato su https://console.deepgram.com/
- [ ] Deepgram API key ottenuta (500 ore gratis)
- [ ] Account OpenAI creato su https://platform.openai.com/
- [ ] OpenAI API key ottenuta
- [ ] API keys salvate in modo sicuro

---

## 🖥️ Backend Setup

- [ ] Navigato nella cartella `server/`
- [ ] Eseguito `npm install`
- [ ] Copiato `.env.example` in `.env`
- [ ] Inserito `DEEPGRAM_API_KEY` in `.env`
- [ ] Inserito `OPENAI_API_KEY` in `.env`
- [ ] Avviato server con `npm run dev`
- [ ] Verificato messaggio: "🚀 SalesGenius Backend running on ws://localhost:8080"
- [ ] Verificato health check: http://localhost:8081/health

**Test backend:**
- [ ] Eseguito `node test-client.js`
- [ ] Verificato connessione WebSocket OK

---

## 💻 Frontend Setup

### Opzione A: Nuovo Progetto Next.js

- [ ] Creato nuovo progetto: `npx create-next-app@latest my-app --typescript --tailwind --app`
- [ ] Copiato `client/salesgenius-stream.tsx` in `my-app/components/`
- [ ] Creato `my-app/app/stream/page.tsx` con il contenuto di `client/page.tsx`
- [ ] Creato `.env.local` con `NEXT_PUBLIC_WS_URL=ws://localhost:8080`
- [ ] Avviato con `npm run dev`
- [ ] Aperto http://localhost:3000/stream
- [ ] Verificato che la pagina si carica

### Opzione B: Progetto Next.js Esistente

- [ ] Copiato `client/salesgenius-stream.tsx` nel progetto
- [ ] Importato il componente in una pagina
- [ ] Aggiunto `NEXT_PUBLIC_WS_URL` in `.env.local`
- [ ] Verificato che il componente si renderizza

---

## 🧪 Test Completo

- [ ] Backend avviato e in ascolto
- [ ] Frontend avviato e accessibile
- [ ] Cliccato "Avvia Condivisione"
- [ ] Selezionato schermo/scheda nel browser
- [ ] **IMPORTANTE:** Spuntato "Condividi audio"
- [ ] Condivisione avviata con successo
- [ ] Status indicator mostra "Connesso" (pallino verde)
- [ ] Riprodotto audio (YouTube, parlato, ecc.)
- [ ] **Verificato suggerimenti appaiono** in tempo reale! 🎉

---

## 🔍 Troubleshooting Checklist

### Backend non parte
- [ ] Verificato Node.js versione >= 18
- [ ] Verificato `npm install` completato senza errori
- [ ] Verificato `.env` presente con chiavi corrette
- [ ] Verificato porta 8080 non occupata (`lsof -i :8080`)

### Frontend non si connette
- [ ] Verificato `NEXT_PUBLIC_WS_URL` corretto in `.env.local`
- [ ] Verificato backend in esecuzione
- [ ] Aperto Developer Tools → Console per errori
- [ ] Verificato WebSocket connection nel Network tab

### Nessun suggerimento appare
- [ ] Verificato audio viene catturato (check browser audio indicator)
- [ ] Controllato log server per trascrizioni Deepgram
- [ ] Verificato API keys valide e con crediti
- [ ] Provato con audio più chiaro/forte
- [ ] Verificato "Condividi audio" era spuntato

---

## 📊 Verification Tests

### Test 1: Health Check
```bash
curl http://localhost:8081/health
# Expected: {"status":"ok","timestamp":"...","uptime":...,"connections":0}
```

### Test 2: WebSocket Connection
```bash
node server/test-client.js
# Expected: ✅ Connected! + test frames sent
```

### Test 3: End-to-End
1. Open YouTube TED talk
2. Start SalesGenius
3. Share Chrome tab + audio
4. Verify suggestions appear

---

## 🎯 Success Criteria

Puoi considerare l'installazione completa quando:

✅ Backend risponde su porta 8080  
✅ Health check ritorna status "ok"  
✅ Frontend carica senza errori  
✅ Connessione WebSocket attiva (pallino verde)  
✅ Audio viene catturato correttamente  
✅ **Suggerimenti AI appaiono durante l'audio**  

---

## 🚀 Next Steps

Una volta completata questa checklist:

1. [ ] Leggi [ADVANCED.md](ADVANCED.md) per personalizzazioni
2. [ ] Testa con diverse fonti audio
3. [ ] Personalizza i prompt per il tuo caso d'uso
4. [ ] Quando pronto, segui [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📞 Problemi Persistenti?

Se hai seguito tutti i passaggi e qualcosa non funziona:

1. **Controlla i log del server** - sono molto dettagliati
2. **Verifica le API keys** sono corrette e hanno crediti
3. **Testa con curl/Postman** per isolare il problema
4. **Rileggi** [QUICKSTART.md](QUICKSTART.md) attentamente

---

**Fatto tutto? Congratulazioni! 🎉**

Il tuo SalesGenius è pronto per aiutarti nelle vendite! 🚀

---

*Salva questa checklist e usala ogni volta che installi SalesGenius in un nuovo ambiente.*
