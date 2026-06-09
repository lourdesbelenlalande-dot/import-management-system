# ── Etapa 1: Build ───────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Copiar manifiestos e instalar dependencias (solo producción para el build)
COPY package*.json tsconfig.json ./
RUN npm ci

# Compilar TypeScript
COPY src/ ./src/
RUN npm run build

# ── Etapa 2: Imagen de producción (más liviana) ───────────────────────────────
FROM node:24-alpine AS production

WORKDIR /app

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar el build compilado
COPY --from=builder /app/dist ./dist

# Crear directorio para la base de datos con los permisos correctos
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

# Variables de entorno por defecto (sobreescribir en deploy)
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/imports.db

# Healthcheck para orquestadores (Kubernetes, ECS, Railway)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/app.js"]
