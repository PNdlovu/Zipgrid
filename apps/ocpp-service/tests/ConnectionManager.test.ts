/**
 * @file ConnectionManager.test.ts
 * @description Unit tests for ConnectionManager — connection registry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectionManager } from '../src/connection/ConnectionManager'
import type { WebSocket } from 'ws'

function makeMockWs(): WebSocket {
  return {
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager

  beforeEach(() => {
    manager = new ConnectionManager()
  })

  it('starts with zero connections', () => {
    expect(manager.count).toBe(0)
    expect(manager.ids).toEqual([])
  })

  it('registers a connection', () => {
    const ws = makeMockWs()
    manager.register('CP-001', ws)
    expect(manager.count).toBe(1)
    expect(manager.get('CP-001')).toBe(ws)
    expect(manager.ids).toContain('CP-001')
  })

  it('registers multiple connections', () => {
    manager.register('CP-001', makeMockWs())
    manager.register('CP-002', makeMockWs())
    manager.register('CP-003', makeMockWs())
    expect(manager.count).toBe(3)
  })

  it('returns undefined for unknown chargePointId', () => {
    expect(manager.get('nonexistent')).toBeUndefined()
  })

  it('removes connection on ws close event', () => {
    const ws = makeMockWs()
    let closeCallback: (() => void) | undefined

    // Capture the close listener
    ;(ws.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, cb: () => void) => {
        if (event === 'close') closeCallback = cb
      },
    )

    manager.register('CP-001', ws)
    expect(manager.count).toBe(1)

    // Simulate ws close
    closeCallback?.()
    expect(manager.count).toBe(0)
    expect(manager.get('CP-001')).toBeUndefined()
  })

  it('overwrites existing registration for same chargePointId', () => {
    const ws1 = makeMockWs()
    const ws2 = makeMockWs()
    manager.register('CP-001', ws1)
    manager.register('CP-001', ws2)
    expect(manager.get('CP-001')).toBe(ws2)
    expect(manager.count).toBe(1)
  })
})
