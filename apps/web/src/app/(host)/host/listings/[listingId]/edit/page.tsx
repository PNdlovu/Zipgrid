/**
 * @file page.tsx
 * @description /host/listings/[listingId]/edit — Edit an existing charger listing.
 * Loads current listing data, renders a tabbed edit form for each section,
 * and PATCHes back to /api/v1/listings/[id].
 *
 * Tabs: Basic info | Location | Charger specs | Pricing | Access | Schedule
 *
 * @module apps/web/app/(host)/listings/[listingId]/edit
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  Info, MapPin, Zap, PoundSterling, Shield,
  CalendarDays, Save, ArrowLeft, Loader2, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ────────────────────────────────────────────────── */

type ListingData = {
  id: string
  title: string
  description: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  status: string
  chargerLevel: string
  maxPowerKw: number
  chargerBrand: string | null
  chargerModel: string | null
  ocppChargePointId: string | null
  isSmartCharger: boolean
  pricingModel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  idleFeePerMinPence: number
  instantBookEnabled: boolean
  accessType: string
  accessInstructions: string | null
  wifiAvailable: boolean
  restroomAvailable: boolean
  shelterAvailable: boolean
  lightingAvailable: boolean
  wheelchairAccessible: boolean
  evParkingOnly: boolean
  minBookingHours: number
  maxBookingHours: number
}

type Tab = 'basic' | 'location' | 'charger' | 'pricing' | 'access' | 'schedule'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'basic',    label: 'Basic info', icon: Info },
  { key: 'location', label: 'Location',  icon: MapPin },
  { key: 'charger',  label: 'Charger',   icon: Zap },
  { key: 'pricing',  label: 'Pricing',   icon: PoundSterling },
  { key: 'access',   label: 'Access',    icon: Shield },
  { key: 'schedule', label: 'Schedule',  icon: CalendarDays },
]

/* ── Shared field primitives ─────────────────────────────── */

function FieldGroup({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
    </div>
  )
}

const inputCls = cn(
  'h-11 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
  'px-3.5 text-sm placeholder:text-[hsl(var(--muted-foreground))]',
  'focus:border-[hsl(var(--primary))] focus:outline-none',
)

/* ── Tab panels ──────────────────────────────────────────── */

function BasicTab({
  data, onChange,
}: {
  data: ListingData
  onChange: (field: keyof ListingData, value: unknown) => void
}) {
  return (
    <div className="space-y-5">
      <FieldGroup label="Listing title">
        <input
          className={inputCls}
          value={data.title}
          onChange={(e) => onChange('title', e.target.value)}
          maxLength={120}
        />
      </FieldGroup>
      <FieldGroup label="Description" hint="Tell drivers what to expect — access, parking, nearby amenities.">
        <textarea
          className={cn(inputCls, 'h-auto resize-none py-2.5')}
          rows={5}
          value={data.description ?? ''}
          onChange={(e) => onChange('description', e.target.value)}
          maxLength={2000}
        />
      </FieldGroup>
    </div>
  )
}

function LocationTab({
  data, onChange,
}: {
  data: ListingData
  onChange: (field: keyof ListingData, value: unknown) => void
}) {
  return (
    <div className="space-y-5">
      <FieldGroup label="Address line 1">
        <input
          className={inputCls}
          value={data.addressLine1}
          onChange={(e) => onChange('addressLine1', e.target.value)}
        />
      </FieldGroup>
      <FieldGroup label="Address line 2 (optional)">
        <input
          className={inputCls}
          value={data.addressLine2 ?? ''}
          onChange={(e) => onChange('addressLine2', e.target.value)}
        />
      </FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="City">
          <input
            className={inputCls}
            value={data.city}
            onChange={(e) => onChange('city', e.target.value)}
          />
        </FieldGroup>
        <FieldGroup label="Postcode">
          <input
            className={inputCls}
            value={data.postcode}
            onChange={(e) => onChange('postcode', e.target.value)}
          />
        </FieldGroup>
      </div>
      <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
        <p className="font-medium">Map pin</p>
        <p className="mt-0.5">
          Coordinates: {data.latitude?.toFixed(5) ?? '—'},{' '}
          {data.longitude?.toFixed(5) ?? '—'}
        </p>
        <p className="mt-1 text-xs">Fine-tune your pin on the Listings map view.</p>
      </div>
    </div>
  )
}

