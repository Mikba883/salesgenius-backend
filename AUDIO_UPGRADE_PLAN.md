# 🎵 PIANO UPGRADE AUDIO 48kHz

## ⚠️ PROBLEMA IDENTIFICATO

**Data:** 2025-11-18
**Issue:** Sample rate mismatch tra frontend (16kHz) e backend (48kHz) causa perdita totale delle trascrizioni Deepgram.

**Sintomi:**
- Audio inviato correttamente a Deepgram ✅
- Deepgram NON restituisce trascrizioni ❌
- Nessun errore esplicito nei logs ⚠️
- Zero suggerimenti generati 🚫

**Root Cause:**
Backend configurato a 48kHz mentre frontend invia ancora audio a 16kHz → Deepgram riceve formato audio incompatibile.

---

## 📋 SEQUENZA UPGRADE CORRETTA (2 Step Deployment)

### ✅ STEP 1: Frontend Update FIRST

**Modifiche richieste in `offscreen.js` (o equivalente):**

```diff
// ❌ RIMUOVERE forced downsampling
- const ctx = new AudioContext({ sampleRate: 16000 });

// ✅ USA sample rate nativo del sistema (44.1k o 48k)
+ const ctx = new AudioContext();
```

**File da aggiornare:**
1. `client/salesgenius-stream.tsx:116` - Rimuovere `sampleRate: 16000`
2. `client/salesgenius-stream.tsx:184` - Aggiornare calcolo buffer duration
3. `client/salesgenius-stream.tsx:310` - Rimuovere riferimento `sr: 16000`

**Test necessari:**
- Verificare `ctx.sampleRate` nei logs (dovrebbe essere 44100 o 48000)
- Confermare che l'audio viene acquisito senza distorsione
- Controllare dimensione pacchetti inviati (dovrebbero essere 3x più grandi)

**Deploy frontend:**
```bash
npm run build
# Deploy su hosting (Vercel/Netlify/ecc.)
```

---

### ✅ STEP 2: Backend Update AFTER

**SOLO DOPO che il frontend è live con audio 48kHz:**

```typescript
// server/src/server.ts:635
deepgramConnection = deepgramClient.listen.live({
  encoding: 'linear16',
  sample_rate: 48000,  // ⚡ UPGRADE a 48kHz
  channels: 1,
  language: 'multi',
  // ... resto configurazione
});
```

**Deploy backend:**
```bash
git add server/src/server.ts
git commit -m "Upgrade: Backend to 48kHz native audio (after frontend update)"
git push
# Redeploy su Render con "Clear build cache & deploy"
```

**Post-deploy verification:**
```bash
# Nei logs Render verificare:
1. "🎤 [FINAL]" e "🎤 [INTERIM]" presenti (trascrizioni funzionanti)
2. "💡 AI Suggestion" appare dopo conversation trigger
3. Nessun errore "❌ Deepgram error details"
```

---

## 🔄 ROLLBACK APPLICATO (2025-11-18)

**Commit:** Revert to 16kHz sample rate for Deepgram compatibility

**Motivo:**
Frontend non ancora aggiornato → Mantenere 16kHz per garantire funzionamento trascrizioni.

**Stato attuale:**
- ✅ Backend: 16kHz (FUNZIONANTE con frontend attuale)
- ⏳ Frontend: 16kHz (DA AGGIORNARE a nativo 44.1k/48k)

---

## 📊 BENEFICI UPGRADE 48kHz (quando completato)

| Metrica | 16kHz (attuale) | 48kHz (target) |
|---------|-----------------|----------------|
| Qualità voce | Sufficiente | Eccellente |
| Distorsione browser | Presente (downsampling forzato) | Eliminata |
| CPU client | Alta (resampling continuo) | Bassa (passthrough) |
| Latenza trascrizione | Normale | Potenzialmente migliorata |
| Costo Deepgram | Standard | Standard (stesso piano) |

---

## 🎯 CHECKLIST DEPLOYMENT

### Frontend Team:
- [ ] Rimuovere `sampleRate: 16000` da tutti i file audio
- [ ] Testare audio acquisition in dev (verificare ctx.sampleRate in console)
- [ ] Aggiornare calcoli durata buffer (16000 → 48000 Hz)
- [ ] Deploy frontend production
- [ ] Confermare con test manuale che audio viene catturato correttamente
- [ ] Notificare Backend Team per STEP 2

### Backend Team:
- [ ] **ATTENDERE** conferma frontend live
- [ ] Cambiare `sample_rate: 16000` → `sample_rate: 48000`
- [ ] Commit e push su branch
- [ ] Deploy Render con "Clear build cache & deploy"
- [ ] Monitorare logs per trascrizioni `🎤 [FINAL]`
- [ ] Test end-to-end con audio call reale

---

## 🐛 TROUBLESHOOTING

**Sintomo:** Nessuna trascrizione dopo upgrade backend a 48kHz

**Causa:** Frontend non ancora aggiornato (mismatch sample rate)

**Fix:**
```bash
# Rollback immediato backend a 16kHz
git revert HEAD
git push
# Redeploy Render
```

**Sintomo:** Audio distorto anche con frontend 48kHz

**Causa possibile:** Browser non supporta 48kHz nativamente

**Fix:**
```javascript
// Fallback intelligente nel frontend
const ctx = new AudioContext();
const targetRate = ctx.sampleRate; // Usa qualsiasi rate supportato
console.log(`Using native sample rate: ${targetRate}Hz`);
```

---

## 📞 CONTATTI

**Per domande su questo upgrade:**
- Frontend Lead: [inserire contatto]
- Backend Lead: [inserire contatto]
- DevOps: [inserire contatto]

**Documentazione Deepgram:**
- https://developers.deepgram.com/docs/audio-requirements
- Supported sample rates: 8000, 16000, 24000, 32000, 44100, 48000 Hz
