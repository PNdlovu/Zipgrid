/**
 * @file platform.ts
 * @description Notifies the web platform of charger events over its internal
 * webhook (POST {WEB_API_URL}/api/v1/webhooks/ocpp, Bearer OCPP_SERVICE_SECRET).
 *
 * Delivery is best-effort with a short retry: the web platform also runs a
 * settlement cron, so a lost `session.completed` is recovered automatically.
 *
 * @module apps/ocpp-service/lib
 */

import { config } from './config'
import { logger } from './logger'

export type PlatformEvent =
  | { event: 'session.completed'; sessionId: string }
  | { event: 'charger.faulted'; chargePointId: string; connectorId: number; errorCode: string }

const ATTEMPTS = 3

export async function notifyPlatform(payload: PlatformEvent): Promise<void> {
  if (!config.webApiUrl) {
    logger.warn({ event: payload.event }, 'WEB_API_URL not set — platform event not sent')
    return
  }
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${config.webApiUrl}/api/v1/webhooks/ocpp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.serviceSecret}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
      })
      if (res.ok) return
      logger.warn({ event: payload.event, status: res.status, attempt }, 'Platform webhook non-2xx')
      if (res.status < 500) return
    } catch (err) {
      logger.warn({ event: payload.event, err, attempt }, 'Platform webhook failed')
    }
    await new Promise((r) => setTimeout(r, attempt * 1_000))
  }
}