function ChargerTab({
  data, onChange,
}: {
  data: ListingData
  onChange: (field: keyof ListingData, value: unknown) => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="Charger level">
          <select
            className={inputCls}
            value={data.chargerLevel}
            onChange={(e) => onChange('chargerLevel', e.target.value)}
          >
            <option value="level_1">Level 1 (slow)</option>
            <option value="level_2">Level 2 (fast AC)</option>
            <option value="dc_fast">DC Fast</option>
            <option value="dc_ultra_fast">DC Ultra-fast</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Max power (kW)">
          <input
            type="number"
            className={inputCls}
            value={data.maxPowerKw}
            min={1}
            max={400}
            step={0.1}
            onChange={(e) => onChange('maxPowerKw', parseFloat(e.target.value))}
          />
        </FieldGroup>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="Brand (optional)">
          <input
            className={inputCls}
            value={data.chargerBrand ?? ''}
            onChange={(e) => onChange('chargerBrand', e.target.value)}
            placeholder="Easee, Ohme, Zappi…"
          />
        </FieldGroup>
        <FieldGroup label="Model (optional)">
          <input
            className={inputCls}
            value={data.chargerModel ?? ''}
            onChange={(e) => onChange('chargerModel', e.target.value)}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="OCPP Charge Point ID" hint="Only required if you want remote start/stop control.">
        <input
          className={inputCls}
          value={data.ocppChargePointId ?? ''}
          onChange={(e) => onChange('ocppChargePointId', e.target.value)}
          placeholder="CP-001"
          spellCheck={false}
        />
      </FieldGroup>
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={data.isSmartCharger}
          onChange={(e) => onChange('isSmartCharger', e.target.checked)}
          className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
        />
        <div>
          <span className="text-sm font-medium">Smart charger</span>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Supports OCPP remote start/stop and smart scheduling
          </p>
        </div>
      </label>
    </div>
  )
}

function PricingTab({
  data, onChange,
}: {
  data: ListingData
  onChange: (field: keyof ListingData, value: unknown) => void
}) {
  return (
    <div className="space-y-5">
      <FieldGroup label="Pricing model">
        <select
          className={inputCls}
          value={data.pricingModel}
          onChange={(e) => onChange('pricingModel', e.target.value)}
        >
          <option value="per_kwh">Per kWh</option>
          <option value="per_hour">Per hour</option>
          <option value="per_session">Per session (flat rate)</option>
          <option value="hybrid">Hybrid (flat fee + per kWh)</option>
        </select>
      </FieldGroup>

      {(data.pricingModel === 'per_kwh' || data.pricingModel === 'hybrid') && (
        <FieldGroup label="Price per kWh (pence)" hint="e.g. 28 = £0.28/kWh">
          <input
            type="number"
            className={inputCls}
            value={data.pricePerKwhPence ?? ''}
            min={1}
            max={9999}
            onChange={(e) => onChange('pricePerKwhPence', parseInt(e.target.value, 10))}
          />
        </FieldGroup>
      )}
      {data.pricingModel === 'per_hour' && (
        <FieldGroup label="Price per hour (pence)" hint="e.g. 250 = £2.50/hr">
          <input
            type="number"
            className={inputCls}
            value={data.pricePerHourPence ?? ''}
            min={1}
            max={9999}
            onChange={(e) => onChange('pricePerHourPence', parseInt(e.target.value, 10))}
          />
        </FieldGroup>
      )}
      {(data.pricingModel === 'per_session' || data.pricingModel === 'hybrid') && (
        <FieldGroup
          label="Session fee (pence)"
          hint={data.pricingModel === 'hybrid' ? 'Flat fee charged per session, on top of the kWh rate.' : 'e.g. 500 = £5.00 flat'}
        >
          <input
            type="number"
            className={inputCls}
            value={data.pricePerSessionPence ?? ''}
            min={1}
            max={99999}
            onChange={(e) => onChange('pricePerSessionPence', parseInt(e.target.value, 10))}
          />
        </FieldGroup>
      )}

      <FieldGroup label="Idle fee per minute (pence)" hint="Charged after 10-minute grace period. 0 = no idle fee.">
        <input
          type="number"
          className={inputCls}
          value={data.idleFeePerMinPence}
          min={0}
          max={500}
          onChange={(e) => onChange('idleFeePerMinPence', parseInt(e.target.value, 10))}
        />
      </FieldGroup>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={data.instantBookEnabled}
          onChange={(e) => onChange('instantBookEnabled', e.target.checked)}
          className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
        />
        <div>
          <span className="text-sm font-medium">Instant book</span>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Drivers can book without waiting for your approval
          </p>
        </div>
      </label>
    </div>
  )
}

