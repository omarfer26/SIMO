# SIMO - Imagen del frontend (Next.js) para el despliegue.
# Contexto de construcción: la carpeta simoapp/ (ver deploy/docker-compose.yml).
# No requiere cambios en el código del frontend.

# ---------- Etapa 1: dependencias y compilación ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# URL pública de la API; Next.js la incrusta en el código del navegador al compilar
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

# ---------- Etapa 2: ejecución ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3001
CMD ["node_modules/.bin/next", "start", "-p", "3001"]
