/**
 * @file auth.ts
 * @description TanStack Query hooks for authentication and user profile.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

/* ── Types ─────────────────────────────────────────────── */

type UserProfile = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  phoneNumber: string | null
  phoneVerified: boolean
  emailVerified: boolean
  kycStatus: 'not_started' | 'pending' | 'verified' | 'rejected'
  kycVerifiedAt: string | null
  roles: string[]
  aiMode: 'standard' | 'hybrid' | 'agentic'
  createdAt: string
}

type LoginInput = {
  email: string
  password: string
  rememberMe?: boolean
}

type RegisterInput = {
  displayName: string
  email: string
  password: string
  role: 'driver' | 'host' | 'both'
}

type AuthTokens = {
  accessToken: string
  refreshToken: string
  userId: string
  roles: string[]
}

type UpdateProfileInput = {
  displayName?: string
  avatarUrl?: string
  aiMode?: 'standard' | 'hybrid' | 'agentic'
  phoneNumber?: string
}

type KycState = {
  userId: string
  status: 'not_started' | 'pending' | 'verified' | 'rejected'
  verificationSessionId: string | null
  verifiedAt: string | null
  rejectionReason: string | null
}

/* ── Query keys ─────────────────────────────────────────── */

export const authKeys = {
  me: () => ['auth', 'me'] as const,
  kyc: () => ['auth', 'kyc'] as const,
}

/* ── Hooks ──────────────────────────────────────────────── */

/**
 * Fetches the current authenticated user's profile.
 * Returns null when unauthenticated (401 treated as not-found).
 */
export function useMe() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async () => {
      try {
        return await apiClient.get<UserProfile>('/v1/auth/me')
      } catch {
        return null
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

/** Mutation to log in with email + password. */
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiClient.post<AuthTokens & { emailVerified: boolean }>('/v1/auth/login', input),
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'accessToken' in data) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('zipgrid_access_token', (data as AuthTokens).accessToken)
        }
        void queryClient.invalidateQueries({ queryKey: authKeys.me() })
      }
    },
  })
}

/** Mutation to register a new account. */
export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiClient.post<AuthTokens>('/v1/auth/register', input),
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'accessToken' in data) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('zipgrid_access_token', (data as AuthTokens).accessToken)
        }
      }
    },
  })
}

/** Mutation to log out — clears token. */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/v1/auth/logout'),
    onSettled: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('zipgrid_access_token')
      }
      queryClient.clear()
    },
  })
}

/** Mutation to request a password reset email. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiClient.post('/v1/auth/reset-password', { email }),
  })
}

/** Mutation to confirm a password reset with token + new password. */
export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; newPassword: string }) =>
      apiClient.post('/v1/auth/reset-password/confirm', input),
  })
}

/** Mutation to update the current user's profile. */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiClient.patch<UserProfile>('/v1/auth/me', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() })
    },
  })
}

/** Fetches the current KYC verification status. */
export function useKycStatus() {
  return useQuery({
    queryKey: authKeys.kyc(),
    queryFn: () => apiClient.get<KycState>('/v1/auth/kyc/initiate'),
    staleTime: 30_000,
  })
}

/** Mutation to initiate KYC verification (returns Stripe Identity client_secret). */
export function useInitiateKyc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ verificationSessionId: string; clientSecret: string }>(
        '/v1/auth/kyc/initiate',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.kyc() })
    },
  })
}
