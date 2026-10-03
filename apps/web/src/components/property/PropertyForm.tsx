/**
 * @file PropertyForm.tsx
 * @description Property settings form (address, revenue split, access rules),
 * shared by /host/properties/new and the property's Settings tab.
 *
 * @module components/property
 */

'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PropertyFormValues = {
  name: string
  addressLine1: string
  addressLine2: string
  city: string
  postcode: string
  totalUnits: string
  revenueModel: 'property' | 'resident' | 'split'
  splitPropertyPct: number
  accessMode: 'residents_only' | 'public' | 'residents_priority'
  residentDiscountPct: number
}

export const EMPTY_PROPERTY: PropertyFormValues = {
  name: '', addressLine1: '', addressLine2: '', city: '', postcode: '', totalUnits: '',
  revenueModel: 'property', splitPropertyPct: 70, accessMode: 'residents_priority', residentDiscountPct: 0,
}

/** Converts form values to the API body. */
export function toPropertyBody(v: PropertyFormValues) {
  return {
    name: v.name, addressLine1: v.addressLine1, addressLine2: v.addressLine2 || null,
    city: v.city, postcode: v.postcode,
    totalUnits: v.totalUnits ? Number(v.totalUnits) : null,
    revenueModel: v.revenueModel,
    splitPropertyPct: v.revenueModel === 'split' ? v.splitPropertyPct : 100,
    accessMode: v.accessMode,
    residentDiscountPct: v.residentDiscountPct,
  }
}

export const inputClass = cn(
  'h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm',
  'text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]',
)
export const primaryButton = cn(
  'inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5 text-sm font-semibold',
  'text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50',
)
export const secondaryButton = cn(
  'inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-3 text-sm',
  'text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50',
)

const REVENUE_OPTIONS: { value: PropertyFormValues['revenueModel']; label: string; hint: string }[] = [
  { value: 'property', label: 'Property keeps it all', hint: 'Bay earnings are paid to you.' },
  { value: 'resident', label: 'Resident keeps it all', hint: "Earnings from a resident's assigned bay go to that resident." },
  { value: 'split', label: 'Split', hint: "Earnings from a resident's bay are shared between you and them." },
]

const ACCESS_OPTIONS: { value: PropertyFormValues['accessMode']; label: string; hint: string }[] = [
  { value: 'residents_priority', label: 'Residents first', hint: 'Anyone can book, but non-residents only up to 48 hours ahead.' },
  { value: 'residents_only', label: 'Residents only', hint: 'Only residents you have invited can book bays.' },
  { value: 'public', label: 'Open to everyone', hint: 'Bays are bookable by any driver.' },
]

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
      {children}
      {hint && <span className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</span>}
    </label>
  )
}

function Choice<T extends string>({ name, options, value, onChange }: {
  name: string
  options: { value: T; label: string; hint: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'flex cursor-pointer flex-col gap-1 rounded-[6px] border p-3 text-left transition-colors',
            value === o.value
              ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]'
              : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]',
          )}
        >
          <input type="radio" name={name} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{o.label}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{o.hint}</span>
        </label>
      ))}
    </div>
  )
}

/** Property settings form. `onSubmit` returns an error message to show, or null. */
export function PropertyForm({ initial, submitLabel, onSubmit, note }: {
  initial: PropertyFormValues
  submitLabel: string
  onSubmit: (values: PropertyFormValues) => Promise<string | null>
  note?: string
}) {
  const [v, setV] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof PropertyFormValues>(k: K, value: PropertyFormValues[K]) => setV((prev) => ({ ...prev, [k]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      setError(await onSubmit(v))
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Building</h2>
        <Field label="Name"><input required minLength={2} maxLength={150} className={inputClass} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Harbour View Apartments" /></Field>
        <Field label="Address line 1"><input required minLength={3} maxLength={200} className={inputClass} value={v.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} /></Field>
        <Field label="Address line 2 (optional)"><input maxLength={100} className={inputClass} value={v.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City"><input required minLength={2} maxLength={100} className={inputClass} value={v.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="Postcode"><input required maxLength={10} className={inputClass} value={v.postcode} onChange={(e) => set('postcode', e.target.value)} /></Field>
          <Field label="Homes (optional)"><input type="number" min={1} max={10000} className={inputClass} value={v.totalUnits} onChange={(e) => set('totalUnits', e.target.value)} /></Field>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Who can book</h2>
        <Choice name="accessMode" options={ACCESS_OPTIONS} value={v.accessMode} onChange={(x) => set('accessMode', x)} />
        <Field label={`Resident discount: ${v.residentDiscountPct}%`} hint="Taken off the charging tariff when a resident books. Idle fees are not discounted.">
          <input type="range" min={0} max={50} step={5} value={v.residentDiscountPct} onChange={(e) => set('residentDiscountPct', Number(e.target.value))} />
        </Field>
      </section>

      <section className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Revenue</h2>
        <Choice name="revenueModel" options={REVENUE_OPTIONS} value={v.revenueModel} onChange={(x) => set('revenueModel', x)} />
        {v.revenueModel === 'split' && (
          <Field label={`Property ${v.splitPropertyPct}% · Resident ${100 - v.splitPropertyPct}%`}>
            <input type="range" min={5} max={95} step={5} value={v.splitPropertyPct} onChange={(e) => set('splitPropertyPct', Number(e.target.value))} />
          </Field>
        )}
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Bays with no assigned resident always pay you. Residents need a payout account to receive their share.
          {note ? ` ${note}` : ''}
        </p>
      </section>

      {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
      <div>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {submitLabel}
        </button>
      </div>
    </form>
  )
}
