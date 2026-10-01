/**
 * @file api.ts
 * @description Typed API client for the Zipgrid mobile app.
 * All requests include the JWT token from SecureStore.
 * @module apps/mobile/lib
 */

import * as SecureStore from 'expo-secure-store'

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('access_token')
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ success: true; data: T } | { success: false; error: { message: string } }> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
    const json = await res.json() as { success: boolean; data?: T; error?: { message: string } }
    if (!res.ok || !json.success) {
      return { success: false, error: { message: json.error?.message ?? 'An error occurred' } }
    }
    return { success: true, data: json.data as T }
  } catch {
    return { success: false, error: { message: 'Network error — please check your connection.' } }
  }
}

export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
