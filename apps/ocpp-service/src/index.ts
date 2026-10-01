/**
 * @file index.ts
 * @description OCPP Central System — entry point.
 * Starts a single HTTP server that handles:
 *   - WebSocket upgrades on /ocpp/:chargePointId (OCPP 1.6J)
 *   - HTTP API on /ocpp/* (remote commands from apps/web)
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
import { createHttpApiHandler } from './http/HttpApi'
import { logger } from './lib/logger'

const PORT = Number(process.env['OCPP_PORT'] ?? 3001)

const connectionManager = new ConnectionManager()
const messageRouter = new MessageRouter(connectionManager)
const httpApiHandler = createHttpApiHandler(connectionManager)

// Single HTTP server — handles both WebSocket upgrades and HTTP API
const server = createServer((req, res) => {
  // Route HTTP (non-upgrade) requests to the internal API
  void httpApiHandler(req, res)
})

const wss = new WebSocketServer({ noServer: true })

// Handle WebSocket upgrade requests on /ocpp/* paths
server.on('upgrade', (req, socket, head) => {
  const url = req.url ?? ''
  if (!url.startsWith('/ocpp/')) {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws, req) => {
  // Extract chargePointId from URL: /ocpp/<chargePointId>
  const chargePointId = req.url?.split('/ocpp/').pop() ?? 'unknown'
  logger.info({ chargePointId }, 'Charger connected')
  connectionManager.register(chargePointId, ws)
  messageRouter.attach(chargePointId, ws)
})

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'OCPP Central System listening (WS + HTTP API)')
})

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully')
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
})
