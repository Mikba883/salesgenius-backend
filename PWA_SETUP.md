# 📱 Guida Completa: PWA SalesGenius

## 🎯 Cos'è la PWA

**Progressive Web App** = Una mini-app che l'utente può installare dal browser come se fosse un'app nativa!

### ✅ Vantaggi PWA:
- **Finestra separata** - Si apre come app a sé, non una tab del browser
- **Always-on-top** - Può stare sopra alle altre finestre
- **Ridimensionabile** - L'utente la posiziona dove vuole
- **Nessun browser bar** - Interfaccia pulita, solo la tua UI
- **Offline ready** - Funziona anche senza internet (dopo prima installazione)
- **Desktop icon** - Appare come app normale nel sistema
- **Facile da installare** - 2 click dal browser

---

## 🚀 Come Funziona per l'Utente

### User Journey Completo:

```
1. Utente fa login su tuosito.com (Lovable)
   ↓
2. Va nella dashboard
   ↓
3. Vede bottone "📲 Installa AI Assistant"
   ↓
4. Clicca → Browser chiede: "Installare SalesGenius?"
   ↓
5. Clicca "Installa"
   ↓
6. L'app si apre in finestra separata
   ↓
7. Icona appare sul desktop / menu Start
   ↓
8. D'ora in poi può aprirla dal desktop come qualsiasi app!
   ↓
9. Durante le chiamate:
   - Apre Google Meet in una finestra
   - Apre SalesGenius PWA in un'altra finestra
   - Posiziona la PWA sopra Meet (always-on-top)
   - Vede suggerimenti in tempo reale!
```

---

## 📦 Setup: Deploy della PWA

### Opzione 1: Subdomain Dedicato (Consigliato)

**URL PWA:** `https://app.tuosito.com`

#### A) Setup su Vercel

1. **Crea nuovo progetto** Vercel
2. **Connetti GitHub** con la cartella `pwa/`
3. **Configurazione:**
   ```
   Root Directory: pwa
   Build Command: (lascia vuoto - è HTML statico)
   Output Directory: .
   Install Command: (lascia vuoto)
   ```

4. **Environment Variables:**
   ```
   VITE_WS_URL=wss://salesgenius-backend.onrender.com
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=tua_anon_key
   ```

5. **Custom Domain:**
   - Settings → Domains
   - Aggiungi `app.tuosito.com`
   - Configura DNS:
     ```
     Type: CNAME
     Name: app
     Value: cname.vercel-dns.com
     ```

6. **Deploy!**

---

### Opzione 2: Stessa Domain, Path Diverso

**URL PWA:** `https://tuosito.com/app`

In Lovable, aggiungi la PWA come route separata:

```typescript
// In Lovable routing
{
  path: '/app',
  component: () => import('./pwa/index.html'), // Serve il file PWA
}
```

---

## 🔗 Integrazione con Lovable

### 1. Aggiungi Bottone "Installa App" nella Dashboard

```typescript
// src/pages/Dashboard.tsx (in Lovable)

import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // If no prompt, redirect to PWA URL
      window.open('https://app.tuosito.com', '_blank', 'width=400,height=600');
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User installed PWA');
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
  };

  const handleLaunchPWA = () => {
    window.open('https://app.tuosito.com', 'SalesGenius', 'width=400,height=700');
  };

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      
      {/* Install/Launch Card */}
      <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl">
        <div className="flex items-center gap-4">
          <div className="text-5xl">🎯</div>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2">AI Sales Assistant</h3>
            <p className="text-blue-100 text-sm mb-4">
              Installa l'app per averla sempre a portata di mano durante le chiamate
            </p>
            
            {!isInstalled ? (
              <button 
                onClick={handleInstallClick}
                className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition"
              >
                📲 Installa App Desktop
              </button>
            ) : (
              <button 
                onClick={handleLaunchPWA}
                className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition"
              >
                🚀 Apri Assistant
              </button>
            )}
          </div>
        </div>
        
        <div className="mt-4 text-xs text-blue-100">
          💡 Tip: Posiziona l'app sopra la finestra della chiamata per vedere i suggerimenti in tempo reale!
        </div>
      </div>
      
      {/* Rest of dashboard */}
    </div>
  );
}
```

