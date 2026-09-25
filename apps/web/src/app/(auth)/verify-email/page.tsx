/**
 * @file page.tsx
 * @description /auth/verify-email — Email OTP verification.
 * 6-digit code input with auto-advance between fields.
 * Paste support, resend cooldown, accessible.
 *
 * @module apps/web/app/(auth)/verify-email
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 60

/**
 * Email verification page with 6-digit OTP input.
 */
export default function VerifyEmailPage() {
  const router = useRouter()
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [email, setEmail] = useState<string | null>(null)
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(CODE_LENGTH).fill(null))

  useEffect(() => {
    const pending = sessionStorage.getItem('zipgrid_pending_email')
    setEmail(pending)
    inputRefs.current[0]?.focus()
  }, [])

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  // Auto-submit when all digits filled
  useEffect(() => {
    if (digits.every((d) => d !== '')) {
      void handleVerify(digits.join(''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const handleVerify = async (code: string) => {
    setError(null)
    setIsVerifying(true)
    try {
      const res = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const json = (await res.json()) as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Invalid code — please try again.')
        setDigits(Array(CODE_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
        return
      }
      sessionStorage.removeItem('zipgrid_pending_email')
      router.push('/dashboard')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleDigitChange = (index: number, value: string) => {
    // Handle paste of full code
    if (value.length === CODE_LENGTH && /^\d+$/.test(value)) {
      const next = value.split('')
      setDigits(next)
      inputRefs.current[CODE_LENGTH - 1]?.focus()
      return
    }

    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return
    setIsResending(true)
    setError(null)
    try {
      await fetch('/api/v1/auth/verify-email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
          <Mail className="h-6 w-6 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Check your email
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {email ?? 'your email address'}
            </span>
          </p>
        </div>
      </div>

      {/* OTP input */}
      <fieldset aria-label="6-digit verification code">
        <legend className="sr-only">Enter the 6-digit code from your email</legend>
        <div className="flex items-center justify-center gap-2.5">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={i === 0 ? CODE_LENGTH : 1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
              aria-invalid={error ? 'true' : 'false'}
              disabled={isVerifying}
              className={cn(
                'h-12 w-12 rounded-[6px] border text-center font-mono text-lg font-semibold',
                'text-[hsl(var(--foreground))] bg-[hsl(var(--background))] transition-colors',
                'focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2',
                'focus:ring-[hsl(var(--ring)/0.4)] disabled:opacity-50',
                error
                  ? 'border-[hsl(var(--destructive))]'
                  : digit
                    ? 'border-[hsl(var(--primary))]'
                    : 'border-[hsl(var(--border))]',
              )}
            />
          ))}
        </div>
      </fieldset>

      {/* Error */}
      {error && (
        <p role="alert" className="text-center text-sm text-[hsl(var(--destructive))]">
          {error}
        </p>
      )}

      {/* Loading indicator */}
      {isVerifying && (
        <div className="flex items-center justify-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--primary))]"
            aria-hidden="true"
          />
          Verifying…
        </div>
      )}

      {/* Manual verify button (fallback) */}
      {!isVerifying && digits.some((d) => d !== '') && !digits.every((d) => d !== '') && (
        <button
          type="button"
          onClick={() => handleVerify(digits.join(''))}
          disabled={digits.some((d) => d === '') || isVerifying}
          className={cn(
            'flex h-11 w-full items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]',
            'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity',
            'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          Verify email
        </button>
      )}

      {/* Resend */}
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Didn&apos;t receive it?</p>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || isResending}
          className={cn(
            'text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {cooldown > 0
            ? `Resend code in ${cooldown}s`
            : isResending
              ? 'Sending…'
              : 'Resend code'}
        </button>
      </div>

      <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
        Check your spam folder if you don&apos;t see it within 2 minutes.
      </p>
    </div>
  )
}
