/**
 * @file page.tsx
 * @description /listings/[listingId]/book — Booking creation flow.
 * Authenticated drivers select a vehicle, choose a time slot,
 * pay with a saved card or their wallet, and submit to POST /api/v1/bookings.
 * Wallet bookings reserve the estimated cost from the available balance.
 *
 * Unauthenticated users are redirected to /auth/register?redirect=...
 * (handled by middleware — this page always receives a valid x-user-id).
 *
 * @module apps/web/app/(marketing)/listings/[listingId]/book
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Car, CreditCard, CalendarDays, Clock, Zap, PoundSterling, CheckCircle, AlertTriangle, Loader2, Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ─────────────────────────────────────────────────── */

type ListingSummary = {
  id: string
  title: string
  city: string
  chargerLevel: string
  maxPowerKw: number
  pricingModel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  idleFeePerMinPence: number
  instantBookEnabled: boolean
  minBookingHours: number
  maxBookingHours: number
}

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  plugTypes: string[]
  batteryCapacityKwh: number | null
  isPrimary: boolean
}

type PaymentMethod = {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

/* ── Helpers ─────────────────────────────────────────────────── */

function formatPrice(listing: ListingSummary): string {
  switch (listing.pricingModel) {
    case 'per_kwh':    return listing.pricePerKwhPence    ? `${listing.pricePerKwhPence}p/kWh` : '—'
    case 'per_hour':   return listing.pricePerHourPence   ? `£${(listing.pricePerHourPence / 100).toFixed(2)}/hr` : '—'
    case 'per_session':return listing.pricePerSessionPence? `£${(listing.pricePerSessionPence / 100).toFixed(2)} flat` : '—'
    default:           return '—'
  }
}

function estimateCost(listing: ListingSummary, durationHours: number, batteryKwh: number | null): number {
  const maxPower = 7.4 // conservative default kW
  switch (listing.pricingModel) {
    case 'per_kwh': {
      const kwh = Math.min(maxPower * durationHours, batteryKwh ?? 999)
      return Math.round(kwh * (listing.pricePerKwhPence ?? 35))
    }
    case 'per_hour':    return Math.round(durationHours * (listing.pricePerHourPence ?? 200))
    case 'per_session': return listing.pricePerSessionPence ?? 500
    default:            return 500
  }
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const BRAND_ICONS: Record<string, string> = {
  visa: '💳', mastercard: '💳', amex: '💳',
}

/* ── Page ─────────────────────────────────────────────────── */

/** Page at /listings/[listingId]/book — Booking creation flow. ?start=&end= (ISO) preset the slot, e.g. from the trip planner. */
export default function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const { listingId } = use(params)
  const preset = use(searchParams)
  const router = useRouter()

  // Data
  const [listing,        setListing]        = useState<ListingSummary | null>(null)
  const [vehicles,       setVehicles]       = useState<Vehicle[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [walletAvailablePence, setWalletAvailablePence] = useState<number | null>(null)
  const [loadingData,    setLoadingData]    = useState(true)
  const [dataError,      setDataError]      = useState<string | null>(null)

  // Form state
  const [vehicleId,       setVehicleId]       = useState<string>('')
  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [payWithWallet,   setPayWithWallet]   = useState(false)

  // Default start = the preset slot, else tomorrow 09:00 for 2h
  const presetStart = preset.start ? new Date(preset.start) : null
  const presetEnd = preset.end ? new Date(preset.end) : null
  const validPreset = presetStart && presetEnd && !isNaN(presetStart.getTime()) && presetEnd > presetStart
  const defaultStart = validPreset ? presetStart : new Date()
  if (!validPreset) {
    defaultStart.setDate(defaultStart.getDate() + 1)
    defaultStart.setHours(9, 0, 0, 0)
  }
  const defaultEnd = validPreset ? presetEnd : new Date(defaultStart.getTime() + 2 * 3_600_000)

  const [scheduledStart, setScheduledStart] = useState(toLocalDatetimeValue(defaultStart))
  const [scheduledEnd,   setScheduledEnd]   = useState(toLocalDatetimeValue(defaultEnd))

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Load data ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadingData(true)
    setDataError(null)
    try {
      const [listingRes, vehiclesRes, paymentRes, walletRes] = await Promise.all([
        fetch(`/api/v1/listings/${listingId}`),
        fetch('/api/v1/vehicles'),
        fetch('/api/v1/payments/methods'),
        fetch('/api/v1/wallet'),
      ])

      if (!listingRes.ok) { setDataError('Listing not found'); return }
      const listingData = (await listingRes.json()) as { data: ListingSummary }
      setListing(listingData.data)

      if (vehiclesRes.ok) {
        const v = (await vehiclesRes.json()) as { data: Vehicle[] }
        setVehicles(v.data ?? [])
        const primary = v.data?.find((x) => x.isPrimary)
        if (primary) setVehicleId(primary.id)
      }

      if (paymentRes.ok) {
        const pm = (await paymentRes.json()) as { data: PaymentMethod[] }
        setPaymentMethods(pm.data ?? [])
        const def = pm.data?.find((x) => x.isDefault)
        if (def) setPaymentMethodId(def.id)
      }

      if (walletRes.ok) {
        const w = (await walletRes.json()) as { data?: { balance: { availablePence: number } } }
        setWalletAvailablePence(w.data?.balance.availablePence ?? null)
      }
    } catch {
      setDataError('Failed to load booking data. Please try again.')
    } finally {
      setLoadingData(false)
    }
  }, [listingId])

  useEffect(() => { void loadData() }, [loadData])

  // ── Derived values ─────────────────────────────────────────
  const startDate   = new Date(scheduledStart)
  const endDate     = new Date(scheduledEnd)
  const durationMs  = endDate.getTime() - startDate.getTime()
  const durationH   = durationMs / 3_600_000
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null
  const estimatedCostPence = listing ? estimateCost(listing, durationH, selectedVehicle?.batteryCapacityKwh ?? null) : 0

  const minH = listing?.minBookingHours ?? 0.5
  const maxH = listing?.maxBookingHours ?? 24
  const durationValid = durationH >= minH && durationH <= maxH && startDate > new Date()
  const walletCovers = walletAvailablePence !== null && walletAvailablePence >= estimatedCostPence
  const paymentChosen = payWithWallet ? walletCovers : Boolean(paymentMethodId)

  // ── Submit ─────────────────────────────────────────────────
  async function handleBook() {
    if (!vehicleId || !paymentChosen || !durationValid) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/v1/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          vehicleId,
          scheduledStart: startDate.toISOString(),
          scheduledEnd:   endDate.toISOString(),
          ...(payWithWallet ? { payWithWallet: true } : { paymentMethodId }),
        }),
      })
      const json = (await res.json()) as { success: boolean; data?: { id: string }; error?: { message: string } }
      if (!res.ok || !json.success) {
        setSubmitError(json.error?.message ?? 'Booking failed. Please try again.')
        return
      }
      router.push(`/bookings/${json.data!.id}`)
    } catch {
      setSubmitError('Network error — please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading / error states ─────────────────────────────────
  if (loadingData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
      </div>
    )
  }

  if (dataError || !listing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{dataError ?? 'Listing not available.'}</p>
        <Link href={`/listings/${listingId}`} className="text-sm font-medium text-[hsl(var(--primary))]">
          ← Back to listing
        </Link>
      </div>
    )
  }

  const canBook = vehicleId && paymentChosen && durationValid && !submitting

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Back link */}
      <Link
        href={`/listings/${listingId}`}
        className="mb-6 flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {listing.title}
      </Link>

      <h1 className="mb-2 text-2xl font-bold tracking-tight">Book this charger</h1>
      <p className="mb-8 text-sm text-[hsl(var(--muted-foreground))]">
        {listing.city} · {listing.maxPowerKw}kW · {formatPrice(listing)}
      </p>

      <div className="space-y-6">

        {/* ── Step 1: Dates ────────────────────────────────── */}
        <section className="rounded-[6px] border border-[hsl(var(--border))] p-5" aria-labelledby="dates-heading">
          <h2 id="dates-heading" className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            Choose your time slot
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="start" className="mb-1.5 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Start time
              </label>
              <input
                id="start"
                type="datetime-local"
                value={scheduledStart}
                min={toLocalDatetimeValue(new Date())}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="h-11 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="end" className="mb-1.5 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                End time
              </label>
              <input
                id="end"
                type="datetime-local"
                value={scheduledEnd}
                min={scheduledStart}
                onChange={(e) => setScheduledEnd(e.target.value)}
                className="h-11 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
              />
            </div>
          </div>
          {durationH > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {Math.floor(durationH)}h {Math.round((durationH % 1) * 60)}m
              </span>
              {!durationValid && (
                <span className="text-[hsl(var(--destructive))]">
                  Duration must be between {minH}h and {maxH}h, starting in the future.
                </span>
              )}
            </div>
          )}
        </section>

        {/* ── Step 2: Vehicle ──────────────────────────────── */}
        <section className="rounded-[6px] border border-[hsl(var(--border))] p-5" aria-labelledby="vehicle-heading">
          <h2 id="vehicle-heading" className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Car className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            Select your vehicle
          </h2>
          {vehicles.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No vehicles on your account.</p>
              <Link href="/vehicles" className="mt-2 inline-block text-sm font-medium text-[hsl(var(--primary))]">
                Add a vehicle →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v) => (
                <label
                  key={v.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-[6px] border p-3 transition-colors',
                    vehicleId === v.id
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_5%)]'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)_/_40%)]',
                  )}
                >
                  <input
                    type="radio"
                    name="vehicle"
                    value={v.id}
                    checked={vehicleId === v.id}
                    onChange={() => setVehicleId(v.id)}
                    className="accent-[hsl(var(--primary))]"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {v.plugTypes.join(', ')}
                      {v.batteryCapacityKwh && ` · ${v.batteryCapacityKwh} kWh`}
                    </p>
                  </div>
                  {v.isPrimary && (
                    <span className="ml-auto shrink-0 rounded-full bg-[hsl(var(--primary)_/_10%)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                      Default
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </section>

        {/* ── Step 3: Payment method ───────────────────────── */}
        <section className="rounded-[6px] border border-[hsl(var(--border))] p-5" aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            Payment method
          </h2>
          {walletAvailablePence !== null && (
            <label
              className={cn(
                'mb-2 flex cursor-pointer items-center gap-3 rounded-[6px] border p-3 transition-colors',
                payWithWallet
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_5%)]'
                  : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)_/_40%)]',
              )}
            >
              <input
                type="radio"
                name="payment"
                value="wallet"
                checked={payWithWallet}
                onChange={() => setPayWithWallet(true)}
                className="accent-[hsl(var(--primary))]"
              />
              <Wallet className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Zipgrid wallet</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  £{(walletAvailablePence / 100).toFixed(2)} available
                  {payWithWallet && durationValid && !walletCovers && (
                    <> · not enough for this booking — <Link href="/wallet" className="font-medium text-[hsl(var(--primary))]">top up</Link></>
                  )}
                </p>
              </div>
            </label>
          )}
          {paymentMethods.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No saved payment methods.</p>
              <Link href="/settings?tab=payments" className="mt-2 inline-block text-sm font-medium text-[hsl(var(--primary))]">
                Add a payment method →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {paymentMethods.map((pm) => (
                <label
                  key={pm.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-[6px] border p-3 transition-colors',
                    !payWithWallet && paymentMethodId === pm.id
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_5%)]'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)_/_40%)]',
                  )}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={pm.id}
                    checked={!payWithWallet && paymentMethodId === pm.id}
                    onChange={() => { setPayWithWallet(false); setPaymentMethodId(pm.id) }}
                    className="accent-[hsl(var(--primary))]"
                  />
                  <span className="text-base" aria-hidden="true">{BRAND_ICONS[pm.brand] ?? '💳'}</span>
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {pm.brand} ···· {pm.last4}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Expires {pm.expMonth}/{String(pm.expYear).slice(-2)}
                    </p>
                  </div>
                  {pm.isDefault && (
                    <span className="ml-auto shrink-0 rounded-full bg-[hsl(var(--primary)_/_10%)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                      Default
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </section>

        {/* ── Cost summary ─────────────────────────────────── */}
        {durationValid && (
          <div className="rounded-[6px] bg-[hsl(var(--muted)_/_50%)] border border-[hsl(var(--border))] p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <PoundSterling className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Estimated cost
            </h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Pricing</span>
                <span>{formatPrice(listing)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Duration</span>
                <span>{Math.floor(durationH)}h {Math.round((durationH % 1) * 60)}m</span>
              </div>
              <div className="flex justify-between border-t border-[hsl(var(--border))] pt-1.5 font-semibold">
                <span>Estimate</span>
                <span className="text-[hsl(var(--primary))]">
                  £{(estimatedCostPence / 100).toFixed(2)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              A hold is placed on your card. Final charge based on actual energy used.
              {listing.idleFeePerMinPence > 0 && ` Idle fee: ${listing.idleFeePerMinPence}p/min after 10-min grace.`}
            </p>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────── */}
        {submitError && (
          <div role="alert" className="flex items-start gap-2 rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {submitError}
          </div>
        )}

        {/* ── Confirm button ────────────────────────────────── */}
        <button
          onClick={() => { void handleBook() }}
          disabled={!canBook}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-[6px] py-3 text-sm font-semibold transition-opacity',
            canBook
              ? 'bg-[hsl(var(--primary))] text-white hover:opacity-90'
              : 'cursor-not-allowed bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
          )}
          aria-disabled={!canBook}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Processing…</>
          ) : listing.instantBookEnabled ? (
            <><Zap className="h-4 w-4" aria-hidden="true" /> Confirm instant booking</>
          ) : (
            <><CheckCircle className="h-4 w-4" aria-hidden="true" /> Request booking</>
          )}
        </button>

        {listing.instantBookEnabled ? (
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
            No approval wait — your booking is confirmed immediately.
          </p>
        ) : (
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
            The host has up to 24 hours to confirm your request.
          </p>
        )}

        {/* Terms note */}
        <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
          By booking you agree to Zipgrid&apos;s{' '}
          <Link href="/legal/terms" className="underline hover:text-[hsl(var(--foreground))]">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/legal/privacy" className="underline hover:text-[hsl(var(--foreground))]">Privacy Policy</Link>.
          Free cancellation up to 24 hours before start.
        </p>
      </div>
    </div>
  )
}
