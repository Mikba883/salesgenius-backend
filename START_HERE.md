# 🎉 Benvenuto in SalesGenius!

## 🚀 Cosa hai ricevuto

**SalesGenius** è un sistema completo di assistenza vendita AI in tempo reale che:

✅ **Cattura schermo + audio** durante le tue chiamate di vendita  
✅ **Trascrive in tempo reale** con Deepgram (senza mostrare il testo)  
✅ **Genera suggerimenti AI** categorizzati via OpenAI streaming  
✅ **Mostra tips actionable** durante la conversazione (max 20 parole)  

---

## 📚 Dove Iniziare?

### 👋 Sei nuovo? Inizia qui!

1. **[QUICKSTART.md](QUICKSTART.md)** ← **INIZIA QUI!**
   - Setup completo in 5 minuti
   - Tutto quello che ti serve per partire
   - Test locale funzionante

2. **[README.md](README.md)**
   - Documentazione completa
   - Architettura del sistema
   - Come funziona tutto

3. **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)**
   - Mappa di tutti i file
   - Cosa contiene ogni cartella
   - Navigazione veloce

---

## 🎯 Percorso Consigliato

```
1️⃣  QUICKSTART.md
    ↓ (Setup in 5 minuti)
    
2️⃣  Test locale
    ↓ (Verifica che funziona)
    
3️⃣  README.md
    ↓ (Capisci l'architettura)
    
4️⃣  ADVANCED.md
    ↓ (Personalizza per le tue esigenze)
    
5️⃣  DEPLOYMENT.md
    ↓ (Deploy in produzione)
    
6️⃣  🎉 SalesGenius in produzione!
```

---

## 📁 File Importanti

| File | Descrizione | Quando Leggerlo |
|------|-------------|-----------------|
| **QUICKSTART.md** | Setup rapido | 🟢 PRIMA COSA |
| **README.md** | Documentazione completa | Dopo aver provato |
| **DEPLOYMENT.md** | Guide deploy | Quando vai in prod |
| **ADVANCED.md** | Customizzazione | Per personalizzare |
| **PROJECT_STRUCTURE.md** | Mappa progetto | Reference veloce |
| **CHANGELOG.md** | Versioni | Aggiornamenti |

---

## 🛠️ Cosa Ti Serve

Prima di iniziare, assicurati di avere:

✅ **Node.js 18+** installato  
✅ Account **[Deepgram](https://console.deepgram.com/)** (500 ore gratis)  
✅ Account **[OpenAI](https://platform.openai.com/)** con API key  
✅ **Chrome/Edge** browser (per audio capture)  

---

## ⚡ Quick Commands

```bash
# Setup backend
cd server
npm install
cp .env.example .env
# Edita .env con le tue API keys
npm run dev

# Setup frontend (nuovo progetto Next.js)
npx create-next-app@latest my-salesgenius --typescript --tailwind --app
cd my-salesgenius
# Copia i file client come da QUICKSTART.md
npm run dev
```

Vai su `http://localhost:3000/stream` e sei pronto! 🎉

---

## 🎥 Demo Flow

1. **Apri Google Meet/YouTube** in una scheda Chrome
2. **Riproduci un video** con parlato (es. TED talk)
3. **Avvia SalesGenius** e condividi quella scheda + audio
4. **Osserva i suggerimenti** AI apparire in tempo reale!

---

## 💰 Costi Stimati

### Test/Development (50 ore audio)
- Deepgram: **$13/mese**
- OpenAI: **$0.50/mese**
- Hosting: **$0** (tier gratuiti)
- **TOTALE: ~$14/mese**

Perfetto per iniziare! 🎯

---

## 🆘 Problemi?

1. **Leggi** [QUICKSTART.md](QUICKSTART.md) - risolve il 90% dei problemi
2. **Controlla** i log del server - sono molto verbosi
3. **Verifica** le API keys in `.env`
4. **Assicurati** di aver spuntato "Condividi audio" nel browser

---

## 🎓 Cosa Imparerai

Questo progetto è perfetto per imparare:

- ✅ WebSocket real-time streaming
- ✅ Audio processing in browser (Web Audio API)
- ✅ Speech-to-text con Deepgram
- ✅ AI streaming con OpenAI
- ✅ React/Next.js avanzato
- ✅ Node.js/TypeScript backend
- ✅ Docker & deployment

---

## 🌟 Features Complete

✅ Client React/Next.js con Tailwind  
✅ Server Node.js/TypeScript  
✅ WebSocket streaming PCM16 @ 16kHz  
✅ Deepgram Live integration  
✅ OpenAI streaming suggestions  
✅ 4 categorie suggerimenti  
✅ Health checks & monitoring  
✅ Docker support  
✅ CI/CD con GitHub Actions  
✅ Documentazione completa  
✅ Guide deployment per 5+ piattaforme  
✅ Esempi configurazione avanzata  

**È tutto pronto!** 🚀

---

## 📞 Next Steps

1. **Segui** [QUICKSTART.md](QUICKSTART.md)
2. **Testa** in locale
3. **Personalizza** prompts per il tuo caso d'uso
4. **Deploy** in produzione
5. **Monitora** performance e costi
6. **Iterare** e migliorare!

---

## 🎯 Obiettivo

**Far partire SalesGenius funzionante in 5 minuti!**

Sei pronto? → [Vai al QUICKSTART!](QUICKSTART.md)

---

**Buona fortuna con il tuo progetto! 🚀💪**

*Se questo progetto ti è stato utile, considera di condividerlo o contribuire con miglioramenti!*

---

📄 **Creato:** Ottobre 2025  
⚡ **Stack:** Next.js + Node.js + Deepgram + OpenAI  
📝 **License:** MIT  
