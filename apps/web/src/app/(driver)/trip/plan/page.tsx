/**
 * @file page.tsx
 * @description /driver/trip/plan — Multi-stop AI trip planner.
 * Driver enters destination, battery %, vehicle range, and departure time.
 * The AI returns a full trip plan with charging stops, timings, and costs.
 * Drivers can review the plan and book all stops in one action.
 *
 * @module apps/web/app/(driver)/trip/plan
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Battery, Thermometer, Clock,
  Zap, PoundSterling, ChevronRight, Loader2, AlertTriangle,
  CheckCircle2, Car, Navigation, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ChargerStop = {
  listingId: string
  title: string
  city: string
  latitude: number
  longitude: number
  distanceFromRouteMetres: number
  maxPowerKw: number
  pricePerKwhPence: number | null
  instantBookEnabled: boolean
  averageRating: number | null
  estimatedArrivalTime: string
  estimatedChargeMinutes: number
  estimatedCostPence: number
  batteryAtArrival: number
  batteryAfterCharge: number
}

type TripPlan = {
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number; label: string }
  totalDistanceMiles: number
  totalDurationMinutes: number
  chargingStops: ChargerStop[]
  weatherRangePenaltyPct: number
  effectiveRangeMiles: number
  estimatedArrivalTime: string
  totalChargingTimeMins: number
  totalEstimatedCostPence: number
  noStopsNeeded: boolean
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

/* ── Battery bar ────────────────────────────────────────────── */

