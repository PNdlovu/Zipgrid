/**
 * @file HttpApi.ts
 * @description Internal HTTP API for the OCPP service.
 * Called by apps/web OcppService.ts to dispatch remote commands to chargers.
 * Runs on the same HTTP server as the WebSocket upgrade — different paths.
 *
 * All endpoints require Bearer token matching OCPP_SERVICE_SECRET.
 *
 * Endpoints:
 *   POST /ocpp/remote-start         — RemoteStartTransaction
 *   POST /ocpp/remote-stop          — RemoteStopTransaction
 *   POST /ocpp/change-availability  — ChangeAvailability
 *   POST /ocpp/set-charging-profile — SetChargingProfile
 *   POST /ocpp/clear-charging-profile — ClearChargingProfile
 *   GET  /ocpp/status/:chargePointId — connection status check
 *
 * @module apps/ocpp-service/http
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { IncomingMessage, ServerResponse } from 'http'
import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppCommandDispatcher } from './OcppCommandDispatcher'
import { logger } from '../lib/logger'

function getServiceSecret(): string {
  return process.env['OCPP_SERVICE_SECRET'] ?? 'dev-ocpp-secret'
}

function unauthorized(res: ServerResponse): void {
  res.writeHead(401, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Unauthorized' }))
}

function badRequest(res: ServerResponse, message: string): void {
  res.writeHead(400, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: message }))
}

function ok(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}

function serverError(res: ServerResponse, message: string): void {
  res.writeHead(502, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: message }))
}

/**
 * Reads and parses the request body as JSON.
 */
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
        resolve(body)
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Checks Bearer token authentication.
 */
function isAuthenticated(req: IncomingMessage): boolean {
  const auth = req.headers['authorization'] ?? ''
  return auth === `Bearer ${getServiceSecret()}`
}

/**
 * HTTP API request handler — attach to the createServer instance.
 * Only handles paths starting with /ocpp — everything else falls through to
 * the WebSocket upgrade handler.
 */
export function createHttpApiHandler(connectionManager: ConnectionManager) {
  const dispatcher = new OcppCommandDispatcher(connectionManager)

  return async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = req.url ?? ''
    const method = req.method ?? 'GET'

    // Only handle /ocpp/* paths
    if (!url.startsWith('/ocpp')) {
      notFound(res)
      return
    }

    // Authenticate all requests
    if (!isAuthenticated(req)) {
      unauthorized(res)
      return
    }

    try {
      // POST /ocpp/remote-start
      if (method === 'POST' && url === '/ocpp/remote-start') {
        const body = await readBody(req)
        const chargePointId = body['chargePointId'] as string | undefined
        const connectorId = (body['connectorId'] as number | undefined) ?? 1
        const idTag = body['idTag'] as string | undefined

        if (!chargePointId || !idTag) {
          badRequest(res, 'chargePointId and idTag are required')
          return
        }

        const result = await dispatcher.remoteStart(chargePointId, connectorId, idTag)
        ok(res, result)
        return
      }

      // POST /ocpp/remote-stop
      if (method === 'POST' && url === '/ocpp/remote-stop') {
        const body = await readBody(req)
        const chargePointId = body['chargePointId'] as string | undefined
        const transactionId = body['transactionId'] as number | undefined

        if (!chargePointId || transactionId == null) {
          badRequest(res, 'chargePointId and transactionId are required')
          return
        }

        const result = await dispatcher.remoteStop(chargePointId, transactionId)
        ok(res, result)
        return
      }

      // POST /ocpp/change-availability
      if (method === 'POST' && url === '/ocpp/change-availability') {
        const body = await readBody(req)
        const chargePointId = body['chargePointId'] as string | undefined
        const connectorId = (body['connectorId'] as number | undefined) ?? 0
        const type = body['type'] as 'Operative' | 'Inoperative' | undefined

        if (!chargePointId || !type) {
          badRequest(res, 'chargePointId and type are required')
          return
        }

        const result = await dispatcher.changeAvailability(chargePointId, connectorId, type)
        ok(res, result)
        return
      }

      // POST /ocpp/set-charging-profile
      if (method === 'POST' && url === '/ocpp/set-charging-profile') {
        const body = await readBody(req)
        const chargePointId = body['chargePointId'] as string | undefined
        const connectorId = (body['connectorId'] as number | undefined) ?? 1
        const chargingSchedule = body['chargingSchedule'] as
          | Array<{ startPeriod: number; limitAmps: number }>
          | undefined

        if (!chargePointId || !chargingSchedule) {
          badRequest(res, 'chargePointId and chargingSchedule are required')
          return
        }

        const result = await dispatcher.setChargingProfile(chargePointId, connectorId, chargingSchedule)
        ok(res, result)
        return
      }

      // POST /ocpp/clear-charging-profile
      if (method === 'POST' && url === '/ocpp/clear-charging-profile') {
        const body = await readBody(req)
        const chargePointId = body['chargePointId'] as string | undefined

        if (!chargePointId) {
          badRequest(res, 'chargePointId is required')
          return
        }

        const result = await dispatcher.clearChargingProfile(chargePointId)
        ok(res, result)
        return
      }

      // GET /ocpp/status/:chargePointId
      if (method === 'GET' && url.startsWith('/ocpp/status/')) {
        const chargePointId = decodeURIComponent(url.slice('/ocpp/status/'.length))
        if (!chargePointId) {
          badRequest(res, 'chargePointId is required')
          return
        }
        const connected = connectionManager.get(chargePointId) !== undefined
        ok(res, { chargePointId, connected, connectedCount: connectionManager.count })
        return
      }

      // GET /ocpp/health
      if (method === 'GET' && url === '/ocpp/health') {
        ok(res, { status: 'ok', connectedChargers: connectionManager.count })
        return
      }

      notFound(res)
    } catch (err) {
      logger.error({ err, url, method }, 'HTTP API error')
      serverError(res, 'Internal error')
    }
  }
}
