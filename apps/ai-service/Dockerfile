# ── AI Service — Railway Dockerfile ──────────────────────────────────────────
# Python 3.12 slim — minimises image size for Railway's container registry.
# Uses a non-root user and multi-stage-style layer caching for fast rebuilds.

FROM python:3.12-slim AS base

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Dependencies stage ────────────────────────────────────────────────────────
FROM base AS deps

WORKDIR /app

# Copy dependency spec first for layer cache
COPY pyproject.toml ./

# Install production dependencies only
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e "."

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM deps AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Non-root user
RUN useradd --system --uid 1001 --create-home aiuser
USER aiuser

# Copy application source
COPY --chown=aiuser:aiuser . .

EXPOSE 8000

# Health check — FastAPI exposes /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Uvicorn with auto-reload OFF in production
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 2 --log-level info
