/**
 * @file _layout.tsx
 * @description Auth route group layout — headerless stack for login/register.
 * @module apps/mobile/app/(auth)
 */

import { Stack } from 'expo-router'

/** Auth screens — no header, dark background. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