function AccessTab({
  data, onChange,
}: {
  data: ListingData
  onChange: (field: keyof ListingData, value: unknown) => void
}) {
  const amenities: Array<{ key: keyof ListingData; label: string }> = [
    { key: 'wifiAvailable',        label: 'WiFi available' },
    { key: 'restroomAvailable',    label: 'Restroom nearby' },
    { key: 'shelterAvailable',     label: 'Shelter / covered parking' },
    { key: 'lightingAvailable',    label: 'Good lighting' },
    { key: 'wheelchairAccessible', label: 'Wheelchair accessible' },
    { key: 'evParkingOnly',        label: 'EV-only parking bay' },
  ]
  return (
    <div className="space-y-5">
      <FieldGroup label="Access type">
        <select
          className={inputCls}
          value={data.accessType}
          onChange={(e) => onChange('accessType', e.target.value)}
        >
          <option value="always_open">Always open</option>
          <option value="gate_code">Gate code</option>
          <option value="buzz_in">Buzz in / intercom</option>
          <option value="key_pickup">Key pickup</option>
          <option value="app_unlock">App unlock (OCPP)</option>
        </select>
      </FieldGroup>
      <FieldGroup label="Access instructions" hint="Shared with the driver only after a booking is confirmed.">
        <textarea
          className={cn(inputCls, 'h-auto resize-none py-2.5')}
          rows={4}
          value={data.accessInstructions ?? ''}
          onChange={(e) => onChange('accessInstructions', e.target.value)}
          maxLength={1000}
          placeholder="Gate code is 1234. Press the intercom button on arrival."
        />
      </FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="Min booking (hours)" hint="Shortest session a driver can book.">
          <input
            type="number"
            className={inputCls}
            value={data.minBookingHours}
            min={0.5}
            max={24}
            step={0.5}
            onChange={(e) => onChange('minBookingHours', parseFloat(e.target.value))}
          />
        </FieldGroup>
        <FieldGroup label="Max booking (hours)" hint="Longest session a driver can book.">
          <input
            type="number"
            className={inputCls}
            value={data.maxBookingHours}
            min={1}
            max={72}
            step={0.5}
            onChange={(e) => onChange('maxBookingHours', parseFloat(e.target.value))}
          />
        </FieldGroup>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Amenities</legend>
        <div className="space-y-2">
          {amenities.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(data[key])}
                onChange={(e) => onChange(key, e.target.checked)}
                className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

/* ── Schedule types ──────────────────────────────────────── */

type ScheduleDay = {
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  openTime: string
  closeTime: string
  isAvailable: boolean
}

const ALL_DAYS: ScheduleDay['dayOfWeek'][] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]

const DAY_LABELS: Record<ScheduleDay['dayOfWeek'], string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

function defaultSchedule(): ScheduleDay[] {
  return ALL_DAYS.map((d) => ({
    dayOfWeek: d,
    openTime: '08:00',
    closeTime: '20:00',
    isAvailable: d !== 'sunday',
  }))
}

/* ── ScheduleTab ─────────────────────────────────────────── */

function ScheduleTab({ listingId }: { listingId: string }) {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [blackouts, setBlackouts] = useState<string[]>([])
  const [newBlackout, setNewBlackout] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleSuccess, setScheduleSuccess] = useState(false)
  const [blackoutError, setBlackoutError] = useState<string | null>(null)

  /* Load schedule + next 90 days of blackouts on mount */
  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [schedRes, blkRes] = await Promise.all([
          fetch(`/api/v1/listings/${listingId}/schedule`),
          fetch(`/api/v1/listings/${listingId}/blackout?from=${todayStr()}&to=${plusDays(90)}`),
        ])
        if (schedRes.ok) {
          const json = (await schedRes.json()) as { data: ScheduleDay[] }
          setSchedule(json.data.length > 0 ? json.data : defaultSchedule())
        } else {
          setSchedule(defaultSchedule())
        }
        if (blkRes.ok) {
          const json = (await blkRes.json()) as { data: string[] }
          setBlackouts(json.data ?? [])
        }
      } catch {
        setSchedule(defaultSchedule())
      } finally {
        setLoading(false)
      }
    })()
  }, [listingId])

  function todayStr() {
    return new Date().toISOString().split('T')[0]!
  }
  function plusDays(n: number) {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]!
  }

  function updateDay(dayOfWeek: ScheduleDay['dayOfWeek'], patch: Partial<ScheduleDay>) {
    setSchedule((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)),
    )
    setScheduleSuccess(false)
  }

  async function saveSchedule() {
    setSaving(true)
    setScheduleError(null)
    setScheduleSuccess(false)
    try {
      const res = await fetch(`/api/v1/listings/${listingId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        throw new Error(body.error?.message ?? 'Save failed')
      }
      setScheduleSuccess(true)
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  async function addBlackout() {
    if (!newBlackout) return
    setBlackoutError(null)
    try {
      const res = await fetch(`/api/v1/listings/${listingId}/blackout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newBlackout }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        throw new Error(body.error?.message ?? 'Could not add blackout')
      }
      setBlackouts((prev) => [...prev, newBlackout].sort())
      setNewBlackout('')
    } catch (err) {
      setBlackoutError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  async function removeBlackout(date: string) {
    setBlackoutError(null)
    try {
      const res = await fetch(
        `/api/v1/listings/${listingId}/blackout?date=${encodeURIComponent(date)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('Could not remove blackout')
      setBlackouts((prev) => prev.filter((d) => d !== date))
    } catch (err) {
      setBlackoutError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  function formatDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" aria-label="Loading schedule" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Weekly availability ── */}
      <section aria-labelledby="weekly-schedule-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 id="weekly-schedule-heading" className="text-sm font-semibold">Weekly availability</h2>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              Set the hours drivers can book on each day of the week.
            </p>
          </div>
          <button
            onClick={() => { void saveSchedule() }}
            disabled={saving}
            className="flex shrink-0 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Save className="h-4 w-4" aria-hidden="true" />
            }
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>

        {scheduleSuccess && (
          <div role="status" className="mb-3 rounded-[6px] bg-[hsl(var(--primary)_/_10%)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary))]">
            Schedule saved.
          </div>
        )}
        {scheduleError && (
          <div role="alert" className="mb-3 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)_/_10%)] px-4 py-2.5 text-sm text-[hsl(var(--destructive))]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {scheduleError}
          </div>
        )}

        <div className="overflow-x-auto rounded-[6px] border border-[hsl(var(--border))]">
          <table className="w-full text-sm" role="table" aria-label="Weekly schedule">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <th className="py-2.5 pl-4 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]" scope="col">Day</th>
                <th className="py-2.5 px-3 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]" scope="col">Available</th>
                <th className="py-2.5 px-3 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]" scope="col">Opens</th>
                <th className="py-2.5 px-3 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]" scope="col">Closes</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((day, idx) => (
                <tr
                  key={day.dayOfWeek}
                  className={cn(
                    'transition-colors',
                    idx !== schedule.length - 1 && 'border-b border-[hsl(var(--border))]',
                    !day.isAvailable && 'opacity-50',
                  )}
                >
                  <td className="py-3 pl-4 font-medium">{DAY_LABELS[day.dayOfWeek]}</td>
                  <td className="py-3 px-3">
                    <label className="sr-only">{DAY_LABELS[day.dayOfWeek]} available</label>
                    <input
                      type="checkbox"
                      aria-label={`${DAY_LABELS[day.dayOfWeek]} available`}
                      checked={day.isAvailable}
                      onChange={(e) => updateDay(day.dayOfWeek, { isAvailable: e.target.checked })}
                      className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day.dayOfWeek]} open time`}
                      value={day.openTime}
                      disabled={!day.isAvailable}
                      onChange={(e) => updateDay(day.dayOfWeek, { openTime: e.target.value })}
                      className={cn(
                        'h-9 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm',
                        'focus:border-[hsl(var(--primary))] focus:outline-none',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                      )}
                    />
                  </td>
                  <td className="py-3 px-3">
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day.dayOfWeek]} close time`}
                      value={day.closeTime}
                      disabled={!day.isAvailable}
                      onChange={(e) => updateDay(day.dayOfWeek, { closeTime: e.target.value })}
                      className={cn(
                        'h-9 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm',
                        'focus:border-[hsl(var(--primary))] focus:outline-none',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Blackout dates ── */}
      <section aria-labelledby="blackout-heading">
        <h2 id="blackout-heading" className="mb-1 text-sm font-semibold">Blocked dates</h2>
        <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
          Block specific dates when your charger is unavailable (holidays, maintenance, etc.).
        </p>

        {blackoutError && (
          <div role="alert" className="mb-3 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)_/_10%)] px-4 py-2.5 text-sm text-[hsl(var(--destructive))]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {blackoutError}
          </div>
        )}

        {/* Add new blackout */}
        <div className="mb-4 flex gap-2">
          <input
            type="date"
            aria-label="Blackout date"
            value={newBlackout}
            min={todayStr()}
            onChange={(e) => setNewBlackout(e.target.value)}
            className={cn(inputCls, 'flex-1')}
          />
          <button
            onClick={() => { void addBlackout() }}
            disabled={!newBlackout}
            className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Block date
          </button>
        </div>

        {/* Blackout list */}
        {blackouts.length === 0 ? (
          <p className="rounded-[6px] border border-dashed border-[hsl(var(--border))] p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No blocked dates.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Blocked dates">
            {blackouts.map((date) => (
              <li
                key={date}
                className="flex items-center justify-between rounded-[6px] border border-[hsl(var(--border))] px-4 py-2.5 text-sm"
              >
                <span>{formatDate(date)}</span>
                <button
                  onClick={() => { void removeBlackout(date) }}
                  className="text-xs font-medium text-[hsl(var(--destructive))] hover:underline"
                  aria-label={`Remove blackout for ${formatDate(date)}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────── */

export default function EditListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>
}) {
  const { listingId } = use(params)
  const router = useRouter()

  const [listing, setListing] = useState<ListingData | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('basic')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/v1/listings/${listingId}`)
        if (!res.ok) throw new Error('Listing not found')
        const data = (await res.json()) as { data: ListingData }
        setListing(data.data)
      } catch {
        setError('Could not load listing. Please go back and try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [listingId])

  function handleChange(field: keyof ListingData, value: unknown) {
    setListing((prev) => prev ? { ...prev, [field]: value } : prev)
    setSuccess(false)
  }

  async function handleSave() {
    if (!listing) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(`/api/v1/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: listing.title,
          description: listing.description,
          addressLine1: listing.addressLine1,
          addressLine2: listing.addressLine2,
          city: listing.city,
          postcode: listing.postcode,
          chargerLevel: listing.chargerLevel,
          maxPowerKw: listing.maxPowerKw,
          chargerBrand: listing.chargerBrand,
          chargerModel: listing.chargerModel,
          ocppChargePointId: listing.ocppChargePointId,
          isSmartCharger: listing.isSmartCharger,
          pricingModel: listing.pricingModel,
          pricePerKwhPence: listing.pricePerKwhPence,
          pricePerHourPence: listing.pricePerHourPence,
          pricePerSessionPence: listing.pricePerSessionPence,
          idleFeePerMinPence: listing.idleFeePerMinPence,
          instantBookEnabled: listing.instantBookEnabled,
          accessType: listing.accessType,
          accessInstructions: listing.accessInstructions,
          wifiAvailable: listing.wifiAvailable,
          restroomAvailable: listing.restroomAvailable,
          shelterAvailable: listing.shelterAvailable,
          lightingAvailable: listing.lightingAvailable,
          wheelchairAccessible: listing.wheelchairAccessible,
          evParkingOnly: listing.evParkingOnly,
          minBookingHours: listing.minBookingHours,
          maxBookingHours: listing.maxBookingHours,
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        throw new Error(body.error?.message ?? 'Save failed')
      }
      setSuccess(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
      </div>
    )
  }

  if (error && !listing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-[hsl(var(--destructive))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--primary))]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Go back
        </button>
      </div>
    )
  }

  if (!listing) return null

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.back()}
            className="mb-2 flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to listings
          </button>
          <h1 className="text-xl font-bold tracking-tight line-clamp-1">{listing.title}</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            {listing.city} · {listing.status}
          </p>
        </div>
        <button
          onClick={() => { void handleSave() }}
          disabled={saving}
          className="flex shrink-0 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Save className="h-4 w-4" aria-hidden="true" />
          }
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Feedback */}
      {success && (
        <div role="status" className="mb-4 rounded-[6px] bg-[hsl(var(--primary)_/_10%)] px-4 py-3 text-sm font-medium text-[hsl(var(--primary))]">
          Changes saved successfully.
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)_/_10%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Edit sections"
        className="mb-6 flex overflow-x-auto border-b border-[hsl(var(--border))]"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === key
                ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'basic'    && <BasicTab    data={listing} onChange={handleChange} />}
        {activeTab === 'location' && <LocationTab data={listing} onChange={handleChange} />}
        {activeTab === 'charger'  && <ChargerTab  data={listing} onChange={handleChange} />}
        {activeTab === 'pricing'  && <PricingTab  data={listing} onChange={handleChange} />}
        {activeTab === 'access'   && <AccessTab   data={listing} onChange={handleChange} />}
        {activeTab === 'schedule' && <ScheduleTab listingId={listingId} />}
      </div>

      {/* Floating save on mobile */}
      <div className="sticky bottom-4 mt-8 flex justify-end">
        <button
          onClick={() => { void handleSave() }}
          disabled={saving}
          className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Save className="h-4 w-4" aria-hidden="true" />
          }
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
