/**
 * @file route.ts
 * @description POST /api/v1/sessions/start — alias for POST /api/v1/sessions.
 *
 * Some API clients and the mobile app call /sessions/start explicitly.
 * This route delegates to the canonical handler in /api/v1/sessions/route.ts
 * so behaviour is identical regardless of which path is used.
 *
 * @module apps/web/api/v1/sessions/start
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

export { POST } from '../route'
