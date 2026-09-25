/**
 * @file page.tsx
 * @description /auth/forgot-password — Request password reset email.
 * Submits email → server sends reset link → shows confirmation state.
 *
 * @module apps/web/app/(auth)/forgot-password
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, CheckCircle2 } from 'lucide-react'
import { AuthInput } from '@/components/auth/AuthInput'
import { cn } from '@/lib/utils'

const ForgotSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})
type ForgotFormValues = z.infer<typeof ForgotSchema>

/**
 * Forgot password page — request a reset link.
 */
export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({ resolver: zodResolver(ForgotSchema) })

  const onSubmit = async (data: ForgotFormValues) => {
    await fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email }),
    })
    // Always show success — prevents email enumeration
    setSubmittedEmail(data.email)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[6px] border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.08)]">
          <CheckCircle2 className="h-7 w-7 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Check your email</h1>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            If an account exists for{' '}
            <span className="font-medium text-[hsl(var(--foreground))]">{submittedEmail}</span>,
            we&apos;ve sent a password reset link. It expires in 30 minutes.
          </p>
        </div>
        <Link
          href="/auth/login"
          className={cn(
            'flex h-11 w-full items-center justify-center rounded-[6px] border border-[hsl(var(--border))]',
            'text-sm font-medium text-[hsl(var(--foreground))] transition-colors',
            'hover:bg-[hsl(var(--secondary))]',
          )}
        >
          Back to sign in
        </Link>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Check your spam folder if you don&apos;t see it within 5 minutes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
          <KeyRound className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Reset your password
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-label="Request password reset"
        className="flex flex-col gap-5"
      >
        <AuthInput
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="sarah@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={cn(
            'flex h-11 w-full items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]',
            'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity',
            'hover:opacity-90 focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isSubmitting ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
              aria-hidden="true"
            />
          ) : (
            'Send reset link'
          )}
        </button>
      </form>

      <Link
        href="/auth/login"
        className="text-center text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        ← Back to sign in
      </Link>
    </div>
  )
}
