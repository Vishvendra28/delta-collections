# Stage 1 — build the Vite frontend
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Stage 2 — production image
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend and server source
COPY --from=builder /app/dist ./dist
COPY server ./server

EXPOSE 3001

# busybox wget — no curl in node:20-alpine. Hits the liveness route, which never touches the DB.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT:-3001}/api/health || exit 1

CMD ["node", "server/index.js"]
