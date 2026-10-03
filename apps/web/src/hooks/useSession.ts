/**
 * @file useSession.ts
 * @description React hook for live session state.
 * Polls the session API every 5 seconds while a session is active.
 * Stops polling when session reaches a terminal state.
 *
 * @module apps/web/hooks
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SessionStatus =
  | 'preparing'
  | 'charging'
  | 'paused'
  | 'finishing'
  | 'completed'
  | 'faulted'

export type LiveSession = {
  id: string
  bookingId: string
  chargePointId: string
  status: SessionStatus
  energyConsumedWh: number
  powerW: number | null
  socPercent: number | null
  totalCostPence: number
  pricePerKwhPence: number
  pricingModel: string
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  listingTitle: string | null
  listingCity: string | null
  hostName: string | null
}

const TERMINAL_STATES: SessionStatus[] = ['completed', 'faulted']
const POLL_INTERVAL_MS = 5_000

/** Live state of a charging session (null id = no session). */
export function useSession(sessionId: string | null) {
  const [session, setSession] = useState<LiveSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSession = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`)
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        setError(body.error?.message ?? 'Failed to load session')
        return
      }
      const data = (await res.json()) as { data: LiveSession }
      setSession(data.data)
      // Stop polling once terminal
      if (TERMINAL_STATES.includes(data.data.status)) {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    } catch {
      setError('Network error — retrying…')
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    void fetchSession().finally(() => setLoading(false))

    intervalRef.current = setInterval(() => { void fetchSession() }, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sessionId, fetchSession])

  const stopSession = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/stop`, { method: 'POST' })
      if (res.ok) {
        await fetchSession()
        return true
      }
      return false
    } catch {
      return false
    }
  }, [sessionId, fetchSession])

  return { session, loading, error, stopSession, refetch: fetchSession }
}
