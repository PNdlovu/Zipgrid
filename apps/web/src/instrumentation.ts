/**
 * @file instrumentation.ts
 * @description Next.js instrumentation hook — runs once at server startup.
 * Bootstraps Sentry error monitoring and background services
 * (webhook delivery, audit logger, reward event handlers).
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  const dsn = process.env['SENTRY_DSN']

  // ── Sentry — Node.js runtime ───────────────────────────────
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (dsn) {
      const Sentry = await import('@sentry/nextjs')
      Sentry.init({
        dsn,
        environment:      process.env['NODE_ENV'] ?? 'development',
        tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
        ignoreErrors: ['NEXT_NOT_FOUND', 'NEXT_REDIRECT', 'AbortError'],
      })
    }

    // Background service bootstrap
    const [
      { bootstrapWebhookDelivery },
      { bootstrapAuditLogger },
      { bootstrapRewardEventHandlers },
    ] = await Promise.all([
      import('@/domains/webhooks/WebhookDeliveryService'),
      import('@/domains/compliance/AuditLogger'),
      import('@/domains/rewards/RewardEventHandlers'),
    ])

    bootstrapAuditLogger()
    bootstrapWebhookDelivery()
    bootstrapRewardEventHandlers()
  }

  // ── Sentry — Edge runtime ──────────────────────────────────
  if (process.env.NEXT_RUNTIME === 'edge' && dsn) {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn,
      environment:      process.env['NODE_ENV'] ?? 'development',
      tracesSampleRate: 0,
    })
  }
}
