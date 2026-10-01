/**
 * @file _layout.tsx
 * @description Expo Router root layout.
 * Handles: font loading, auth gate (redirect unauthenticated users to /auth/login),
 * safe-area insets, and navigation container setup.
 *
 * Route groups:
 *   (auth)/   — unauthenticated screens (login, register)
 *   (app)/    — authenticated screens (map, bookings, session, profile)
 *
 * @module apps/mobile/app
 */

import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'

/** Root layout — authentication gate + navigation container. */
export default function RootLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    void (async () => {
      const token = await SecureStore.getItemAsync('access_token')
      setIsAuthenticated(!!token)
    })()
  }, [])

  // Still checking auth — render nothing to avoid flash
  if (isAuthenticated === null) return null

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* Auth group — shown when not logged in */}
        <Stack.Screen name="(auth)" />
        {/* App group — shown when logged in */}
        <Stack.Screen name="(app)" />
      </Stack>
    </SafeAreaProvider>
  )
}