function BatteryBar({ percent, className }: { percent: number; className?: string }) {
  const color = percent >= 50 ? 'bg-[hsl(var(--primary))]'
    : percent >= 20 ? 'bg-yellow-400'
    : 'bg-[hsl(var(--destructive))]'

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]', className)}
      role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
      aria-label={`${percent}% battery`}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${percent}%` }} />
    </div>
  )
}

/* ── Stop card ──────────────────────────────────────────────── */

function StopCard({ stop, index, onBook }: {
  stop: ChargerStop
  index: number
  onBook: (id: string) => void
}) {
  return (
    <div className="flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center gap-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-white">
          {index + 1}
        </div>
        <div className="w-px flex-1 bg-[hsl(var(--border))]" aria-hidden="true" />
      </div>

      {/* Card */}
      <div className="mb-6 flex-1 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-[hsl(var(--foreground))]">{stop.title}</p>
            <p className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {stop.city} · {stop.distanceFromRouteMetres < 1000
                ? `${stop.distanceFromRouteMetres}m off-route`
                : `${(stop.distanceFromRouteMetres / 1000).toFixed(1)}km off-route`}
            </p>
          </div>
          {stop.averageRating != null && (
            <span className="shrink-0 text-xs font-medium text-[hsl(var(--muted-foreground))]">
              ★ {stop.averageRating.toFixed(1)}
            </span>
          )}
        </div>

        {/* Timing row */}
        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-[4px] bg-[hsl(var(--secondary))] py-2">
            <p className="text-[hsl(var(--muted-foreground))]">Arrive</p>
            <p className="font-semibold">{formatTime(stop.estimatedArrivalTime)}</p>
          </div>
          <div className="rounded-[4px] bg-[hsl(var(--secondary))] py-2">
            <p className="text-[hsl(var(--muted-foreground))]">Charge</p>
            <p className="font-semibold">{stop.estimatedChargeMinutes}min</p>
          </div>
          <div className="rounded-[4px] bg-[hsl(var(--secondary))] py-2">
            <p className="text-[hsl(var(--muted-foreground))]">Cost</p>
            <p className="font-semibold">{formatPence(stop.estimatedCostPence)}</p>
          </div>
        </div>

        {/* Battery change */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1">
              <Battery className="h-3 w-3" aria-hidden="true" />
              {stop.batteryAtArrival}% → {stop.batteryAfterCharge}%
            </span>
            <span>{stop.maxPowerKw}kW{stop.pricePerKwhPence != null ? ` · ${stop.pricePerKwhPence}p/kWh` : ''}</span>
          </div>
          <BatteryBar percent={stop.batteryAfterCharge} />
        </div>

        {/* Action row */}
        <div className="flex gap-2">
          <Link
            href={`/listings/${stop.listingId}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[hsl(var(--border))] py-2 text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
          >
            View charger
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => onBook(stop.listingId)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[6px] py-2 text-xs font-semibold',
              stop.instantBookEnabled
                ? 'bg-[hsl(var(--primary))] text-white hover:opacity-90'
                : 'border border-[hsl(var(--primary)/0.4)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.06)]',
            )}
          >
            <Zap className="h-3 w-3" aria-hidden="true" />
            {stop.instantBookEnabled ? 'Book instantly' : 'Request booking'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

const COMMON_VEHICLES = [
  { label: 'Tesla Model 3 Long Range', rangeMiles: 358 },
  { label: 'Nissan Leaf (40 kWh)', rangeMiles: 168 },
  { label: 'VW ID.4 Pro', rangeMiles: 261 },
  { label: 'Hyundai Ioniq 6', rangeMiles: 328 },
  { label: 'BMW iX3', rangeMiles: 286 },
  { label: 'Peugeot e-208', rangeMiles: 224 },
]

export default function TripPlannerPage() {
  // Form state
  const [destLat,  setDestLat]  = useState('')
  const [destLng,  setDestLng]  = useState('')
  const [destLabel, setDestLabel] = useState('')
  const [battery,  setBattery]  = useState(70)
  const [rangeMiles, setRangeMiles] = useState(260)
  const [tempC, setTempC]       = useState(15)
  const [departure, setDeparture] = useState(() => {
    const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
    return d.toISOString().slice(0, 16)
  })

  // Result state
  const [plan, setPlan]         = useState<TripPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  // Booking state
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)

  const handlePlan = async () => {
    const lat = parseFloat(destLat)
    const lng = parseFloat(destLng)
    if (isNaN(lat) || isNaN(lng)) {
      setPlanError('Enter a valid destination latitude and longitude.')
      return
    }

    setPlanning(true)
    setPlanError(null)
    setPlan(null)

    try {
      // Use browser geolocation for origin
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej)
      ).catch(() => null)

      const originLat = pos?.coords.latitude ?? 51.5074
      const originLng = pos?.coords.longitude ?? -0.1278

      const res = await fetch('/api/v1/trip/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originLat, originLng,
          destinationLat: lat, destinationLng: lng, destinationLabel: destLabel || undefined,
          batteryPercent: battery,
          vehicleRangeMiles: rangeMiles,
          temperatureCelsius: tempC,
          departureTime: new Date(departure).toISOString(),
          plugTypes: ['type_2', 'ccs_2'],
        }),
      })

      const json = await res.json() as { success: boolean; data?: TripPlan; error?: { message: string } }
      if (!res.ok || !json.success) {
        setPlanError(json.error?.message ?? 'Could not plan your trip. Please try again.')
        return
      }
      setPlan(json.data!)
    } finally {
      setPlanning(false)
    }
  }

  const handleBookStop = async (listingId: string) => {
    // Navigate to the listing booking page
    window.location.href = `/listings/${listingId}/book`
  }

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-4">
        <Link
          href="/driver/map"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
          aria-label="Back to map"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-sm font-semibold text-[hsl(var(--foreground))]">Trip Planner</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">AI-powered multi-stop journey planning</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 pb-12 pt-6">

        {!plan ? (
          /* ── Plan form ── */
          <form onSubmit={(e) => { e.preventDefault(); void handlePlan() }} className="flex flex-col gap-5">

            {/* Destination */}
            <section className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" aria-labelledby="dest-heading">
              <h2 id="dest-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                <Navigation className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                Destination
              </h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="dest-label" className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    Place name (optional)
                  </label>
                  <input
                    id="dest-label"
                    type="text"
                    value={destLabel}
                    onChange={(e) => setDestLabel(e.target.value)}
                    placeholder="e.g. Manchester City Centre"
                    className="h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="dest-lat" className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">Latitude</label>
                    <input
                      id="dest-lat"
                      type="number"
                      step="any"
                      value={destLat}
                      onChange={(e) => setDestLat(e.target.value)}
                      placeholder="53.4808"
                      required
                      className="h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="dest-lng" className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">Longitude</label>
                    <input
                      id="dest-lng"
                      type="number"
                      step="any"
                      value={destLng}
                      onChange={(e) => setDestLng(e.target.value)}
                      placeholder="-2.2426"
                      required
                      className="h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Vehicle & battery */}
            <section className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" aria-labelledby="vehicle-heading">
              <h2 id="vehicle-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                <Car className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                Your vehicle
              </h2>

              {/* Quick select */}
              <div className="mb-3">
                <label htmlFor="vehicle-select" className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  Quick select (optional)
                </label>
                <select
                  id="vehicle-select"
                  onChange={(e) => {
                    const v = COMMON_VEHICLES.find((v) => v.label === e.target.value)
                    if (v) setRangeMiles(v.rangeMiles)
                  }}
                  className="h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm focus:outline-none"
                >
                  <option value="">Choose a vehicle…</option>
                  {COMMON_VEHICLES.map((v) => (
                    <option key={v.label} value={v.label}>{v.label} ({v.rangeMiles}mi WLTP)</option>
                  ))}
                </select>
              </div>

              {/* WLTP Range */}
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="range-input" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">WLTP range</label>
                  <span className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">{rangeMiles} miles</span>
                </div>
                <input
                  id="range-input"
                  type="range"
                  min={60}
                  max={500}
                  step={5}
                  value={rangeMiles}
                  onChange={(e) => setRangeMiles(Number(e.target.value))}
                  className="h-2 w-full accent-[hsl(var(--primary))]"
                />
              </div>

              {/* Battery */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="battery-input" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Current battery</label>
                  <span className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">{battery}%</span>
                </div>
                <input
                  id="battery-input"
                  type="range"
                  min={5}
                  max={100}
                  value={battery}
                  onChange={(e) => setBattery(Number(e.target.value))}
                  className="h-2 w-full accent-[hsl(var(--primary))]"
                />
                <BatteryBar percent={battery} className="mt-2" />
              </div>
            </section>

            {/* Departure + weather */}
            <section className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" aria-labelledby="depart-heading">
              <h2 id="depart-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                Departure & conditions
              </h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="departure" className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">Departure time</label>
                  <input
                    id="departure"
                    type="datetime-local"
                    value={departure}
                    onChange={(e) => setDeparture(e.target.value)}
                    className="h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="temp-input" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      <Thermometer className="mr-1 inline h-3 w-3" aria-hidden="true" />
                      Temperature
                    </label>
                    <span className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">{tempC}°C</span>
                  </div>
                  <input
                    id="temp-input"
                    type="range"
                    min={-20}
                    max={40}
                    value={tempC}
                    onChange={(e) => setTempC(Number(e.target.value))}
                    className="h-2 w-full accent-[hsl(var(--primary))]"
                  />
                  {tempC < 5 && (
                    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                      Cold weather will reduce your real-world range by {tempC < 0 ? '30%' : '17%'}.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Error */}
            {planError && (
              <div role="alert" className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)/0.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {planError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={planning}
              aria-busy={planning}
              className={cn(
                'flex h-12 w-full items-center justify-center gap-2 rounded-[6px]',
                'bg-[hsl(var(--primary))] text-sm font-semibold text-white',
                'transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {planning
                ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Planning your trip…</>
                : <><Navigation className="h-4 w-4" aria-hidden="true" /> Plan my trip</>}
            </button>
          </form>
        ) : (
          /* ── Trip plan result ── */
          <div className="flex flex-col gap-5">

            {/* Trip summary */}
            <div className="rounded-[8px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.05)] p-4">
              <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                Trip to {plan.destination.label || 'your destination'}
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                {[
                  { label: 'Distance',   value: `${plan.totalDistanceMiles} miles`,     icon: MapPin },
                  { label: 'Journey',    value: formatDuration(plan.totalDurationMinutes), icon: Clock },
                  { label: 'Arrive',     value: formatTime(plan.estimatedArrivalTime),   icon: Navigation },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex flex-col items-center gap-1 rounded-[6px] bg-[hsl(var(--background))] py-2.5">
                    <Icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
                    <p className="text-[hsl(var(--muted-foreground))]">{label}</p>
                    <p className="font-semibold text-[hsl(var(--foreground))]">{value}</p>
                  </div>
                ))}
              </div>

              {plan.weatherRangePenaltyPct > 0 && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Cold weather reduces your range by {plan.weatherRangePenaltyPct}% — effective range: {plan.effectiveRangeMiles} miles.
                </p>
              )}

              {plan.totalEstimatedCostPence > 0 && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">Estimated charging cost</span>
                  <span className="font-semibold text-[hsl(var(--foreground))]">{formatPence(plan.totalEstimatedCostPence)}</span>
                </div>
              )}
            </div>

            {/* No stops needed */}
            {plan.noStopsNeeded ? (
              <div className="flex flex-col items-center gap-3 rounded-[8px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.05)] p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                <div>
                  <p className="font-semibold text-[hsl(var(--foreground))]">No charging stops needed</p>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                    Your current battery is sufficient to reach {plan.destination.label || 'your destination'} with range to spare.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Charging stops */}
                <div>
                  <h2 className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">
                    {plan.chargingStops.length} charging {plan.chargingStops.length === 1 ? 'stop' : 'stops'} · {formatDuration(plan.totalChargingTimeMins)} total charge time
                  </h2>

                  {/* Origin dot */}
                  <div className="mb-2 flex items-center gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      Depart at {formatTime(new Date(departure).toISOString())} — {battery}% battery
                    </p>
                  </div>

                  {plan.chargingStops.map((stop, i) => (
                    <StopCard key={stop.listingId} stop={stop} index={i} onBook={handleBookStop} />
                  ))}

                  {/* Destination dot */}
                  <div className="flex items-center gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-white">
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                        Arrive {formatDate(plan.estimatedArrivalTime)} at {formatTime(plan.estimatedArrivalTime)}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {plan.destination.label || 'Destination'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Book all CTA */}
                {plan.chargingStops.length > 0 && (
                  <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                    <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">
                      Book each stop individually via the buttons above, or visit each listing to confirm availability for your preferred times.
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                      <Zap className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden="true" />
                      Instant Book chargers confirm immediately — no wait required.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Re-plan button */}
            <button
              type="button"
              onClick={() => setPlan(null)}
              className="flex h-11 items-center justify-center gap-2 rounded-[6px] border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Plan a different trip
            </button>

            {/* Book error */}
            {bookError && (
              <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{bookError}</p>
            )}
            {bookingId && (
              <p className="flex items-center gap-2 text-sm text-[hsl(var(--primary))]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Stop booked — ref: <code className="font-mono text-xs">{bookingId.slice(0, 8).toUpperCase()}</code>
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
