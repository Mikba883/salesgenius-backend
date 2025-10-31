# ===============================
# 🧠 SalesGenius Backend - Dockerfile
# ===============================
# Multi-stage build for Render (Node 20 + TypeScript)
# ===============================

# ---------- STAGE 1: BUILD ----------
FROM node:20-alpine AS builder
WORKDIR /app

# 1️⃣ Copia i file di configurazione
COPY package*.json ./

# 2️⃣ Installa tutte le dipendenze (anche dev)
RUN npm install

# 3️⃣ Copia il codice sorgente
COPY . .

# 4️⃣ Compila TypeScript
RUN npx tsc

# ---------- STAGE 2: PRODUCTION ----------
FROM node:20-alpine
WORKDIR /app

# 5️⃣ Copia solo il necessario
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 6️⃣ Installa solo le dipendenze di produzione
RUN npm install --omit=dev

# 7️⃣ Espone la porta del server
EXPOSE 8080

# 8️⃣ Health Check per Render
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

# 9️⃣ Comando di avvio
CMD ["node", "dist/server.js"]
