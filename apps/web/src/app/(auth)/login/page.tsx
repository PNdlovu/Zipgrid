/**
 * @file page.tsx
 * @description /auth/login — Sign in page.
 * Wrapped in Suspense for useSearchParams (Next.js 15 requirement).
 *
 * @module apps/web/app/(auth)/login
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
import { AuthInput } from '@/components/auth/AuthInput'
import { OAuthButton } from '@/components/auth/OAuthButton'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { cn } from '@/lib/utils'

/* ── Validation schema ──────────────────────────────────────── */

const LoginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  rememberMe: z.boolean().optional(),
})

type LoginFormValues = z.infer<typeof LoginSchema>

/* ── Page component ─────────────────────────────────────────── */

/**
 * Sign in page — exported with Suspense wrapper for useSearchParams.
 */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)

  const redirectTo = searchParams.get('redirect') ?? '/dashboard'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { rememberMe: false },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null)
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          rememberMe: data.rememberMe ?? false,
        }),
      })

      const json = (await res.json()) as {
        success: boolean
        data?: { requiresVerification?: boolean; accessToken?: string; roles?: string[] }
        error?: { code?: string; message: string }
      }

      if (!res.ok || !json.success) {
        if (json.error?.code === 'EMAIL_NOT_VERIFIED') {
          sessionStorage.setItem('zipgrid_pending_email', data.email)
          router.push('/auth/verify-email')
          return
        }
        setServerError(
          res.status === 401
            ? 'Email or password is incorrect.'
            : (json.error?.message ?? 'Something went wrong. Please try again.'),
        )
        return
      }

      // Store the access token in a cookie so the Edge middleware can verify it.
      // The refresh token is already set as HttpOnly by the API route.
      // __zg_at is NOT HttpOnly so client JS can write it; middleware reads it.
      if (json.data?.accessToken) {
        const isSecure = window.location.protocol === 'https:'
        const age = data.rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 15 // 30 days or 15 min
        document.cookie = `__zg_at=${json.data.accessToken}; path=/; max-age=${age}; SameSite=Lax${isSecure ? '; Secure' : ''}`
      }

      router.push(redirectTo)
    } catch {
      setServerError('Network error — please check your connection and try again.')
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Welcome back
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-[hsl(var(--primary))] hover:opacity-80"
          >
            Sign up free
          </Link>
        </p>
      </div>

      {/* OAuth */}
      <OAuthButton action="sign in" />

      <AuthDivider />

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-label="Sign in form"
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

        <div className="flex flex-col gap-1.5">
          <AuthInput
            label="Password"
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="flex justify-end">
            <Link
              href="/auth/forgot-password"
              className="text-xs text-[hsl(var(--primary))] hover:opacity-80"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        {/* Remember me */}
        <label className="flex items-center gap-2.5 text-sm text-[hsl(var(--muted-foreground))]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
            {...register('rememberMe')}
          />
          <span>Remember me for 30 days</span>
        </label>

        {/* Server error */}
        {serverError && (
          <div
            role="alert"
            className="rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]"
          >
            {serverError}
          </div>
        )}

        {/* Submit */}
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
            'Sign in'
          )}
        </button>
      </form>

      {/* Security note */}
      <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
        Protected by Zipgrid security · UK GDPR compliant
      </p>
    </div>
  )
}

/** Next.js 15: useSearchParams requires Suspense boundary */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <LoginForm />
    </Suspense>
  )
}
