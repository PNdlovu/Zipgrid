/**
 * @file OcppCommandDispatcher.test.ts
 * @description Unit tests for OcppCommandDispatcher — command send + resolve/reject.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OcppCommandDispatcher, pendingRequests } from '../src/http/OcppCommandDispatcher'
import { ConnectionManager } from '../src/connection/ConnectionManager'
import type { WebSocket } from 'ws'

function makeMockWs(sendError?: Error): WebSocket {
  return {
    on: vi.fn(),
    send: vi.fn((msg: string, cb?: (err?: Error) => void) => {
      cb?.(sendError)
    }),
  } as unknown as WebSocket
}

describe('OcppCommandDispatcher', () => {
  let manager: ConnectionManager
  let dispatcher: OcppCommandDispatcher

  beforeEach(() => {
    manager = new ConnectionManager()
    dispatcher = new OcppCommandDispatcher(manager)
    pendingRequests.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    pendingRequests.clear()
  })

  it('throws if charger is not connected', async () => {
    await expect(
      dispatcher.remoteStart('CP-OFFLINE', 1, 'ZG-test-tag'),
    ).rejects.toThrow('not connected')
  })

  it('sends RemoteStartTransaction and resolves on CallResult', async () => {
    const ws = makeMockWs()
    manager.register('CP-001', ws)

    const promise = dispatcher.remoteStart('CP-001', 1, 'ZG-test-tag')

    // ws.send was called — find the uniqueId from the message
    const sendCall = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0]
    const message = JSON.parse(sendCall[0] as string) as [number, string, string, unknown]
    const uniqueId = message[1]

    // Simulate CallResult from charger
    OcppCommandDispatcher.resolveCallResult(uniqueId, { status: 'Accepted' })

    const result = await promise
    expect(result.status).toBe('Accepted')
  })

  it('rejects on CallError', async () => {
    const ws = makeMockWs()
    manager.register('CP-001', ws)

    const promise = dispatcher.remoteStop('CP-001', 42)

    const sendCall = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0]
    const message = JSON.parse(sendCall[0] as string) as [number, string, string, unknown]
    const uniqueId = message[1]

    OcppCommandDispatcher.rejectCallError(uniqueId, 'NotSupported', 'Command not supported')

    await expect(promise).rejects.toThrow('NotSupported')
  })

  it('times out after 30 seconds', async () => {
    const ws = makeMockWs()
    manager.register('CP-001', ws)

    const promise = dispatcher.changeAvailability('CP-001', 0, 'Inoperative')

    // Advance past the 30s timeout
    vi.advanceTimersByTime(31_000)

    await expect(promise).rejects.toThrow('timed out')
  })

  it('rejects immediately if ws.send fails', async () => {
    const ws = makeMockWs(new Error('Socket broken'))
    manager.register('CP-001', ws)

    await expect(
      dispatcher.remoteStart('CP-001', 1, 'ZG-test-tag'),
    ).rejects.toThrow('Socket broken')
  })

  it('resolveCallResult is a no-op for unknown uniqueId', () => {
    expect(() => {
      OcppCommandDispatcher.resolveCallResult('nonexistent-id', { status: 'Accepted' })
    }).not.toThrow()
  })
})
