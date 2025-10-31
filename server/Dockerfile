# server/Dockerfile
# ===============================
# 🎯 Stage 1: Build
# ===============================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia package files
COPY package*.json ./

# Installa TUTTE le dipendenze (incluse devDependencies per TypeScript)
RUN npm ci

# Copia tutto il codice sorgente
COPY . .

# Compila TypeScript
RUN npx tsc

# ===============================
# 🚀 Stage 2: Production
# ===============================
FROM node:20-alpine

WORKDIR /app

# Copia package files
COPY package*.json ./

# Installa solo dipendenze di produzione
RUN npm ci --only=production

# Copia i file compilati dal builder
COPY --from=builder /app/dist ./dist

# Copia eventuali file statici necessari (se esistono)
COPY --from=builder /app/.env* ./ 2>/dev/null || true

# Esponi la porta (Render la configura automaticamente)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Comando di avvio
CMD ["node", "dist/server.js"]


