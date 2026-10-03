/**
 * @file page.tsx
 * @description /trip/plan — plan charging for a journey in your own car:
 * stops with a best and backup charger that's free when you get there,
 * booking times, costs and arrival. Book a stop directly, or hand the whole
 * plan to the concierge to book every stop.
 *
 * @module apps/web/app/(driver)/trip/plan
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Battery, CalendarDays, Car, Clock, Loader2, LocateFixed, MapPin, Navigation, Sparkles, Star, Zap } from 'lucide-react'
import type { StopOption, TripPlan } from '@/domains/trip/TripPlanner'
import { cn } from '@/lib/utils'

type Plan = TripPlan & { vehicle: { id: string; name: string } }
type Vehicle = { id: string; make: string; model: string; batteryCapacityKwh: number | null; isPrimary: boolean }
type Envelope<T> = { success: true; data: T } | { success: false; error: { message: string } }

const card = 'rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4'
const input = 'h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]'
const muted = 'text-[hsl(var(--muted-foreground))]'

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`)
const pounds = (p: number) => `£${(p / 100).toFixed(2)}`

function nextQuarterHour(): string {
  const d = new Date(Date.now() + 15 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Trip planner page. */
export default function TripPlannerPage() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [origin, setOrigin] = useState('')
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [destination, setDestination] = useState('')
  const [departure, setDeparture] = useState(nextQuarterHour)
  const [battery, setBattery] = useState(80)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v1/vehicles', { credentials: 'include' })
      .then((r) => r.json() as Promise<Envelope<Vehicle[]>>)
      .then((j) => {
        const list = j.success ? j.data : []
        setVehicles(list)
        setVehicleId(list.find((v) => v.isPrimary)?.id ?? list[0]?.id ?? '')
      })
      .catch(() => setVehicles([]))
  }, [])

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setOrigin(''); setLocating(false) },
      () => { setError('Could not get your location. Type where you are starting from.'); setLocating(false) },
      { timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPlanning(true)
    setError(null)
    setPlan(null)
    try {
      const res = await fetch('/api/v1/trip/plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          ...(here && !origin ? { originLat: here.lat, originLng: here.lng } : { origin }),
          departure: new Date(departure).toISOString(),
          batteryPercent: battery,
          ...(vehicleId ? { vehicleId } : {}),
        }),
      })
      const j = await res.json().catch(() => null) as Envelope<Plan> | null
      if (!j?.success) throw new Error(j && !j.success ? j.error.message : 'Could not plan your trip. Please try again.')
      setPlan(j.data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPlanning(false)
    }
  }

  const conciergeAsk = plan && plan.stops.some((s) => s.best)
    ? `Book the charging stops for my trip from ${plan.origin.label} to ${plan.destination.label} leaving ${day(plan.departure)} at ${time(plan.departure)}, with ${battery}% battery in my ${plan.vehicle.name}.`
    : null

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-4">
        <Link href="/map" aria-label="Back to map" className={cn('flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))]', muted)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-sm font-semibold">Trip planner</h1>
          <p className={cn('text-xs', muted)}>Where you&apos;ll need to charge, booked ahead.</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pb-12 pt-6">
        {!plan && (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <section className={cn(card, 'flex flex-col gap-3')}>
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium"><MapPin className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" /> From</span>
                <div className="flex gap-2">
                  <input
                    className={input}
                    value={origin}
                    onChange={(e) => { setOrigin(e.target.value); if (e.target.value) setHere(null) }}
                    placeholder={here ? 'Your current location' : 'Town or postcode'}
                    required={!here}
                    maxLength={120}
                  />
                  <button type="button" onClick={useMyLocation} aria-label="Use my location" title="Use my location"
                    className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[6px] border', here ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : cn('border-[hsl(var(--border))]', muted))}>
                    {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium"><Navigation className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" /> To</span>
                <input className={input} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Manchester or M1 1AE" required maxLength={120} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium"><CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" /> Leaving</span>
                <input type="datetime-local" className={input} value={departure} onChange={(e) => setDeparture(e.target.value)} required />
              </label>
            </section>

            <section className={cn(card, 'flex flex-col gap-3')}>
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium"><Car className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" /> Car</span>
                {vehicles === null ? (
                  <Loader2 className={cn('h-4 w-4 animate-spin', muted)} aria-label="Loading" />
                ) : vehicles.length === 0 ? (
                  <p className={cn('text-sm', muted)}>Add your car in <Link href="/vehicles" className="underline">Vehicles</Link> first, so stops match its plug and battery.</p>
                ) : (
                  <select className={input} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.make} {v.model}{v.batteryCapacityKwh ? ` (${v.batteryCapacityKwh} kWh)` : ' (battery size missing)'}</option>
                    ))}
                  </select>
                )}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium"><Battery className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" /> Battery when leaving: {battery}%</span>
                <input type="range" min={5} max={100} step={5} value={battery} onChange={(e) => setBattery(Number(e.target.value))} />
              </label>
            </section>

            {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
            <button type="submit" disabled={planning || !vehicles?.length}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-50">
              {planning && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Plan my charging
            </button>
          </form>
        )}

        {plan && (
          <>
            <section className={cn(card, 'flex flex-col gap-2')}>
              <p className="text-base font-semibold">{plan.origin.label} → {plan.destination.label}</p>
              <p className={cn('text-sm', muted)}>
                About {plan.distanceMiles} miles in your {plan.vehicle.name}. Leave {day(plan.departure)} {time(plan.departure)}, arrive around {time(plan.arrival)}.
              </p>
              <dl className="grid grid-cols-3 gap-2 pt-1 text-sm">
                <Fact label="Stops" value={String(plan.stops.length)} />
                <Fact label="Charging" value={plan.chargingMinutes ? duration(plan.chargingMinutes) : 'none'} />
                <Fact label="Est. cost" value={pounds(plan.estimatedChargingCostPence)} />
              </dl>
              <p className={cn('text-xs', muted)}>
                Distances and times are estimates (range ≈ {plan.rangeMiles} miles{plan.coldPenaltyPct ? `, less ${plan.coldPenaltyPct}% for the cold` : ''}).
              </p>
            </section>

            {plan.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 rounded-[6px] border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" aria-hidden="true" /> {w}
              </p>
            ))}

            {plan.stops.length === 0 && (
              <p className={cn(card, 'text-sm')}>You can make it without charging. Enjoy the drive.</p>
            )}

            <ol className="flex flex-col gap-3">
              {plan.stops.map((s, i) => (
                <li key={i} className={cn(card, 'flex flex-col gap-3')}>
                  <p className="text-sm font-semibold">
                    Stop {i + 1} · mile {s.atMile} · arrive {time(s.arriveAt)} with about {s.batteryOnArrivalPct}%
                  </p>
                  {s.best ? <Option option={s.best} label="Best" /> : <p className={cn('text-sm', muted)}>No bookable charger free here.</p>}
                  {s.backup && <Option option={s.backup} label="Backup" />}
                </li>
              ))}
            </ol>

            {conciergeAsk && (
              <Link href={`/concierge?ask=${encodeURIComponent(conciergeAsk)}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Book all stops with the concierge
              </Link>
            )}
            <button type="button" onClick={() => setPlan(null)} className={cn('text-sm underline', muted)}>Plan another trip</button>
          </>
        )}
      </main>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={cn('text-xs', muted)}>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function Option({ option: o, label }: { option: StopOption; label: string }) {
  const href = `/listings/${o.listingId}/book?start=${encodeURIComponent(o.bookStart)}&end=${encodeURIComponent(o.bookEnd)}`
  return (
    <div className="flex items-start justify-between gap-3 rounded-[6px] border border-[hsl(var(--border))] p-3">
      <div className="min-w-0">
        <p className={cn('text-[10px] font-semibold uppercase tracking-wide', label === 'Best' ? 'text-[hsl(var(--primary))]' : muted)}>{label}</p>
        <p className="truncate text-sm font-medium">{o.title}</p>
        <p className={cn('flex flex-wrap items-center gap-x-2 text-xs', muted)}>
          <span>{o.city} · {o.detourKm} km off route</span>
          <span className="inline-flex items-center gap-0.5"><Zap className="h-3 w-3" aria-hidden="true" />{o.powerKw} kW</span>
          {o.rating != null && <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" aria-hidden="true" />{o.rating.toFixed(1)} ({o.reviewCount})</span>}
        </p>
        <p className={cn('flex items-center gap-1 text-xs', muted)}>
          <Clock className="h-3 w-3" aria-hidden="true" /> {time(o.bookStart)}–{time(o.bookEnd)} · {duration(o.chargeMinutes)} charging · ~{pounds(o.estimatedCostPence)}
          {!o.instantBook && ' · host approves'}
        </p>
      </div>
      <Link href={href} className="flex-shrink-0 rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[hsl(var(--secondary))]">
        Book
      </Link>
    </div>
  )
}
