/**
 * @file page.tsx
 * @description /auth/reset-password — Set a new password using a reset token.
 * Token comes from URL ?token= param (from the emailed link).
 * Validates new password, submits to API, redirects to login on success.
 *
 * @module apps/web/app/(auth)/reset-password
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { Suspense } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { AuthInput } from '@/components/auth/AuthInput'
import { cn } from '@/lib/utils'

const ResetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetFormValues = z.infer<typeof ResetSchema>

/**
 * Reset password page — set a new password via token from email link.
 */
function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({ resolver: zodResolver(ResetSchema) })

  // No token — show error state
  if (!token) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[6px] border border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.06)]">
          <AlertTriangle className="h-6 w-6 text-[hsl(var(--destructive))]" aria-hidden="true" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Invalid reset link</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            This link is missing a valid reset token. Please request a new one.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className={cn(
            'flex h-11 w-full items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]',
            'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
          )}
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[6px] border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.08)]">
          <CheckCircle2 className="h-7 w-7 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Password updated</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Your password has been changed. Sign in with your new password.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className={cn(
            'flex h-11 w-full items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]',
            'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
          )}
        >
          Sign in
        </button>
      </div>
    )
  }

  const onSubmit = async (data: ResetFormValues) => {
    setServerError(null)
    try {
      const res = await fetch('/api/v1/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      })
      const json = (await res.json()) as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setServerError(
          json.error?.message ??
            'This reset link may have expired. Please request a new one.',
        )
        return
      }
      setSuccess(true)
    } catch {
      setServerError('Network error — please try again.')
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Set a new password
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Choose a strong password you haven&apos;t used before.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-label="Set new password"
        className="flex flex-col gap-5"
      >
        <AuthInput
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          error={errors.password?.message}
          hint="At least 8 characters, one uppercase letter, one number"
          {...register('password')}
        />

        <AuthInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your new password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        {serverError && (
          <div
            role="alert"
            className="rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]"
          >
            {serverError}{' '}
            {serverError.includes('expired') && (
              <Link
                href="/forgot-password"
                className="font-medium underline hover:no-underline"
              >
                Request a new link
              </Link>
            )}
          </div>
        )}

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
            'Update password'
          )}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
