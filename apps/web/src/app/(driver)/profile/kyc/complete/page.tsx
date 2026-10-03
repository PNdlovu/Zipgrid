/**
 * @file page.tsx
 * @description /driver/profile/kyc/complete
 * Return URL after Stripe Identity verification flow.
 * Reads the verification_session_id from query params,
 * polls KYC status, and shows the result to the user.
 *
 * @module apps/web/app/(driver)/profile/kyc/complete
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'

type KycStatus = 'not_started' | 'pending' | 'verified' | 'rejected'

async function fetchKycStatus(): Promise<KycStatus> {
  const res = await fetch('/api/v1/auth/kyc', { credentials: 'include' })
  const json = await res.json() as { data?: { kyc: { status: KycStatus } } }
  return json.data?.kyc.status ?? 'pending'
}

/** Poll every 3 s for up to 2 minutes. */
const MAX_POLLS = 40

/** Page at /profile/kyc/complete — Stripe Identity return URL; polls KYC status and shows the result. */
export default function KycCompletePage() {
  const [status, setStatus] = useState<KycStatus | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    let id: ReturnType<typeof setInterval>
    let polls = 0

    const check = async () => {
      const s = await fetchKycStatus()
      setStatus(s)
      polls++
      if (s === 'verified' || s === 'rejected') {
        clearInterval(id)
      } else if (polls >= MAX_POLLS) {
        clearInterval(id)
        setTimedOut(true)
      }
    }

    void check()
    id = setInterval(() => void check(), 3000)
    return () => clearInterval(id)
  }, [])

  if (timedOut && (!status || status === 'pending')) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Still reviewing your documents</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          Some checks take longer. You can close this page — we&apos;ll notify you as soon as your verification is complete.
        </p>
        <a href="/profile" className="mt-6 text-sm font-semibold text-green-600 hover:underline">Back to profile</a>
      </div>
    )
  }

  if (!status || status === 'pending') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-600" />
        <h1 className="text-xl font-bold text-gray-900">Verifying your identity…</h1>
        <p className="mt-2 text-sm text-gray-500">
          This usually takes 30–60 seconds. Please don&apos;t close this tab.
        </p>
      </div>
    )
  }

  if (status === 'verified') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">Identity verified!</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your Zipgrid account is now fully verified. You can list your charger and receive payouts.
        </p>
        <Link
          href="/host/listings/new"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          List my charger →
        </Link>
      </div>
    )
  }

  if (status === 'not_started') {
    // Redirected back too quickly — hasn't processed yet
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <Clock className="mb-4 h-10 w-10 text-amber-500" />
        <h1 className="text-xl font-bold text-gray-900">Processing…</h1>
        <p className="mt-2 text-sm text-gray-500">Stripe is processing your submission. Checking again shortly.</p>
      </div>
    )
  }

  // Rejected
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="h-9 w-9 text-red-500" />
      </div>
      <h1 className="text-2xl font-extrabold text-gray-900">Verification unsuccessful</h1>
      <p className="mt-2 text-sm text-gray-500">
        We couldn&apos;t verify your identity. This can happen if the document image was unclear or didn&apos;t match.
        You can try again — make sure your ID is well-lit and not blurry.
      </p>
      <Link
        href="/profile/kyc"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
      >
        Try again
      </Link>
      <Link href="/help" className="mt-3 text-sm text-gray-400 hover:underline">
        Contact support
      </Link>
    </div>
  )
}
