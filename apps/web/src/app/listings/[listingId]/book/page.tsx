/**
 * @file page.tsx
 * @description /listings/[listingId]/book — Multi-step booking flow.
 * Steps: 1 Date & time → 2 Vehicle → 3 Payment → 4 Confirmation
 *
 * This page is reachable from the listing detail page's "Book" CTA.
 * Middleware guards auth: unauthenticated users are redirected to
 * /login?redirect=/listings/[id]/book.
 *
 * @module apps/web/app/listings/[listingId]/book
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, Car, CreditCard, CheckCircle2,
  ArrowLeft, ArrowRight, Loader2, MapPin, Zap,
  Clock, PoundSterling, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type Listing = {
  id: string
  title: string
  city: string
  chargerLevel: string
  maxPowerKw: number
  pricingModel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
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

type SavedCard = {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

type DayAvailability = {
  date: string
  isScheduledOpen: boolean
  openTime: string | null
  closeTime: string | null
  isBlackedOut: boolean
  bookedSlots: Array<{ start: string; end: string }>
}

type BookingResult = {
  id: string
  status: string
  driverArrivalCode: string | null
  sessionPin: string | null
  instantBook: boolean
  scheduledStart: Date
  scheduledEnd: Date
  estimatedCostPence: number
  listingTitle: string | null
  listingCity: string | null
}

/* ── Constants ──────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: 'Date & Time', icon: CalendarDays },
  { id: 2, label: 'Vehicle', icon: Car },
  { id: 3, label: 'Payment', icon: CreditCard },
  { id: 4, label: 'Confirmed', icon: CheckCircle2 },
] as const

const LEVEL_LABELS: Record<string, string> = {
  level_1: 'Level 1 (1.4kW)',
  level_2: 'Level 2 (7–22kW)',
  dc_fast: 'DC Fast (50–150kW)',
  dc_ultra_fast: 'DC Ultra Fast (150kW+)',
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function calcEstimatedCost(
  listing: Listing,
  startIso: string,
  endIso: string,
  batteryKwh: number | null,
): number {
  const durationHours =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000
  const kwh = Math.min(listing.maxPowerKw * durationHours, batteryKwh ?? 999)
  switch (listing.pricingModel) {
    case 'per_kwh':
      return Math.max(50, Math.round(kwh * (listing.pricePerKwhPence ?? 35)))
    case 'per_hour':
      return Math.max(50, Math.round(durationHours * (listing.pricePerHourPence ?? 200)))
    case 'per_session':
      return listing.pricePerSessionPence ?? 500
    case 'hybrid':
      return Math.max(
        50,
        (listing.pricePerSessionPence ?? 0) +
          Math.round(kwh * (listing.pricePerKwhPence ?? 35)),
      )
    default:
      return 500
  }
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString()
}

function toLocalDatetimeValue(iso: string): string {
  // Convert ISO to the value expected by <input type="datetime-local">
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalDatetimeValue(val: string): string {
  return new Date(val).toISOString()
}

function brandIcon(brand: string): string {
  const icons: Record<string, string> = { visa: '💳', mastercard: '💳', amex: '💳' }
  return icons[brand] ?? '💳'
}

/* ── Step components ─────────────────────────────────────────── */

