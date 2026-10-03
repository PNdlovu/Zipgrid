# =============================================================
# Zipgrid Web App — Railway Dockerfile
# Multi-stage build for Next.js 15 monorepo
# Context: repository root (Railway sets this automatically)
# =============================================================

FROM node:20-alpine AS base
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/ui-primitives/package.json ./packages/ui-primitives/
COPY apps/web/package.json ./apps/web/
RUN npm ci --include=dev

# ── Build ─────────────────────────────────────────────────────
FROM deps AS builder
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Shared packages have no build script — skip silently
RUN npm run build --workspace=packages/types 2>/dev/null || true
RUN npm run build --workspace=packages/utils 2>/dev/null || true

WORKDIR /app/apps/web
RUN npm run build

# ── Production image ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# standalone output already contains its own node_modules snapshot
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public           ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
