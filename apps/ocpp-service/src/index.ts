/**
 * @file index.ts
 * @description OCPP Central System — entry point.
 * A single HTTP server handles:
 *   - WebSocket upgrades on /ocpp/1.6/:chargePointId (OCPP 1.6J, Basic auth)
 *   - Internal HTTP API on /ocpp/* (remote commands from apps/web, Bearer auth)
 *   - GET /health (unauthenticated liveness probe)
 *
 * Runs as a long-lived process (Railway); never on serverless.
 *
 * @module apps/ocpp-service
 */

import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { ConnectionManager } from './connection/ConnectionManager'
import { authenticateCharger } from './connection/authenticateCharger'
import { MessageRouter } from './handlers/MessageRouter'
import { createHttpApiHandler } from './http/HttpApi'
import { assertConfig, config } from './lib/config'
import { logger } from './lib/logger'

assertConfig()

const connectionManager = new ConnectionManager()
const messageRouter = new MessageRouter(connectionManager)
const httpApiHandler = createHttpApiHandler(connectionManager)

const server = createServer((req, res) => {
  void httpApiHandler(req, res)
})

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 256 * 1024,
  // Negotiate the OCPP 1.6J subprotocol when the charger offers it.
  handleProtocols: (protocols) => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
})

server.on('upgrade', (req, socket, head) => {
  authenticateCharger(req)
    .then((chargePointId) => {
      if (!chargePointId) {
        logger.warn({ url: req.url, ip: req.socket.remoteAddress }, 'Rejected charger connection')
        socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="ocpp"\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        connectionManager.register(chargePointId, ws)
        messageRouter.attach(chargePointId, ws)
      })
    })
    .catch((err: unknown) => {
      logger.error({ err }, 'Charger authentication error')
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
      socket.destroy()
    })
})

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'OCPP Central System listening (WS + HTTP API)')
})

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down')
  for (const client of wss.clients) client.close(1001, 'Server restarting')
  void connectionManager.shutdown()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