function StepDatetime({
  listing,
  availability,
  startIso,
  endIso,
  onStartChange,
  onEndChange,
  error,
}: {
  listing: Listing
  availability: DayAvailability[]
  startIso: string
  endIso: string
  onStartChange: (iso: string) => void
  onEndChange: (iso: string) => void
  error: string | null
}) {
  const durationHours = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000

  // Build a set of blackout / fully-booked dates for the date input min/max
  const today = new Date().toISOString().slice(0, 10)
  const maxDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Choose your slot
        </h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Min {listing.minBookingHours}h · Max {listing.maxBookingHours}h
        </p>
      </div>

      {/* Start time */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="start-time"
          className="text-sm font-medium text-[hsl(var(--foreground))]"
        >
          Start
        </label>
        <input
          id="start-time"
          type="datetime-local"
          min={`${today}T00:00`}
          max={`${maxDate}T23:30`}
          value={toLocalDatetimeValue(startIso)}
          onChange={(e) => {
            const newStart = fromLocalDatetimeValue(e.target.value)
            onStartChange(newStart)
            // Auto-advance end by minimum duration
            const newEnd = addHours(newStart, Math.max(listing.minBookingHours, durationHours))
            onEndChange(newEnd)
          }}
          className={cn(
            'w-full rounded-[6px] border bg-[hsl(var(--background))] px-3 py-2.5',
            'text-sm text-[hsl(var(--foreground))]',
            'border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]',
          )}
        />
      </div>

      {/* End time */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="end-time"
          className="text-sm font-medium text-[hsl(var(--foreground))]"
        >
          End
        </label>
        <input
          id="end-time"
          type="datetime-local"
          min={toLocalDatetimeValue(addHours(startIso, listing.minBookingHours))}
          max={toLocalDatetimeValue(addHours(startIso, listing.maxBookingHours))}
          value={toLocalDatetimeValue(endIso)}
          onChange={(e) => onEndChange(fromLocalDatetimeValue(e.target.value))}
          className={cn(
            'w-full rounded-[6px] border bg-[hsl(var(--background))] px-3 py-2.5',
            'text-sm text-[hsl(var(--foreground))]',
            'border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]',
          )}
        />
      </div>

      {/* Duration summary */}
      <div className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
        <Clock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <span className="text-sm text-[hsl(var(--foreground))]">
          Duration: <span className="font-semibold">{durationHours.toFixed(1)} hours</span>
        </span>
      </div>

      {/* Availability legend */}
      {availability.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availability.slice(0, 14).map((day) => (
            <div
              key={day.date}
              title={
                day.isBlackedOut
                  ? 'Blocked'
                  : day.isScheduledOpen
                    ? `Open ${day.openTime ?? ''}–${day.closeTime ?? ''}`
                    : 'Closed'
              }
              className={cn(
                'flex h-8 w-10 flex-col items-center justify-center rounded-[4px] text-[10px] font-medium',
                day.isBlackedOut
                  ? 'bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]'
                  : day.isScheduledOpen && day.bookedSlots.length === 0
                    ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]'
                    : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]',
              )}
              aria-label={`${day.date}: ${day.isBlackedOut ? 'blocked' : day.isScheduledOpen ? 'available' : 'closed'}`}
            >
              <span>{new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric' })}</span>
              <span className="opacity-70">{new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' })}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

function StepVehicle({
  vehicles,
  selectedVehicleId,
  onSelect,
}: {
  vehicles: Vehicle[]
  selectedVehicleId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Select your vehicle</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Choose the EV you'll be charging.
        </p>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-10 text-center">
          <Car className="mx-auto mb-3 h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No vehicles on your account.</p>
          <a
            href="/profile/vehicles/new"
            className="mt-3 inline-block text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
          >
            Add a vehicle →
          </a>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" role="radiogroup" aria-label="Select vehicle">
          {vehicles.map((v) => {
            const isSelected = v.id === selectedVehicleId
            return (
              <li key={v.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelect(v.id)}
                  className={cn(
                    'w-full rounded-[6px] border px-4 py-3.5 text-left transition-colors',
                    isSelected
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.5)]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">
                        {v.year} {v.make} {v.model}
                        {v.isPrimary && (
                          <span className="ml-2 rounded-full bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                            Primary
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                        {v.plugTypes.join(' · ')}
                        {v.batteryCapacityKwh ? ` · ${v.batteryCapacityKwh}kWh` : ''}
                      </p>
                    </div>
                    <div
                      className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                        isSelected
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]'
                          : 'border-[hsl(var(--border))]',
                      )}
                      aria-hidden="true"
                    >
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-[hsl(var(--primary-foreground))]" />
                      )}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StepPayment({
  cards,
  selectedCardId,
  onSelect,
  estimatedCostPence,
  listing,
  loadingCards,
}: {
  cards: SavedCard[]
  selectedCardId: string | null
  onSelect: (id: string) => void
  estimatedCostPence: number
  listing: Listing
  loadingCards: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Review & pay</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          An authorization hold of{' '}
          <span className="font-semibold text-[hsl(var(--foreground))]">
            {formatPence(estimatedCostPence)}
          </span>{' '}
          will be placed on your card. Final charge applies when your session ends.
        </p>
      </div>

      {/* Cost breakdown */}
      <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Estimated cost
        </p>
        <div className="flex items-center gap-3">
          <PoundSterling className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
          <span className="font-mono text-3xl font-bold text-[hsl(var(--foreground))]">
            {formatPence(estimatedCostPence)}
          </span>
        </div>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          {listing.pricingModel === 'per_kwh' && listing.pricePerKwhPence != null
            ? `${formatPence(listing.pricePerKwhPence)}/kWh · final cost based on actual kWh delivered`
            : listing.pricingModel === 'per_hour' && listing.pricePerHourPence != null
              ? `${formatPence(listing.pricePerHourPence)}/hour`
              : 'Flat session rate'}
        </p>
      </div>

      {/* Payment method selector */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Payment method</p>

        {loadingCards ? (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading cards…
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-8 text-center">
            <CreditCard className="mx-auto mb-3 h-7 w-7 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No saved cards found.</p>
            <a
              href="/profile/payments"
              className="mt-3 inline-block text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
            >
              Add a card →
            </a>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" role="radiogroup" aria-label="Select payment method">
            {cards.map((card) => {
              const isSelected = card.id === selectedCardId
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onSelect(card.id)}
                    className={cn(
                      'w-full rounded-[6px] border px-4 py-3.5 text-left transition-colors',
                      isSelected
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]'
                        : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.5)]',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span aria-hidden="true" className="text-lg">
                          {brandIcon(card.brand)}
                        </span>
                        <div>
                          <p className="font-medium capitalize text-[hsl(var(--foreground))]">
                            {card.brand} ···· {card.last4}
                            {card.isDefault && (
                              <span className="ml-2 rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                                Default
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            Expires {card.expMonth}/{card.expYear}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                          isSelected
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]'
                            : 'border-[hsl(var(--border))]',
                        )}
                        aria-hidden="true"
                      >
                        {isSelected && (
                          <div className="h-2 w-2 rounded-full bg-[hsl(var(--primary-foreground))]" />
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        By booking you agree to Zipgrid&apos;s{' '}
        <a href="/terms" className="underline hover:opacity-80">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline hover:opacity-80">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  )
}

function StepConfirmation({ booking }: { booking: BookingResult }) {
  const start = new Date(booking.scheduledStart)
  const end = new Date(booking.scheduledEnd)
  const formatDt = (d: Date) =>
    d.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <CheckCircle2
        className="h-16 w-16 text-[hsl(var(--primary))]"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <div>
        <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
          {booking.instantBook ? 'Booking confirmed!' : 'Request sent!'}
        </h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {booking.instantBook
            ? 'Your slot is reserved. See the details below.'
            : 'The host will confirm within 24 hours.'}
        </p>
      </div>

      {/* Booking summary card */}
      <div className="w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-left">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Booking summary
        </p>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            <span className="text-[hsl(var(--foreground))]">
              {booking.listingTitle}{booking.listingCity ? `, ${booking.listingCity}` : ''}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            <span className="text-[hsl(var(--foreground))]">
              {formatDt(start)} → {formatDt(end)}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <PoundSterling className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            <span className="text-[hsl(var(--foreground))]">
              Estimated {formatPence(booking.estimatedCostPence)} (final on session end)
            </span>
          </div>
        </div>
      </div>

      {/* QR / PIN — only if confirmed */}
      {booking.instantBook && booking.sessionPin && (
        <div className="w-full rounded-[6px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
            Arrival PIN
          </p>
          <p
            className="font-mono text-4xl font-bold tracking-[0.3em] text-[hsl(var(--foreground))]"
            aria-label={`Arrival PIN: ${booking.sessionPin.split('').join(' ')}`}
          >
            {booking.sessionPin}
          </p>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            Use this at the charger. Your booking ID:{' '}
            <span className="font-mono font-semibold">{booking.id.slice(0, 8).toUpperCase()}</span>
          </p>
        </div>
      )}

      <a
        href={`/driver/bookings/${booking.id}`}
        className={cn(
          'flex h-11 w-full items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]',
          'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
        )}
      >
        View booking details
      </a>
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────────── */

export default function BookPage({
  params,
}: {
  params: Promise<{ listingId: string }>
}) {
  const { listingId } = use(params)
  const router = useRouter()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [listing, setListing] = useState<Listing | null>(null)
  const [availability, setAvailability] = useState<DayAvailability[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [cards, setCards] = useState<SavedCard[]>([])
  const [loadingCards, setLoadingCards] = useState(false)

  // Form state
  const [startIso, setStartIso] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 2, 0, 0, 0) // default: 2h from now, on the hour
    return d.toISOString()
  })
  const [endIso, setEndIso] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 4, 0, 0, 0)
    return d.toISOString()
  })
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const [stepError, setStepError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [booking, setBooking] = useState<BookingResult | null>(null)

  // Fetch listing
  const fetchListing = useCallback(async () => {
    const res = await fetch(`/api/v1/listings/${listingId}`)
    if (res.ok) {
      const data = await res.json() as { success: boolean; data: Listing }
      if (data.success) setListing(data.data)
    }
  }, [listingId])

  // Fetch availability for next 14 days
  const fetchAvailability = useCallback(async () => {
    const from = new Date().toISOString().slice(0, 10)
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
    const res = await fetch(`/api/v1/listings/${listingId}/availability?from=${from}&to=${to}`)
    if (res.ok) {
      const data = await res.json() as { success: boolean; data: DayAvailability[] }
      if (data.success) setAvailability(data.data)
    }
  }, [listingId])

  // Fetch vehicles
  const fetchVehicles = useCallback(async () => {
    const res = await fetch('/api/v1/vehicles')
    if (res.ok) {
      const data = await res.json() as { success: boolean; data: Vehicle[] }
      if (data.success) {
        setVehicles(data.data)
        const primary = data.data.find((v) => v.isPrimary) ?? data.data[0]
        if (primary) setSelectedVehicleId(primary.id)
      }
    }
  }, [])

  // Fetch payment methods (lazy — only when reaching step 3)
  const fetchCards = useCallback(async () => {
    setLoadingCards(true)
    try {
      const res = await fetch('/api/v1/payments/methods')
      if (res.ok) {
        const data = await res.json() as { success: boolean; data: SavedCard[] }
        if (data.success) {
          setCards(data.data)
          const def = data.data.find((c) => c.isDefault) ?? data.data[0]
          if (def) setSelectedCardId(def.id)
        }
      }
    } finally {
      setLoadingCards(false)
    }
  }, [])

  useEffect(() => {
    void fetchListing()
    void fetchAvailability()
    void fetchVehicles()
  }, [fetchListing, fetchAvailability, fetchVehicles])

  const estimatedCost = listing
    ? calcEstimatedCost(
        listing,
        startIso,
        endIso,
        vehicles.find((v) => v.id === selectedVehicleId)?.batteryCapacityKwh ?? null,
      )
    : 0

  /* ── Step validation ───────────────────────────────────────── */
  const validateStep = (): boolean => {
    setStepError(null)
    if (step === 1) {
      const start = new Date(startIso)
      const end = new Date(endIso)
      if (start <= new Date()) {
        setStepError('Start time must be in the future.')
        return false
      }
      const dh = (end.getTime() - start.getTime()) / 3_600_000
      if (listing && dh < listing.minBookingHours) {
        setStepError(`Minimum booking duration is ${listing.minBookingHours}h.`)
        return false
      }
      if (listing && dh > listing.maxBookingHours) {
        setStepError(`Maximum booking duration is ${listing.maxBookingHours}h.`)
        return false
      }
    }
    if (step === 2 && !selectedVehicleId) {
      setStepError('Please select a vehicle.')
      return false
    }
    if (step === 3 && !selectedCardId) {
      setStepError('Please select a payment method.')
      return false
    }
    return true
  }

  /* ── Next step ─────────────────────────────────────────────── */
  const handleNext = async () => {
    if (!validateStep()) return
    if (step === 2) void fetchCards() // prefetch cards before step 3
    if (step < 3) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4)
      return
    }

    // Step 3 → submit booking
    if (!selectedVehicleId || !selectedCardId) return
    setSubmitting(true)
    setStepError(null)
    try {
      const res = await fetch('/api/v1/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          vehicleId: selectedVehicleId,
          scheduledStart: startIso,
          scheduledEnd: endIso,
          paymentMethodId: selectedCardId,
        }),
      })
      const json = await res.json() as {
        success: boolean
        data?: BookingResult
        error?: { message: string }
      }
      if (!res.ok || !json.success) {
        setStepError(json.error?.message ?? 'Booking failed. Please try again.')
        return
      }
      setBooking(json.data!)
      setStep(4)
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    setStepError(null)
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4)
    else router.back()
  }

  if (!listing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
      </div>
    )
  }

  const currentStepMeta = STEPS[step - 1]!

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-4">
        {step < 4 && (
          <button
            type="button"
            onClick={handleBack}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
            {listing.title}
          </p>
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {listing.city}
          </div>
        </div>
        {/* Charger badge */}
        <span className="flex items-center gap-1 rounded-full bg-[hsl(var(--primary)/0.1)] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--primary))]">
          <Zap className="h-3 w-3" aria-hidden="true" />
          {listing.maxPowerKw}kW
        </span>
      </header>

      {/* Step indicator */}
      {step < 4 && (
        <div className="flex border-b border-[hsl(var(--border))]" role="tablist" aria-label="Booking steps">
          {STEPS.slice(0, 3).map((s) => {
            const isActive = s.id === step
            const isDone = s.id < step
            return (
              <div
                key={s.id}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium',
                  isActive
                    ? 'border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : isDone
                      ? 'text-[hsl(var(--primary)/0.6)]'
                      : 'text-[hsl(var(--muted-foreground))]',
                )}
              >
                <s.icon className="h-4 w-4" aria-hidden="true" />
                {s.label}
              </div>
            )
          })}
        </div>
      )}

      {/* Step content */}
      <main className="flex-1 overflow-auto px-5 py-6">
        {step === 1 && (
          <StepDatetime
            listing={listing}
            availability={availability}
            startIso={startIso}
            endIso={endIso}
            onStartChange={setStartIso}
            onEndChange={setEndIso}
            error={stepError}
          />
        )}
        {step === 2 && (
          <StepVehicle
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelect={setSelectedVehicleId}
          />
        )}
        {step === 3 && (
          <StepPayment
            cards={cards}
            selectedCardId={selectedCardId}
            onSelect={setSelectedCardId}
            estimatedCostPence={estimatedCost}
            listing={listing}
            loadingCards={loadingCards}
          />
        )}
        {step === 4 && booking && <StepConfirmation booking={booking} />}
      </main>

      {/* Footer CTA — hidden on confirmation step */}
      {step < 4 && (
        <footer className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] px-5 py-4">
          {stepError && step === 3 && (
            <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {stepError}
            </p>
          )}
          {/* Estimated cost preview */}
          {step === 3 && (
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-[hsl(var(--muted-foreground))]">Estimated hold</span>
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {formatPence(estimatedCost)}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={submitting || (step === 2 && vehicles.length === 0) || (step === 3 && cards.length === 0)}
            aria-busy={submitting}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2 rounded-[6px]',
              'bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]',
              'transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Processing…
              </>
            ) : step === 3 ? (
              <>
                {listing.instantBookEnabled ? 'Confirm booking' : 'Request booking'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </footer>
      )}
    </div>
  )
}
