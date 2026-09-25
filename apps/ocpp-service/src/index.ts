/**
 * @file index.ts
 * @description OCPP Central System — entry point.
 * Starts the WebSocket server on the configured port and initialises
 * the connection manager, message router, and event publisher.
 *
 * Deployed as a persistent Node.js process on Railway eu-west.
 * Never use Vercel Serverless for this — WebSocket connections are long-lived.
 *
 * @module apps/ocpp-service
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { ConnectionManager } from './connection/ConnectionManager'
import { MessageRouter } from './handlers/MessageRouter'
import { logger } from './lib/logger'

const PORT = Number(process.env['OCPP_PORT'] ?? 3001)

const server = createServer()
const wss = new WebSocketServer({ server, path: '/ocpp' })

const connectionManager = new ConnectionManager()
const messageRouter = new MessageRouter(connectionManager)

wss.on('connection', (ws, req) => {
  const chargePointId = req.url?.split('/').pop() ?? 'unknown'
  logger.info({ chargePointId }, 'Charger connected')
  connectionManager.register(chargePointId, ws)
  messageRouter.attach(chargePointId, ws)
})

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'OCPP Central System listening')
})
