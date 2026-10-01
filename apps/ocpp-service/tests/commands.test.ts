/**
 * @file commands.test.ts
 * @description Tests for OCPP command dispatchers — Offline fallback + Accepted/Rejected flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConnectionManager } from '../src/connection/ConnectionManager'
import { pendingRequests } from '../src/http/OcppCommandDispatcher'
import { sendRemoteStart } from '../src/commands/RemoteStartTransaction'
import { sendRemoteStop } from '../src/commands/RemoteStopTransaction'
import { sendChangeAvailability } from '../src/commands/ChangeAvailability'
import { sendReset } from '../src/commands/Reset'
import type { WebSocket } from 'ws'

function makeMockWs(): WebSocket {
  return {
    on: vi.fn(),
    send: vi.fn((msg: string, cb?: (err?: Error) => void) => { cb?.() }),
  } as unknown as WebSocket
}

/** Simulate a CallResult for the most recently sent message. */
function simulateAccepted(ws: WebSocket): void {
  const { OcppCommandDispatcher } = require('../src/http/OcppCommandDispatcher')
  const call = (ws.send as ReturnType<typeof vi.fn>).mock.calls.at(-1)
  if (!call) return
  const [, uniqueId] = JSON.parse(call[0] as string) as [number, string]
  OcppCommandDispatcher.resolveCallResult(uniqueId, { status: 'Accepted' })
}

describe('sendRemoteStart', () => {
  let manager: ConnectionManager

  beforeEach(() => { manager = new ConnectionManager(); pendingRequests.clear() })
  afterEach(() => { pendingRequests.clear() })

  it('returns Offline when charger is not connected', async () => {
    const result = await sendRemoteStart(manager, { chargePointId: 'CP-OFF', idTag: 'ZG-1' })
    expect(result.status).toBe('Offline')
  })

  it('returns Accepted when charger responds', async () => {
    const ws = makeMockWs()
    manager.register('CP-001', ws)

    const promise = sendRemoteStart(manager, { chargePointId: 'CP-001', idTag: 'ZG-1' })
    simulateAccepted(ws)

    const result = await promise
    expect(result.status).toBe('Accepted')
  })
})

describe('sendRemoteStop', () => {
  let manager: ConnectionManager

  beforeEach(() => { manager = new ConnectionManager(); pendingRequests.clear() })
  afterEach(() => { pendingRequests.clear() })

  it('returns Offline when charger is not connected', async () => {
    const result = await sendRemoteStop(manager, { chargePointId: 'CP-OFF', transactionId: 1 })
    expect(result.status).toBe('Offline')
  })

  it('returns Accepted when charger responds', async () => {
    const ws = makeMockWs()
    manager.register('CP-001', ws)

    const promise = sendRemoteStop(manager, { chargePointId: 'CP-001', transactionId: 42 })
    simulateAccepted(ws)

    const result = await promise
    expect(result.status).toBe('Accepted')
  })
})

describe('sendChangeAvailability', () => {
  let manager: ConnectionManager

  beforeEach(() => { manager = new ConnectionManager(); pendingRequests.clear() })
  afterEach(() => { pendingRequests.clear() })

  it('returns Offline for disconnected charger', async () => {
    const result = await sendChangeAvailability(manager, {
      chargePointId: 'CP-OFF', connectorId: 0, available: false,
    })
    expect(result.status).toBe('Offline')
  })
})

describe('sendReset', () => {
  let manager: ConnectionManager

  beforeEach(() => { manager = new ConnectionManager(); pendingRequests.clear() })
  afterEach(() => { pendingRequests.clear() })

  it('returns Offline for disconnected charger', async () => {
    const result = await sendReset(manager, { chargePointId: 'CP-OFF', type: 'Soft' })
    expect(result.status).toBe('Offline')
  })

  it('defaults to Soft reset', async () => {
    const ws = makeMockWs()
    manager.register('CP-001', ws)

    const promise = sendReset(manager, { chargePointId: 'CP-001' })
    simulateAccepted(ws)
    await promise

    const call = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0]
    const [, , action, payload] = JSON.parse(call[0] as string) as [number, string, string, { type: string }]
    expect(action).toBe('Reset')
    expect(payload.type).toBe('Soft')
  })
})
