/**
 * @file page.tsx
 * @description /driver/emergency — Emergency Charging Mode.
 * Driver enters battery %, app calculates max range, shows nearby
 * available chargers, allows instant booking. Platform fee waived.
 *
 * @module apps/web/app/(driver)/emergency
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap, MapPin, Navigation, Clock, PoundSterling,
  AlertTriangle, Loader2, CheckCircle2, Battery,
  ArrowLeft, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type EmergencyListing = {
  id: string; title: string; city: string
  latitude: number; longitude: number
  maxPowerKw: number; pricePerKwhPence: number | null
  instantBookEnabled: boolean; distanceMetres: number
}

type EmergencyResult = {
  emergencySessionId: string; batteryPct: number
  maxRangeMetres: number; listingsFound: number
  listings: EmergencyListing[]; expiresAt: string
  platformFeeWaived: boolean
}

/* ── Helpers ────────────────────────────────────────────────── */

function fmt(p: number) { return `£${(p / 100).toFixed(2)}` }
function fmtDist(m: number) {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`
}

/* ── Battery picker ──────────────────────────────────────────── */

const BATTERY_LEVELS = [5, 10, 15, 20]

/* ── Page ────────────────────────────────────────────────────── */

type Step = 'battery' | 'searching' | 'results' | 'booking'

export default function EmergencyPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('battery')
  const [batteryPct, setBatteryPct] = useState(10)
  const [result, setResult] = useState<EmergencyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [bookingListingId, setBookingListingId] = useState<string | null>(null)
  const [booking, setBooking] = useState(false)

  const handleSearch = useCallback(async () => {
    setError(null)
    setStep('searching')

    // Get current location
    let lat = 51.5074, lng = -0.1278 // London fallback
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {
      // Fallback to London if location denied
    }

    try {
      const res = await fetch('/api/v1/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batteryPct, lat, lng }),
      })
      const json = await res.json() as { success: boolean; data?: EmergencyResult; error?: { message: string } }
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to find chargers. Please try again.')
        setStep('battery')
        return
      }
      setResult(json.data!)
      setStep('results')
    } catch {
      setError('Network error. Please check your connection.')
      setStep('battery')
    }
  }, [batteryPct])

  const handleBook = async (listing: EmergencyListing) => {
    setBooking(true)
    setBookingListingId(listing.id)
    try {
      // Create an immediate booking (1-hour window from now)
      const start = new Date()
      const end = new Date(Date.now() + 60 * 60_000)

      // Get saved PM
      const pmRes = await fetch('/api/v1/payments/methods')
      const pmJson = await pmRes.json() as { success: boolean; data: Array<{ id: string }> }
      const pm = pmJson.data?.[0]
      if (!pm) {
        setError('Add a payment method in Settings before booking.')
        return
      }

      // Get primary vehicle
      const vehRes = await fetch('/api/v1/vehicles?primary=true')
      const vehJson = await vehRes.json() as { success: boolean; data: Array<{ id: string }> }
      const vehicle = vehJson.data?.[0]
      if (!vehicle) {
        setError('Add a vehicle to your profile before booking.')
        return
      }

      const res = await fetch('/api/v1/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          vehicleId: vehicle.id,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          paymentMethodId: pm.id,
        }),
      })
      const json = await res.json() as { success: boolean; data?: { id: string }; error?: { message: string } }
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Booking failed.')
        return
      }
      setBookingId(json.data!.id)
      setStep('booking')
    } finally {
      setBooking(false)
    }
  }

  const rangeKm = result ? Math.round(result.maxRangeMetres / 1000) : 0
  const expiresIn = result
    ? Math.max(0, Math.round((new Date(result.expiresAt).getTime() - Date.now()) / 60_000))
    : 0

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--destructive)/0.06)] px-4 py-4">
        {step !== 'battery' && step !== 'searching' && (
          <button type="button" onClick={() => setStep('battery')} className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))]" aria-label="Back">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--destructive))]">
            <Zap className="h-4 w-4 text-white" aria-hidden="true" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-sm font-bold text-[hsl(var(--destructive))]">Emergency Charging</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Priority matching · Platform fee waived</p>
          </div>
        </div>
        <Link href="/map" className="ml-auto text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          Cancel
        </Link>
      </header>

      <main className="flex-1 px-4 py-6">

        {/* Step: Battery input */}
        {step === 'battery' && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-8 text-center">
            <div>
              <Battery className="mx-auto mb-3 h-16 w-16 text-[hsl(var(--destructive))]" aria-hidden="true" strokeWidth={1.5} />
              <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">How much battery do you have?</h1>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                We'll find every charger within your remaining range.
              </p>
            </div>

            {/* Battery % buttons */}
            <div className="grid w-full grid-cols-2 gap-3">
              {BATTERY_LEVELS.map((pct) => (
                <button key={pct} type="button" onClick={() => setBatteryPct(pct)}
                  className={cn('flex flex-col items-center gap-1 rounded-[8px] border-2 py-4 transition-colors',
                    batteryPct === pct ? 'border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]' : 'border-[hsl(var(--border))]')}
                  aria-pressed={batteryPct === pct}>
                  <span className={cn('text-2xl font-bold', batteryPct === pct ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--foreground))]')}>
                    {pct}%
                  </span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">~{Math.round(pct * 2)}km range</span>
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="w-full">
              <label htmlFor="battery-custom" className="mb-2 block text-xs text-[hsl(var(--muted-foreground))]">
                Or enter exact percentage
              </label>
              <input id="battery-custom" type="number" min={1} max={100} value={batteryPct}
                onChange={(e) => setBatteryPct(Math.min(100, Math.max(1, Number(e.target.value))))}
                className="w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-center text-lg font-bold text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--destructive)/0.4)]" />
            </div>

            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />{error}
              </p>
            )}

            <button type="button" onClick={handleSearch}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-[6px] bg-[hsl(var(--destructive))] text-base font-bold text-white transition-opacity hover:opacity-90">
              <Zap className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
              Find emergency chargers
            </button>
          </div>
        )}

        {/* Step: Searching */}
        {step === 'searching' && (
          <div className="flex flex-col items-center gap-6 py-20 text-center">
            <div className="relative">
              <div className="h-20 w-20 animate-ping rounded-full bg-[hsl(var(--destructive)/0.2)]" aria-hidden="true" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Zap className="h-8 w-8 text-[hsl(var(--destructive))]" aria-hidden="true" strokeWidth={2} />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold text-[hsl(var(--foreground))]">Scanning for chargers…</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Finding available chargers within your {batteryPct}% range
              </p>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Searching" />
          </div>
        )}

        {/* Step: Results */}
        {step === 'results' && result && (
          <div className="mx-auto flex max-w-lg flex-col gap-5">
            {/* Summary */}
            <div className="flex flex-wrap items-center gap-4 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-4">
              <Battery className="h-5 w-5 text-[hsl(var(--destructive))]" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  {result.listingsFound} charger{result.listingsFound !== 1 ? 's' : ''} within your {rangeKm}km range
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Hosts alerted · Platform fee waived · Expires in {expiresIn} min</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-[hsl(var(--destructive))]">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {expiresIn}m
              </div>
            </div>

            {result.listings.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-[hsl(var(--muted-foreground))]" aria-hidden="true" strokeWidth={1.5} />
                <div>
                  <p className="font-semibold text-[hsl(var(--foreground))]">No chargers available</p>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                    No Zipgrid hosts are available within your range right now.
                  </p>
                </div>
                <Link href="/map" className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
                  View public chargers on map →
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-3" aria-label="Available emergency chargers">
                {result.listings.map((listing, i) => (
                  <li key={listing.id}>
                    <div className={cn(
                      'rounded-[8px] border bg-[hsl(var(--card))] p-4',
                      i === 0 ? 'border-[hsl(var(--destructive)/0.5)]' : 'border-[hsl(var(--border))]',
                    )}>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          {i === 0 && (
                            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--destructive)/0.1)] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--destructive))]">
                              <Zap className="h-2.5 w-2.5" aria-hidden="true" /> Nearest
                            </span>
                          )}
                          <p className="font-semibold text-[hsl(var(--foreground))]">{listing.title}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {listing.city} · {fmtDist(listing.distanceMetres)} away
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-bold text-[hsl(var(--foreground))]">
                            {listing.maxPowerKw}kW
                          </p>
                          {listing.pricePerKwhPence != null ? (
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{fmt(listing.pricePerKwhPence)}/kWh</p>
                          ) : (
                            <p className="text-xs font-medium text-[hsl(var(--primary))]">Fee waived</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[6px] border border-[hsl(var(--border))] text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                        >
                          <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Navigate
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleBook(listing)}
                          disabled={booking}
                          aria-busy={booking && bookingListingId === listing.id}
                          className={cn(
                            'flex h-9 flex-1 items-center justify-center gap-2 rounded-[6px] text-xs font-bold transition-colors',
                            listing.instantBookEnabled
                              ? 'bg-[hsl(var(--destructive))] text-white hover:opacity-90'
                              : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90',
                            booking && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          {booking && bookingListingId === listing.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            : <Zap className="h-3.5 w-3.5" aria-hidden="true" />}
                          {listing.instantBookEnabled ? 'Book now' : 'Request'}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />{error}
              </p>
            )}
          </div>
        )}

        {/* Step: Booking confirmed */}
        {step === 'booking' && bookingId && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            <div>
              <p className="text-xl font-semibold text-[hsl(var(--foreground))]">Booking confirmed!</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Head to the charger now. Platform fee has been waived.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3">
              <button type="button" onClick={() => router.push(`/driver/bookings/${bookingId}`)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90">
                <ArrowRight className="h-4 w-4" aria-hidden="true" /> View booking & PIN
              </button>
              <Link href="/map" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                Back to map
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
