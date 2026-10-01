/**
 * @file OAuthButton.tsx
 * @description Google OAuth and Apple Sign-In buttons for auth pages.
 * Each button initiates its respective OAuth flow via the /api/v1/auth/oauth
 * redirect endpoint. Accessible, shows loading state, keyboard navigable.
 *
 * @module apps/web/components/auth
 * @version 0.2.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

type OAuthProvider = 'google' | 'apple'

type OAuthButtonProps = {
  action: 'sign in' | 'sign up'
  className?: string
}

/* ── Individual provider button ─────────────────────────────── */

function ProviderButton({
  provider,
  action,
  className,
}: {
  provider: OAuthProvider
  action: 'sign in' | 'sign up'
  className?: string
}) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = () => {
    setIsLoading(true)
    window.location.href = `/api/v1/auth/oauth/${provider}`
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-busy={isLoading}
      aria-label={`Continue with ${provider === 'google' ? 'Google' : 'Apple'} to ${action}`}
      className={cn(
        'flex h-11 w-full items-center justify-center gap-3 rounded-[6px] border',
        'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm font-medium',
        'text-[hsl(var(--foreground))] transition-colors',
        'hover:bg-[hsl(var(--secondary))] focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        provider === 'apple' && 'bg-black text-white border-black hover:bg-gray-900',
        className,
      )}
    >
      {isLoading ? (
        <span
          className={cn(
            'h-4 w-4 animate-spin rounded-full border-2',
            provider === 'apple'
              ? 'border-white/30 border-t-white'
              : 'border-[hsl(var(--border))] border-t-[hsl(var(--primary))]',
          )}
          aria-hidden="true"
        />
      ) : provider === 'google' ? (
        /* Google G logo — inline SVG */
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" role="img">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
        </svg>
      ) : (
        /* Apple logo — inline SVG */
        <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden="true" role="img" fill="white">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.3-150.3-107.9c-52.1-75.1-95.2-193.5-95.2-306 0-183.3 119.1-280.4 236.4-280.4 61.3 0 112.2 40.5 150 40.5 35.9 0 92.4-43.3 161.3-43.3 25.8 0 108.2 2.6 168.6 81.3zm-186.9-81.2c28.8-35.3 49.3-84.1 49.3-132.9 0-6.4-.6-12.9-1.9-18 0-.6-.1-1.2-.1-1.9-45.9 1.7-101.2 30.6-133.9 68.9-25.8 29.1-50.2 77.9-50.2 127.4 0 7 1.3 13.9 1.9 16.2 2.6.6 6.4 1.3 10.3 1.3 41.3 0 94.4-27.8 124.6-61z" />
        </svg>
      )}
      <span>Continue with {provider === 'google' ? 'Google' : 'Apple'}</span>
    </button>
  )
}

/* ── Exported composite component ───────────────────────────── */

/**
 * OAuth sign-in buttons — Google and Apple.
 * Renders a Google button and, on supported platforms, an Apple Sign-In button.
 */
export function OAuthButton({ action, className }: OAuthButtonProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ProviderButton provider="google" action={action} />
      <ProviderButton provider="apple" action={action} />
    </div>
  )
}
