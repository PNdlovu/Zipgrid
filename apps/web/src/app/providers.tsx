/**
 * @file providers.tsx
 * @description Root providers wrapper — ThemeProvider + TanStack QueryClient.
 * Wraps the entire application. Must be a Client Component.
 * Three themes: 'light' | 'dark' | 'night' — persisted to localStorage.
 * defaultTheme="system" respects OS dark mode preference on first visit.
 *
 * @module apps/web/app
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Root providers component — wraps ThemeProvider and QueryClientProvider.
 * @param props.children - React children to render inside providers
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      themes={['light', 'dark', 'night']}
      storageKey="zipgrid-theme"
      disableTransitionOnChange={false}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  )
}
