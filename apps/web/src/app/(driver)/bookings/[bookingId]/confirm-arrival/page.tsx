/**
 * @file page.tsx
 * @description /driver/bookings/[bookingId]/confirm-arrival
 * Non-smart charger manual session confirmation flow.
 * When a charger has no OCPP connectivity, the driver must confirm
 * arrival by entering the session PIN shown on their booking.
 * This creates the charging session and starts the idle-fee clock.
 *
 * Steps:
 *   1. Show booking details + session PIN
 *   2. Driver physically plugs in and taps "I'm plugged in"
 *   3. Driver enters the 6-digit session PIN from the listing
 *   4. Platform creates a manual charging session
 *   5. Driver uses "Stop Charging" when done; platform calculates cost
 *
 * @module apps/web/app/(driver)/bookings/[bookingId]/confirm-arrival
 * @version 0.1.0
 * @since 2026-09-29
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  PlugZap, Loader2, CheckCircle2, AlertTriangle,
  ArrowLeft, Clock, Zap, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type BookingDetails = {
  id: string
  listingTitle: string
  listingCity: string
  address: string
  chargerLevel: string
  maxPowerKw: number
  plugTypes: string[]
  accessType: string
  accessInstructions: string | null
  sessionPin: string
  scheduledStart: string
  scheduledEnd: string
  estimatedCostPence: number
  isSmartCharger: boolean
  existingSessionId: string | null
}

/* ── API ─────────────────────────────────────────────────────── */

async function fetchBooking(bookingId: string): Promise<BookingDetails> {
  const res = await fetch(`/api/v1/bookings/${bookingId}`, { credentials: 'include' })
  const json = await res.json() as { success: boolean; data?: { booking: BookingDetails }; error?: { message: string } }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Booking not found')
  return json.data!.booking
}

