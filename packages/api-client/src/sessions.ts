/**
 * @file sessions.ts
 * @description TanStack Query hooks for charging sessions.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ChargingSession } from '@zipgrid/types'
import { apiClient } from './client'

export const sessionKeys = {
  all: ['sessions'] as const,
  driver: () => ['sessions', 'driver'] as const,
  detail: (id: string) => ['sessions', id] as const,
}

/** Fetches a live session by ID — refetches every 5s if active */
export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId ?? ''),
    queryFn: () => apiClient.get<ChargingSession>(`/v1/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const session = query.state.data as ChargingSession | undefined
      if (!session) return 5_000
      const terminal: ChargingSession['status'][] = ['completed', 'faulted']
      return terminal.includes(session.status) ? false : 5_000
    },
    staleTime: 0,
  })
}

/** Fetches all sessions for the authenticated driver */
export function useDriverSessions() {
  return useQuery({
    queryKey: sessionKeys.driver(),
    queryFn: () => apiClient.get<ChargingSession[]>('/v1/sessions'),
    staleTime: 30_000,
  })
}

/** Mutation to stop an active session */
export function useStopSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.post<{ stopped: boolean; status: string }>(`/v1/sessions/${sessionId}/stop`),
    onSuccess: (_data, sessionId) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) })
      void queryClient.invalidateQueries({ queryKey: sessionKeys.driver() })
    },
  })
}

/** Mutation to start a new session */
export function useStartSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { bookingId: string; chargePointId: string; connectorId?: number }) =>
      apiClient.post<{ sessionId: string; idTag: string; status: string }>('/v1/sessions', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    },
  })
}
