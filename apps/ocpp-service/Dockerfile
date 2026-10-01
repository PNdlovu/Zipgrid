# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript → dist/
RUN npx tsc --outDir dist

# Remove dev dependencies
RUN npm prune --production

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 ocpp

# Copy only production artefacts
COPY --from=builder --chown=ocpp:nodejs /app/dist     ./dist
COPY --from=builder --chown=ocpp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=ocpp:nodejs /app/package.json ./package.json

USER ocpp

EXPOSE 3001

# Health check — hit the /ocpp/health endpoint every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/ocpp/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