async function confirmArrival(bookingId: string, pin: string): Promise<{ sessionId: string }> {
  const res = await fetch(`/api/v1/sessions/manual-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ bookingId, pin }),
  })
  const json = await res.json() as {
    success: boolean
    data?: { sessionId: string }
    error?: { message: string }
  }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Could not start session')
  return { sessionId: json.data!.sessionId }
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/* ── PIN input ───────────────────────────────────────────────── */

function PinInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const digits = value.padEnd(6, ' ').split('')
  return (
    <div className="flex justify-center gap-3" role="group" aria-label="6-digit session PIN">
      {digits.map((d, i) => (
        <div
          key={i}
          className={cn(
            'flex h-14 w-11 items-center justify-center rounded-xl border-2 text-xl font-bold transition-colors',
            d.trim() ? 'border-green-500 bg-green-50 text-gray-900' : 'border-gray-200 bg-gray-50 text-gray-300',
          )}
          aria-label={`Digit ${i + 1}: ${d.trim() || 'empty'}`}
        >
          {d.trim() || '–'}
        </div>
      ))}
      {/* Hidden actual input for keyboard entry */}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={disabled}
        className="sr-only"
        aria-label="Enter 6-digit session PIN"
        autoFocus
        autoComplete="one-time-code"
      />
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

type Step = 'loading' | 'smart_charger_redirect' | 'instructions' | 'pin_entry' | 'confirming' | 'success' | 'error'

/** Page at /bookings/[bookingId]/confirm-arrival — starts a session on a non-smart charger once the driver enters the booking's session PIN. */
export default function ConfirmArrivalPage() {
  const params = useParams<{ bookingId: string }>()
  const bookingId = params.bookingId

  const [booking, setBooking]   = useState<BookingDetails | null>(null)
  const [step, setStep]         = useState<Step>('loading')
  const [pin, setPin]           = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [sessionId, setSession] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const b = await fetchBooking(bookingId)
      setBooking(b)
      // Smart chargers don't need manual confirmation
      if (b.isSmartCharger) { setStep('smart_charger_redirect'); return }
      // Already have an active session
      if (b.existingSessionId) {
        setSession(b.existingSessionId)
        setStep('success')
        return
      }
      setStep('instructions')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load booking')
      setStep('error')
    }
  }, [bookingId])

  useEffect(() => { void load() }, [load])

  const handleConfirm = async () => {
    if (pin.length !== 6) { setError('Enter the full 6-digit PIN'); return }
    setStep('confirming')
    setError(null)
    try {
      const { sessionId: sid } = await confirmArrival(bookingId, pin)
      setSession(sid)
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed')
      setStep('pin_entry')
    }
  }

  /* ── Loading ── */
  if (step === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    )
  }

  /* ── Smart charger: no manual flow needed ── */
  if (step === 'smart_charger_redirect') {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center sm:px-6">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
        <h1 className="text-xl font-bold text-gray-900">Smart charger — no PIN needed</h1>
        <p className="mt-2 text-sm text-gray-500">
          This charger is OCPP-connected. Plug in your vehicle and the session will start automatically.
        </p>
        <Link
          href={`/bookings/${bookingId}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          View booking
        </Link>
      </div>
    )
  }

  /* ── Error ── */
  if (step === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center sm:px-6">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-400" />
        <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-500">{error}</p>
        <Link href="/bookings" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to bookings
        </Link>
      </div>
    )
  }

  /* ── Success ── */
  if (step === 'success' && booking) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Zap className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Charging started!</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your manual session is now active. The cost clock is running.
          </p>
          <div className="mt-6 rounded-xl bg-white p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Session details</p>
            <p className="mt-2 text-sm text-gray-700">{booking.listingTitle}</p>
            <p className="text-xs text-gray-500">{booking.listingCity}</p>
            <p className="mt-2 text-xs text-gray-400">Estimated cost: {fmtPence(booking.estimatedCostPence)}</p>
          </div>
          <Link
            href={`/session/${sessionId}`}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            Monitor session
          </Link>
        </div>
      </div>
    )
  }

  if (!booking) return null

  /* ── Instructions step ── */
  if (step === 'instructions') {
    return (
      <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <Link href={`/bookings/${bookingId}`} className="mb-6 flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Confirm your arrival</h1>
        <p className="mt-1 text-sm text-gray-500">This charger doesn&apos;t have remote connectivity — follow the steps below.</p>

        <div className="mt-6 space-y-3">
          <Step num={1} title="Go to the charger">
            <p className="text-sm text-gray-600">{booking.address}, {booking.listingCity}</p>
          </Step>
          {booking.accessInstructions && (
            <Step num={2} title="Access instructions">
              <p className="text-sm text-gray-600">{booking.accessInstructions}</p>
            </Step>
          )}
          <Step num={booking.accessInstructions ? 3 : 2} title="Plug in your vehicle">
            <div className="flex flex-wrap gap-2">
              {booking.plugTypes.map((p) => (
                <span key={p} className="rounded-full bg-green-100 px-3 py-0.5 text-xs font-semibold text-green-700">{p}</span>
              ))}
            </div>
          </Step>
          <Step num={booking.accessInstructions ? 4 : 3} title="Start charging window">
            <p className="text-sm text-gray-600">
              <Clock className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
              {fmtTime(booking.scheduledStart)} – {fmtTime(booking.scheduledEnd)}
            </p>
          </Step>
        </div>

        {/* Session PIN display */}
        <div className="mt-6 rounded-xl border border-dashed border-green-300 bg-green-50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-600">Your session PIN</p>
          <p className="mt-2 font-mono text-4xl font-extrabold tracking-[0.3em] text-gray-900">{booking.sessionPin}</p>
          <p className="mt-1 text-xs text-gray-400">You&apos;ll enter this on the next screen to confirm you&apos;re there</p>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">Once you confirm, the session starts and your card hold will be finalised when you stop charging.</p>
        </div>

        <button
          onClick={() => setStep('pin_entry')}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700"
        >
          <PlugZap className="h-4 w-4" /> I&apos;m plugged in — enter PIN
        </button>
      </div>
    )
  }

  /* ── PIN entry step ── */
  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
      <button onClick={() => setStep('instructions')} className="mb-6 flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Enter your PIN</h1>
      <p className="mt-1 text-sm text-gray-500">Type the 6-digit session PIN shown on your booking to confirm you&apos;re at the charger.</p>

      <div className="mt-8">
        <PinInput value={pin} onChange={setPin} disabled={step === 'confirming'} />
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={() => void handleConfirm()}
        disabled={pin.length < 6 || step === 'confirming'}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {step === 'confirming'
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</>
          : <><CheckCircle2 className="h-4 w-4" /> Confirm arrival</>}
      </button>
    </div>
  )
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
        {num}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}