---

## 🎨 Personalizzazione PWA

### Cambia Colori e Tema

Modifica `pwa/index.html`:

```css
/* Cambia colore principale */
body {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); /* Tuo colore */
}

.action-button.start {
  background: linear-gradient(135deg, #e94560 0%, #0f3460 100%); /* Tuo gradiente */
}
```

### Cambia Logo/Icone

1. **Crea icone** (usa https://realfavicongenerator.net/)
2. **Sostituisci** in `pwa/icons/`:
   - icon-192.png
   - icon-512.png
3. **Aggiorna** manifest.json se serve

### Dimensioni Finestra Default

Modifica il popup nel dashboard:

```javascript
window.open(
  'https://app.tuosito.com', 
  'SalesGenius', 
  'width=450,height=750,left=50,top=50' // Personalizza dimensioni e posizione
);
```

---

## 🖼️ Creare le Icone

### Metodo Facile: Canva + Generator

1. **Crea logo** su Canva (1024x1024px)
2. **Scarica** come PNG
3. **Vai su** https://realfavicongenerator.net/
4. **Upload** il tuo logo
5. **Genera** tutte le dimensioni
6. **Scarica** e sostituisci in `pwa/icons/`

### Icone Necessarie:

```
pwa/icons/
├── icon-72.png
├── icon-96.png
├── icon-128.png
├── icon-144.png
├── icon-152.png
├── icon-192.png    ← Principale
├── icon-384.png
└── icon-512.png    ← Splash screen
```

---

## 🧪 Test PWA in Locale

### 1. Serve la PWA con HTTPS

PWA funziona solo con HTTPS. In locale usa:

```bash
cd pwa

# Opzione A: npx serve con HTTPS
npx serve -s . --ssl-cert localhost.pem --ssl-key localhost-key.pem

# Opzione B: Python simple server (senza HTTPS - solo per test base)
python3 -m http.server 8000

# Opzione C: ngrok per HTTPS pubblico
npx serve -s .
# In altra finestra:
ngrok http 3000
# Usa l'URL https che ti dà ngrok
```

### 2. Apri in Chrome

```
https://localhost:3000
```

### 3. Testa Installazione

- **Chrome:** Icona ⊕ nella barra indirizzi → "Installa SalesGenius"
- **Edge:** Icona app nella barra → "Installa"
- **Desktop:** L'app appare nel menu Start / Applications

### 4. Verifica Features

- [ ] Si apre in finestra separata
- [ ] Nessun browser bar visibile
- [ ] Ridimensionabile
- [ ] Bottone "Avvia" funziona
- [ ] Chiede permesso schermo+audio
- [ ] Si connette al backend
- [ ] Suggerimenti appaiono

---

## 🔧 Troubleshooting

### "Installa" non appare

- ✅ Deve essere servito via HTTPS (non http://)
- ✅ Manifest.json deve essere valido
- ✅ Service Worker deve registrarsi senza errori
- ✅ Apri DevTools → Application → Manifest (vedi se carica)

### Service Worker non si registra

```javascript
// Controlla console per errori
navigator.serviceWorker.register('/sw.js')
  .then(() => console.log('SW registered'))
  .catch(err => console.error('SW failed:', err));
```

### PWA non si connette al backend

- ✅ Verifica URL WebSocket corretto in env vars
- ✅ Backend deve supportare WSS (non WS) in produzione
- ✅ CORS deve permettere origin della PWA

### Finestra troppo piccola/grande

Cambia dimensioni default:

```javascript
// Nel dashboard quando apri la PWA
window.open(url, 'SalesGenius', 'width=500,height=800'); // Personalizza
```

---

## 📊 Analytics & Monitoring

### Track Installazioni PWA

```javascript
// In Lovable dashboard
window.addEventListener('beforeinstallprompt', (e) => {
  // Track che il prompt è apparso
  analytics.track('PWA Install Prompt Shown');
});

window.addEventListener('appinstalled', (e) => {
  // Track installazione completata
  analytics.track('PWA Installed');
});
```

### Track Uso PWA

```javascript
// In pwa/index.html
if (window.matchMedia('(display-mode: standalone)').matches) {
  // Utente sta usando la PWA installata
  analytics.track('PWA Launched');
}
```

---

## 🎁 Features Extra (Opzionali)

### 1. Always-on-Top (Windows)

Purtroppo il browser non può forzare always-on-top, MA:

**Workaround:** L'utente può fare:
- **Windows:** Win + ↑ per maximizzare, poi ridimensiona
- **macOS:** Usa app "Afloat" o "Rectangle" per always-on-top

**Alternativa:** Crea una vera app con Electron (più complesso).

### 2. Notifiche Push

Aggiungi nel service worker:

```javascript
// Chiedi permesso notifiche
Notification.requestPermission().then(permission => {
  if (permission === 'granted') {
    // Subscribe to push
  }
});

// Invia notifica quando nuovo suggerimento
new Notification('Nuovo Suggerimento!', {
  body: 'Hai ricevuto un nuovo tip AI',
  icon: '/icons/icon-192.png',
});
```

### 3. Shortcuts Desktop

Già configurato in manifest.json! L'utente può:
- Click destro sull'icona PWA
- Vedere "Avvia Assistente" come shortcut

---

## 📱 UX Finale Utente

### Desktop (Windows/Mac):

```
1. Utente vede icona "SalesGenius" sul desktop
2. Double-click per aprire
3. Finestra pulita si apre (no browser bar)
4. Clicca "Avvia Assistente"
5. Seleziona finestra Google Meet da condividere
6. Posiziona la finestra SalesGenius nell'angolo
7. Vede suggerimenti real-time!
8. Finita call → Click "Stop"
9. Chiude finestra
```

### Durante la Call:

```
┌─────────────────────────────┐         ┌──────────────────┐
│ Google Meet (Fullscreen)    │         │ SalesGenius PWA  │
│                              │         │ ┌──────────────┐ │
│  👤 Cliente                  │         │ │ 🎧 Suggest.  │ │
│  👤 Te                       │         │ │ Ask about... │ │
│  👤 Collega                  │         │ └──────────────┘ │
│                              │         │ ┌──────────────┐ │
│  📹  🎤  💬                  │         │ │ 💎 Value     │ │
│                              │         │ │ Quantify ROI │ │
│                              │         │ └──────────────┘ │
└─────────────────────────────┘         └──────────────────┘
         Main Screen                     Corner (always visible)
```

---

## ✅ Checklist Deploy PWA

### Setup Iniziale:
- [ ] File PWA creati in `pwa/`
- [ ] Icone generate (72-512px)
- [ ] Manifest.json configurato
- [ ] Service Worker testato
- [ ] Backend WebSocket funzionante

### Deploy:
- [ ] PWA deployata su Vercel (app.tuosito.com)
- [ ] HTTPS attivo
- [ ] Environment variables configurate
- [ ] DNS configurato (se subdomain)

### Integrazione Lovable:
- [ ] Bottone "Installa App" aggiunto in dashboard
- [ ] Handler beforeinstallprompt implementato
- [ ] Link a PWA funzionante
- [ ] Test installazione da browser

### Test Utente:
- [ ] PWA si installa correttamente
- [ ] Icona appare sul desktop
- [ ] Si apre in finestra separata
- [ ] Condivisione schermo funziona
- [ ] WebSocket si connette
- [ ] Suggerimenti appaiono
- [ ] Always-on-top possibile (manualmente)

---

**La tua mini-app PWA è pronta! 🎉**

Gli utenti possono installarla e usarla come una vera app desktop, posizionandola dove vogliono durante le chiamate!

---

Domande? Problemi? Chiedimi! 🚀
