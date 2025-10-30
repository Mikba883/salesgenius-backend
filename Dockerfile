# ===============================
# Backend Dockerfile - SalesGenius
# ===============================

FROM node:20-alpine AS builder
WORKDIR /app

# 1️⃣ Installa tutte le dipendenze
COPY package*.json ./
RUN npm install

# 2️⃣ Copia tutto il codice sorgente
COPY . .

# 3️⃣ Compila TypeScript
RUN npx tsc

# ===============================
# Production Image
# ===============================
FROM node:20-alpine
WORKDIR /app

# Copia solo i file necessari dal builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# 4️⃣ Esponi la porta
EXPOSE 8080

# 5️⃣ Health Check automatico
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 6️⃣ Avvia il server compilato
CMD ["node", "dist/server.js"]
