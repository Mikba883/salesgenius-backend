# 🚀 Guida Deployment SalesGenius

## Backend WebSocket

### Option 1: Render.com (Raccomandato)

**Vantaggi:** Supporto WebSocket nativo, SSL gratuito, deploy automatico da Git

1. **Crea nuovo Web Service** su [render.com](https://render.com)

2. **Configurazione:**
   ```yaml
   Name: salesgenius-backend
   Environment: Node
   Build Command: npm install && npm run build
   Start Command: npm start
   ```

3. **Environment Variables:**
   ```
   DEEPGRAM_API_KEY=your_key
   OPENAI_API_KEY=your_key
   PORT=10000
   ```

4. **Plan:** Free (sufficiente per test) o Starter ($7/mese)

5. **URL WebSocket:** `wss://salesgenius-backend.onrender.com`

**Note:**
- Free tier va in sleep dopo 15min inattività (primo request lento)
- Starter tier sempre attivo

---

### Option 2: Railway.app

**Vantaggi:** Deploy semplicissimo, prezzi flessibili

1. **Installa Railway CLI:**
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Deploy:**
   ```bash
   cd server
   railway init
   railway up
   ```

3. **Set env vars:**
   ```bash
   railway variables set DEEPGRAM_API_KEY=your_key
   railway variables set OPENAI_API_KEY=your_key
   ```

4. **Genera dominio pubblico:**
   ```bash
   railway domain
   ```

**Costo:** Pay-as-you-go, ~$5-10/mese per uso moderato

---

### Option 3: Fly.io

**Vantaggi:** Global edge deployment, ottimo per bassa latenza

1. **Installa Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth signup
   ```

2. **Inizializza app:**
   ```bash
   cd server
   fly launch
   ```

3. **Configura fly.toml:**
   ```toml
   app = "salesgenius-backend"
   
   [build]
     builder = "heroku/buildpacks:20"
   
   [[services]]
     internal_port = 8080
     protocol = "tcp"
   
     [[services.ports]]
       handlers = ["http"]
       port = 80
   
     [[services.ports]]
       handlers = ["tls", "http"]
       port = 443
   ```

4. **Set secrets:**
   ```bash
   fly secrets set DEEPGRAM_API_KEY=your_key
   fly secrets set OPENAI_API_KEY=your_key
   ```

5. **Deploy:**
   ```bash
   fly deploy
   ```

**Costo:** ~$5-15/mese

---

### Option 4: DigitalOcean App Platform

1. **Crea App** da dashboard DO
2. **Scegli GitHub repo**
3. **Configurazione:**
   - Type: Web Service
   - Build: `npm install && npm run build`
   - Run: `npm start`

4. **Environment Variables** nelle impostazioni

5. **Scala:** Basic ($5/mese) o Professional ($12/mese)

---

### Option 5: Self-Hosted (VPS)

**Per utenti avanzati:**

```bash
# SSH nel server
ssh user@your-server.com

# Installa Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repo
git clone https://github.com/your-username/salesgenius.git
cd salesgenius/server

# Installa deps
npm install

# Build
npm run build

# Setup PM2 per auto-restart
sudo npm install -g pm2
pm2 start dist/server.js --name salesgenius-backend
pm2 save
pm2 startup

# Setup Nginx reverse proxy
sudo apt-get install nginx
```

**Nginx config (`/etc/nginx/sites-available/salesgenius`):**

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name ws.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

**SSL con Certbot:**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d ws.yourdomain.com
```

---

## Frontend (Next.js)

### Vercel (Raccomandato)

**Vantaggi:** Zero-config per Next.js, CDN globale, SSL automatico

1. **Push su GitHub**

2. **Import project** su [vercel.com](https://vercel.com)

3. **Environment Variables:**
   ```
   NEXT_PUBLIC_WS_URL=wss://salesgenius-backend.onrender.com
   ```

4. **Deploy automatico** ad ogni push

**Costo:** Free per progetti personali

---

### Netlify

1. **Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   netlify login
   netlify init
   ```

2. **netlify.toml:**
   ```toml
   [build]
     command = "npm run build"
     publish = ".next"
   ```

3. **Environment Variables** nella dashboard

4. **Deploy:**
   ```bash
   netlify deploy --prod
   ```

---

### Cloudflare Pages

1. **Push su GitHub**

2. **Crea nuovo progetto** su Cloudflare Pages

3. **Build settings:**
   - Framework: Next.js
   - Build command: `npm run build`
   - Output: `.next`

4. **Environment Variables** nelle settings

---

## 🔒 Checklist Pre-Production

### Backend

- [ ] Environment variables configurate
- [ ] HTTPS/WSS attivo (no HTTP/WS in prod)
- [ ] Logging abilitato (Sentry, LogRocket)
- [ ] Rate limiting implementato
- [ ] Auth JWT configurato
- [ ] Health check endpoint (`/health`)
- [ ] Monitoring (Uptime Robot, Pingdom)
- [ ] Backup/recovery plan

### Frontend

- [ ] WS URL punta a backend production
- [ ] Error boundaries implementati
- [ ] Analytics configurato (GA4, Plausible)
- [ ] SEO meta tags
- [ ] Favicon e manifest
- [ ] 404/500 pages
- [ ] Loading states
- [ ] Mobile responsive verificato

---

## 📊 Monitoring

### Backend Monitoring

**Uptime Robot (Gratuito):**
1. Aggiungi monitor HTTP per `https://your-backend.com/health`
2. Intervallo: 5 minuti
3. Alert via email/SMS

**Sentry (Error Tracking):**

```typescript
// server.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### Frontend Monitoring

**Vercel Analytics:**
- Attivato automaticamente su Vercel
- Dashboard nella console

**Sentry per React:**

```typescript
// app/layout.tsx
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

---

## 🚨 Troubleshooting Production

### WebSocket non si connette

1. **Verifica SSL:**
   - Frontend HTTPS deve usare backend WSS
   - Certificato SSL valido

2. **Verifica CORS:**
   ```typescript
   // Aggiungi nel server se necessario
   ws.on('connection', (socket, req) => {
     const origin = req.headers.origin;
     // Valida origin
   });
   ```

3. **Verifica firewall:**
   - Porta WS (default 8080) aperta
   - Timeout WebSocket sufficientemente lungo

### Performance Issues

1. **Scale vertically:** Aumenta risorse server
2. **Scale horizontally:** Più istanze + load balancer
3. **Ottimizza:**
   - Riduci frequency suggerimenti
   - Cache risultati comuni
   - Usa modelli LLM più veloci

---

## 💰 Costi Stimati Mensili

### Setup Minimo (Test/MVP)
- Backend: Render Free = **$0**
- Frontend: Vercel Free = **$0**
- Deepgram: 50 ore = **$13**
- OpenAI: 500 suggerimenti = **$0.50**
- **TOTALE: ~$14/mese**

### Setup Small Business
- Backend: Render Starter = **$7**
- Frontend: Vercel Pro = **$20**
- Deepgram: 500 ore = **$130**
- OpenAI: 5K suggerimenti = **$5**
- Monitoring: Sentry = **$0** (free tier)
- **TOTALE: ~$162/mese**

### Setup Enterprise
- Backend: Railway Pro = **$50**
- Frontend: Vercel Enterprise = **$150+**
- Deepgram: 5K ore = **$1300**
- OpenAI: 50K suggerimenti = **$50**
- Monitoring: Sentry Business = **$26**
- **TOTALE: ~$1576/mese**

---

## 🎯 Best Practices

1. **Inizia con tier gratuiti** per validare il prodotto
2. **Monitora costi API** (Deepgram + OpenAI) - sono la voce principale
3. **Implementa rate limiting** per evitare abusi
4. **Cache intelligente** per ridurre chiamate API
5. **Auto-scaling** per gestire picchi di traffico
6. **Backup regolari** delle configurazioni
7. **Logging strutturato** per debug efficace
8. **Health checks** e alerting 24/7

---

**Buon deployment! 🚀**
