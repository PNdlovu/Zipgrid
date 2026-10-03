/**
 * @file page.tsx
 * @description /auth/register — New account registration page.
 * Collects: name, email, password, role (driver / host / both).
 * Google OAuth available. Zod validation via react-hook-form.
 * On success → redirects to /auth/verify-email.
 *
 * @module apps/web/app/(auth)/register
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
import { User, Home, Building2 } from 'lucide-react'
import { AuthInput } from '@/components/auth/AuthInput'
import { OAuthButton } from '@/components/auth/OAuthButton'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { cn } from '@/lib/utils'

/* ── Validation schema ──────────────────────────────────────── */

const RegisterSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(60, 'Name must be under 60 characters'),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['driver', 'host', 'both'], {
    required_error: 'Select how you plan to use Zipgrid',
  }),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms to continue' }),
  }),
})

type RegisterFormValues = z.infer<typeof RegisterSchema>

/* ── Role options ───────────────────────────────────────────── */

const ROLE_OPTIONS = [
  {
    value: 'driver' as const,
    icon: User,
    label: 'I want to find charging',
    sub: 'Book home chargers near me',
  },
  {
    value: 'host' as const,
    icon: Home,
    label: 'I want to earn from my charger',
    sub: 'List my home or business charger',
  },
  {
    value: 'both' as const,
    icon: Building2,
    label: 'Both',
    sub: 'Find charging and earn from mine',
  },
]

/* ── Page component ─────────────────────────────────────────── */

/**
 * Registration page — creates a new Zipgrid account.
 */
function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)

  // Pre-select role from URL param e.g. /auth/register?role=host
  const defaultRole = (searchParams.get('role') ?? 'driver') as RegisterFormValues['role']

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { role: defaultRole },
  })

  const selectedRole = watch('role')

  const onSubmit = async (data: RegisterFormValues) => {
    setServerError(null)
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: data.displayName,
          email: data.email,
          password: data.password,
          role: data.role,
          acceptTerms: data.acceptTerms,
        }),
      })

      const json = (await res.json()) as {
        success: boolean
        data?: { requiresVerification?: boolean }
        error?: { message: string }
      }

      if (!res.ok || !json.success) {
        setServerError(json.error?.message ?? 'Something went wrong. Please try again.')
        return
      }

      // The account is signed in (HttpOnly cookies). Verify email first when
      // the platform requires it; otherwise go straight in.
      sessionStorage.setItem('zipgrid_pending_email', data.email)
      if (json.data?.requiresVerification) {
        router.push('/verify-email')
      } else {
        window.location.assign('/dashboard')
      }
    } catch {
      setServerError('Network error — please check your connection and try again.')
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Create your account
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-[hsl(var(--primary))] hover:opacity-80"
          >
            Sign in
          </Link>
        </p>
      </div>

      {/* OAuth */}
      <OAuthButton action="sign up" />

      <AuthDivider />

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-label="Create account form"
        className="flex flex-col gap-5"
      >
        {/* Role selection */}
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">
            How will you use Zipgrid?
          </legend>
          <div className="flex flex-col gap-2">
            {ROLE_OPTIONS.map(({ value, icon: Icon, label, sub }) => {
              const isSelected = selectedRole === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setValue('role', value, { shouldValidate: true })}
                  className={cn(
                    'flex items-center gap-4 rounded-[6px] border p-4 text-left transition-colors',
                    isSelected
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.4)]',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px]',
                      isSelected
                        ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>
                  </div>
                  <div
                    className={cn(
                      'ml-auto h-4 w-4 shrink-0 rounded-full border-2',
                      isSelected
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]'
                        : 'border-[hsl(var(--border))]',
                    )}
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </div>
          {errors.role && (
            <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">
              {errors.role.message}
            </p>
          )}
        </fieldset>

        {/* Name */}
        <AuthInput
          label="Full name"
          type="text"
          autoComplete="name"
          placeholder="Sarah Chen"
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        {/* Email */}
        <AuthInput
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="sarah@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        {/* Password */}
        <AuthInput
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          error={errors.password?.message}
          hint="At least 8 characters, one uppercase letter, one number"
          {...register('password')}
        />

        {/* Terms */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm text-[hsl(var(--muted-foreground))]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
              aria-invalid={errors.acceptTerms ? 'true' : 'false'}
              {...register('acceptTerms')}
            />
            <span>
              I agree to the{' '}
              <Link
                href="/legal/terms"
                className="font-medium text-[hsl(var(--foreground))] underline hover:no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/legal/privacy"
                className="font-medium text-[hsl(var(--foreground))] underline hover:no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </Link>
              {selectedRole !== 'host' && (
                <>
                  , and the{' '}
                  <Link
                    href="/legal/driver-terms"
                    className="font-medium text-[hsl(var(--foreground))] underline hover:no-underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Driver Responsibilities
                  </Link>
                </>
              )}
              {selectedRole !== 'driver' && (
                <>
                  {selectedRole === 'both' ? ' and ' : ', and the '}
                  <Link
                    href="/legal/host-terms"
                    className="font-medium text-[hsl(var(--foreground))] underline hover:no-underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Host Terms
                  </Link>
                </>
              )}
            </span>
          </label>
          {errors.acceptTerms && (
            <p role="alert" className="text-xs text-[hsl(var(--destructive))]">
              {errors.acceptTerms.message}
            </p>
          )}
        </div>

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
            'Create account'
          )}
        </button>
      </form>
    </div>
  )
}

/** Page at /register — New account registration page. */
export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <RegisterForm />
    </Suspense>
  )
}
