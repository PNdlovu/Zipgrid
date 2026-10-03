/**
 * @file page.tsx
 * @description /profile/kyc — Stripe Identity verification flow.
 *
 * Receives a Stripe VerificationSession client_secret via ?session=<cs_...>
 * query param, loads the Stripe.js Identity SDK, and launches the hosted
 * verification modal (ID document scan + selfie).
 *
 * Outcomes:
 *   success  → session.status === 'verified' or 'processing'  → /profile with success banner
 *   failure  → user cancelled or errored                       → /profile with error banner
 *   no token → redirect to /profile immediately
 *
 * @module apps/web/app/(driver)/profile/kyc
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { cn } from '@/lib/utils'

type StepState = 'loading' | 'ready' | 'verifying' | 'processing' | 'success' | 'cancelled' | 'error'

/* ── Inner component (uses useSearchParams — must be in Suspense) ── */
function KycPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientSecret = searchParams.get('session')

  const [step, setStep] = useState<StepState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [stripe, setStripe] = useState<Stripe | null>(null)

  // Redirect immediately if no client_secret provided
  useEffect(() => {
    if (!clientSecret) {
      router.replace('/profile')
    }
  }, [clientSecret, router])

  // Load Stripe.js Identity SDK
  useEffect(() => {
    if (!clientSecret) return

    const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
    if (!publishableKey) {
      setErrorMessage('Stripe is not configured. Please contact support.')
      setStep('error')
      return
    }

    loadStripe(publishableKey)
      .then((instance) => {
        if (!instance) throw new Error('Stripe.js unavailable')
        setStripe(instance)
        setStep('ready')
      })
      .catch(() => {
        setErrorMessage('Could not load the verification tool. Check your connection and try again.')
        setStep('error')
      })
  }, [clientSecret])

  const handleVerify = async () => {
    if (!stripe || !clientSecret) return
    setStep('verifying')

    const { error } = await stripe.verifyIdentity(clientSecret)

    if (error) {
      if (error.code === 'session_cancelled') {
        setStep('cancelled')
      } else {
        setErrorMessage(error.message ?? 'Verification could not be completed. Please try again.')
        setStep('error')
      }
      return
    }

    // No error — Stripe has accepted the submission; final status confirmed via webhook
    setStep('processing')
    setTimeout(() => {
      router.push('/profile?kyc=submitted')
    }, 2500)
  }

  if (!clientSecret) return null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] px-6">
      <div className="w-full max-w-sm">

        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className={cn(
            'flex h-16 w-16 items-center justify-center rounded-[6px] border',
            step === 'success' || step === 'processing'
              ? 'border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)]'
              : step === 'error'
                ? 'border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.08)]'
                : 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))]',
          )}>
            {step === 'error' || step === 'cancelled'
              ? <AlertTriangle className="h-7 w-7 text-[hsl(var(--destructive))]" aria-hidden="true" strokeWidth={1.5} />
              : step === 'verifying' || step === 'loading' || step === 'processing'
                ? <Loader2 className="h-7 w-7 animate-spin text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                : <ShieldCheck className="h-7 w-7 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />}
          </div>
        </div>

        {/* Content by step */}
        {step === 'loading' && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading verification tool…</p>
          </div>
        )}

        {step === 'ready' && (
          <div className="flex flex-col gap-6 text-center">
            <div>
              <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Verify your identity</h1>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                We use Stripe Identity to verify your ID. You&apos;ll need a passport or driving licence and a clear photo of your face.
                It takes about 2 minutes.
              </p>
            </div>

            <ul className="flex flex-col gap-2 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-4 py-3 text-left text-sm text-[hsl(var(--muted-foreground))]" role="list">
              {[
                'Government-issued ID (passport or driving licence)',
                'A front-facing camera for a short selfie',
                'Good lighting — no glare or shadows on your document',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleVerify}
              className={cn(
                'flex h-12 w-full items-center justify-center rounded-[6px]',
                'bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]',
                'transition-opacity hover:opacity-90',
              )}
            >
              Start verification
            </button>

            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              Do this later
            </button>
          </div>
        )}

        {step === 'verifying' && (
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
            Verification in progress…
          </p>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Submitted</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Your documents are being reviewed. This usually takes a few seconds.
              We&apos;ll notify you when your identity is confirmed.
            </p>
          </div>
        )}

        {step === 'cancelled' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Verification cancelled</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No problem — you can complete identity verification any time from your profile.
            </p>
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className={cn(
                'flex h-11 w-full items-center justify-center rounded-[6px]',
                'bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]',
                'transition-opacity hover:opacity-90',
              )}
            >
              Back to profile
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Something went wrong</h2>
            {errorMessage && (
              <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{errorMessage}</p>
            )}
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => { setStep('ready'); setErrorMessage(null) }}
                className={cn(
                  'flex h-11 w-full items-center justify-center rounded-[6px]',
                  'bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]',
                  'transition-opacity hover:opacity-90',
                )}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => router.push('/profile')}
                className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                Back to profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * KYC page — wrapped in Suspense for useSearchParams (Next.js 15 requirement).
 */
export default function KycPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
        </div>
      }
    >
      <KycPageInner />
    </Suspense>
  )
}
