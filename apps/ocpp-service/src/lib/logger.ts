/**
 * @file logger.ts
 * @description Structured logger using pino for the OCPP service.
 * Every log line includes timestamp, level, service, and traceId.
 * @module apps/ocpp-service/lib
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import pino from 'pino'

export const logger = pino({
  name: 'ocpp-service',
  level: process.env['LOG_LEVEL'] ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.accessCode'],
    censor: '[REDACTED]',
  },
})
