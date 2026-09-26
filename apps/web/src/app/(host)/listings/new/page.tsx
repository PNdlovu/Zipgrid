/**
 * @file page.tsx
 * @description /host/listings/new — Full 7-step listing builder wizard.
 * Steps: 1 Basic info → 2 Location → 3 Charger specs → 4 Pricing →
 *        5 Access & amenities → 6 Photos → 7 Schedule & publish
 *
 * @module apps/web/app/(host)/listings/new
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  MapPin, Zap, PoundSterling, Shield, Camera,
  CalendarDays, CheckCircle2, ArrowLeft, ArrowRight, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Schema ─────────────────────────────────────────────────── */

const ListingSchema = z.object({
  // Step 1 — Basic info
  title: z.string().min(5, 'Title must be at least 5 characters').max(120),
  description: z.string().max(2000).optional(),
  // Step 2 — Location
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  city: z.string().min(2),
  postcode: z.string().min(5, 'Enter a valid UK postcode'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  // Step 3 — Charger specs
  chargerLevel: z.enum(['level_1', 'level_2', 'dc_fast', 'dc_ultra_fast']),
  maxPowerKw: z.coerce.number().positive().max(400),
  numPorts: z.coerce.number().int().min(1).max(20).optional(),
  chargerBrand: z.string().optional(),
  chargerModel: z.string().optional(),
  plugType2: z.boolean().optional(),
  plugCcs2: z.boolean().optional(),
  plugChademo: z.boolean().optional(),
  plugNacs: z.boolean().optional(),
  isSmartCharger: z.boolean().optional(),
  ocppChargePointId: z.string().optional(),
  // Step 4 — Pricing
  pricingModel: z.enum(['per_kwh', 'per_hour', 'per_session', 'hybrid']),
  pricePerKwhPence: z.coerce.number().int().nonnegative().optional(),
  pricePerHourPence: z.coerce.number().int().nonnegative().optional(),
  pricePerSessionPence: z.coerce.number().int().nonnegative().optional(),
  idleFeePerMinPence: z.coerce.number().int().nonnegative().optional(),
  instantBookEnabled: z.boolean().optional(),
  // Step 5 — Access & amenities
  accessType: z.enum(['always_open', 'gate_code', 'buzz_in', 'key_pickup', 'app_unlock']),
  accessInstructions: z.string().max(1000).optional(),
  wifiAvailable: z.boolean().optional(),
  restroomAvailable: z.boolean().optional(),
  shelterAvailable: z.boolean().optional(),
  lightingAvailable: z.boolean().optional(),
  evParkingOnly: z.boolean().optional(),
})

type ListingFormValues = z.infer<typeof ListingSchema>

/* ── Step metadata ──────────────────────────────────────────── */

const STEPS = [
  { number: 1, label: 'Basics', icon: CheckCircle2 },
  { number: 2, label: 'Location', icon: MapPin },
  { number: 3, label: 'Charger', icon: Zap },
  { number: 4, label: 'Pricing', icon: PoundSterling },
  { number: 5, label: 'Access', icon: Shield },
  { number: 6, label: 'Photos', icon: Camera },
  { number: 7, label: 'Publish', icon: CalendarDays },
] as const

/* ── Field wrapper ──────────────────────────────────────────── */

function Field({ label, error, hint, children }: {
  label: string
  error?: string | undefined
  hint?: string | undefined
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
      {error && <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{error}</p>}
    </div>
  )
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { error?: string | undefined }
function Input({ error, className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-[6px] border bg-[hsl(var(--background))] px-3.5 text-sm',
        'text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]',
        'focus:border-[hsl(var(--primary))] focus:outline-none',
        error ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]',
        className,
      )}
      {...props}
    />
  )
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string | undefined }
function Select({ error, className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-[6px] border bg-[hsl(var(--background))] px-3.5 text-sm',
        'text-[hsl(var(--foreground))] focus:border-[hsl(var(--primary))] focus:outline-none',
        error ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

/* ── Step forms ─────────────────────────────────────────────── */

function Step1({ form }: { form: UseFormReturn<ListingFormValues> }) {
  const { register, formState: { errors } } = form
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Tell drivers about your charger</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">A clear title and description get more bookings.</p>
      </div>
      <Field label="Listing title" error={errors.title?.message}>
        <Input {...register('title')} placeholder="e.g. Fast Level 2 in Quiet Earlsfield Driveway" error={errors.title?.message} />
      </Field>
      <Field label="Description (optional)" hint="Tell drivers what to expect — parking, access, nearby amenities.">
        <textarea
          {...register('description')}
          rows={4}
          placeholder="My driveway is easy to find — look for the green gate. Street parking available nearby. Café 3 minutes' walk."
          className={cn(
            'w-full rounded-[6px] border bg-[hsl(var(--background))] px-3.5 py-2.5 text-sm',
            'text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]',
            'focus:border-[hsl(var(--primary))] focus:outline-none resize-none border-[hsl(var(--border))]',
          )}
        />
      </Field>
    </div>
  )
}

function Step2({ form }: { form: UseFormReturn<ListingFormValues> }) {
  const { register, formState: { errors } } = form
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Where is your charger?</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Your exact address is never shown to drivers until booking is confirmed.
        </p>
      </div>
      <Field label="Address line 1" error={errors.addressLine1?.message}>
        <Input {...register('addressLine1')} placeholder="12 Oak Street" error={errors.addressLine1?.message} autoComplete="address-line1" />
      </Field>
      <Field label="Address line 2 (optional)">
        <Input {...register('addressLine2')} placeholder="Flat 3" autoComplete="address-line2" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" error={errors.city?.message}>
          <Input {...register('city')} placeholder="London" error={errors.city?.message} autoComplete="address-level2" />
        </Field>
        <Field label="Postcode" error={errors.postcode?.message}>
          <Input {...register('postcode')} placeholder="SW18 1AA" error={errors.postcode?.message} autoComplete="postal-code" />
        </Field>
      </div>
      <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
        <MapPin className="mb-2 h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
        Map pin placement is available after your listing is created. You can drag the pin to the exact location in listing settings.
      </div>
    </div>
  )
}

function Step3({ form }: { form: UseFormReturn<ListingFormValues> }) {
  const { register, watch, formState: { errors } } = form
  const isSmartCharger = watch('isSmartCharger')
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Charger specifications</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Drivers filter by these specs to find compatible chargers.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand (optional)">
          <Input {...register('chargerBrand')} placeholder="EO Charging" />
        </Field>
        <Field label="Model (optional)">
          <Input {...register('chargerModel')} placeholder="EO Mini Pro 3" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Charger level" error={errors.chargerLevel?.message}>
          <Select {...register('chargerLevel')} error={errors.chargerLevel?.message}>
            <option value="">Select level…</option>
            <option value="level_1">Level 1 (3kW, 120V)</option>
            <option value="level_2">Level 2 (7–22kW, 240V)</option>
            <option value="dc_fast">DC Fast (50–150kW)</option>
            <option value="dc_ultra_fast">DC Ultra Fast (150kW+)</option>
          </Select>
        </Field>
        <Field label="Max power (kW)" error={errors.maxPowerKw?.message} hint="e.g. 7.4 for typical home charger">
          <Input {...register('maxPowerKw')} type="number" step="0.1" placeholder="7.4" error={errors.maxPowerKw?.message} />
        </Field>
      </div>
      {/* Plug types */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-[hsl(var(--foreground))]">Plug types available</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { field: 'plugType2', label: 'Type 2' },
            { field: 'plugCcs2', label: 'CCS 2' },
            { field: 'plugChademo', label: 'CHAdeMO' },
            { field: 'plugNacs', label: 'NACS' },
          ].map(({ field, label }) => (
            <label key={field} className={cn(
              'flex cursor-pointer items-center gap-2 rounded-[6px] border p-3 text-sm font-medium transition-colors',
              'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.4)]',
            )}>
              <input type="checkbox" className="accent-[hsl(var(--primary))]" {...register(field as keyof ListingFormValues)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {/* Smart charger toggle */}
      <label className="flex cursor-pointer items-center gap-3">
        <input type="checkbox" className="accent-[hsl(var(--primary))]" {...register('isSmartCharger')} />
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">This is a smart (OCPP) charger</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Enables real-time session monitoring and remote control</p>
        </div>
      </label>
      {isSmartCharger && (
        <Field label="OCPP Charge Point ID" hint="Already paired your charger? Link it here. Otherwise pair it later.">
          <Input {...register('ocppChargePointId')} placeholder="e.g. EO-HOME-00042" className="font-mono" />
        </Field>
      )}
    </div>
  )
}

function Step4({ form }: { form: UseFormReturn<ListingFormValues> }) {
  const { register, watch, formState: { errors } } = form
  const pricingModel = watch('pricingModel')
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Set your price</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Average hosts earn £0.30–£0.45/kWh. Set a competitive price to attract your first bookings.
        </p>
      </div>
      <Field label="Pricing model" error={errors.pricingModel?.message}>
        <Select {...register('pricingModel')} error={errors.pricingModel?.message}>
          <option value="">Select model…</option>
          <option value="per_kwh">Per kWh — fairest, most popular</option>
          <option value="per_hour">Per hour</option>
          <option value="per_session">Flat per session</option>
          <option value="hybrid">Hybrid (session fee + per kWh)</option>
        </Select>
      </Field>
      {(pricingModel === 'per_kwh' || pricingModel === 'hybrid') && (
        <Field label="Price per kWh (pence)" error={errors.pricePerKwhPence?.message} hint="e.g. 35 = £0.35/kWh">
          <Input {...register('pricePerKwhPence')} type="number" min={0} placeholder="35" error={errors.pricePerKwhPence?.message} />
        </Field>
      )}
      {(pricingModel === 'per_hour') && (
        <Field label="Price per hour (pence)" error={errors.pricePerHourPence?.message} hint="e.g. 150 = £1.50/hr">
          <Input {...register('pricePerHourPence')} type="number" min={0} placeholder="150" error={errors.pricePerHourPence?.message} />
        </Field>
      )}
      {(pricingModel === 'per_session' || pricingModel === 'hybrid') && (
        <Field label="Session fee (pence)" error={errors.pricePerSessionPence?.message} hint="e.g. 100 = £1.00 per session">
          <Input {...register('pricePerSessionPence')} type="number" min={0} placeholder="100" error={errors.pricePerSessionPence?.message} />
        </Field>
      )}
      <Field label="Idle fee per minute (pence)" hint="Charged if driver stays plugged in after session ends. Default: 10p/min.">
        <Input {...register('idleFeePerMinPence')} type="number" min={0} placeholder="10" />
      </Field>
      <label className="flex cursor-pointer items-center gap-3">
        <input type="checkbox" defaultChecked className="accent-[hsl(var(--primary))]" {...register('instantBookEnabled')} />
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">Enable Instant Book</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Drivers can book immediately without waiting for your approval</p>
        </div>
      </label>
    </div>
  )
}

function Step5({ form }: { form: UseFormReturn<ListingFormValues> }) {
  const { register, watch } = form
  const accessType = watch('accessType')
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Access and amenities</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Help drivers understand what to expect when they arrive.</p>
      </div>
      <Field label="Access type">
        <Select {...register('accessType')}>
          <option value="always_open">Always open — no code or key needed</option>
          <option value="gate_code">Gate code or PIN pad</option>
          <option value="buzz_in">Ring / buzz in — I let you in remotely</option>
          <option value="key_pickup">Key or fob collection from me</option>
          <option value="app_unlock">App unlock via Zipgrid</option>
        </Select>
      </Field>
      {accessType !== 'always_open' && (
        <Field label="Access instructions" hint="These are only shown to drivers after booking is confirmed. They are encrypted in storage.">
          <textarea
            {...register('accessInstructions')}
            rows={3}
            placeholder="e.g. Gate code is 1234. Press * then the code. Call me if the keypad doesn't respond."
            className={cn(
              'w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
              'px-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]',
              'focus:border-[hsl(var(--primary))] focus:outline-none resize-none',
            )}
          />
        </Field>
      )}
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">Amenities</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            { field: 'wifiAvailable', label: 'Wi-Fi available' },
            { field: 'restroomAvailable', label: 'Toilets nearby' },
            { field: 'shelterAvailable', label: 'Covered / garage' },
            { field: 'lightingAvailable', label: 'Lighting' },
            { field: 'evParkingOnly', label: 'EV-only bay' },
          ].map(({ field, label }) => (
            <label key={field} className="flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <input type="checkbox" className="accent-[hsl(var(--primary))]" {...register(field as keyof ListingFormValues)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function Step6() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Add photos</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Listings with photos get 3× more bookings. Show the charger, driveway, and access point.
        </p>
      </div>
      {/* Photo upload — CDN pre-signed URL flow implemented in Module C Phase 2 */}
      <div className={cn(
        'flex flex-col items-center gap-4 rounded-[6px] border-2 border-dashed',
        'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] py-12 text-center',
      )}>
        <Camera className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.5)]" aria-hidden="true" strokeWidth={1} />
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">Upload photos</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Min 1, max 10 photos · JPG or PNG · Max 10MB each</p>
        </div>
        <button
          type="button"
          className={cn(
            'flex h-9 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))]',
            'bg-[hsl(var(--card))] px-4 text-sm font-medium text-[hsl(var(--foreground))]',
            'hover:border-[hsl(var(--primary)/0.4)] transition-colors',
          )}
        >
          <Camera className="h-4 w-4" aria-hidden="true" /> Choose photos
        </button>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">You can add photos after publishing your listing</p>
      </div>
    </div>
  )
}

function Step7({ listingId }: { listingId: string | null }) {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)

  const handlePublish = async () => {
    if (!listingId) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/v1/listings/${listingId}/publish`, { method: 'POST' })
      if (res.ok) {
        setPublished(true)
        setTimeout(() => router.push('/host/listings'), 2000)
      }
    } finally {
      setPublishing(false)
    }
  }

  if (published) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        <div>
          <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Your listing is live!</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Drivers can now find and book your charger.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Ready to publish?</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Review your listing, then hit publish. You can edit anything after going live.
        </p>
      </div>
      <div className="rounded-[6px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.05)] p-5">
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Before you publish</p>
        <ul className="mt-3 flex flex-col gap-2">
          {[
            'Make sure your access instructions are clear',
            'Double-check your pricing — you can change it any time',
            'Set your availability schedule after publishing',
            'Your exact address stays hidden until booking is confirmed',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={handlePublish}
        disabled={publishing || !listingId}
        aria-busy={publishing}
        className={cn(
          'flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
          'text-base font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {publishing ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Publishing…</> : <>Publish listing <Zap className="h-4 w-4" aria-hidden="true" /></>}
      </button>
      <button
        type="button"
        onClick={() => router.push('/host/listings')}
        className="text-center text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        Save as draft and publish later
      </button>
    </div>
  )
}

/* ── Main wizard ────────────────────────────────────────────── */

/**
 * Listing builder wizard — 7 steps.
 */
export default function NewListingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [listingId, setListingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(ListingSchema),
    defaultValues: {
      chargerLevel: 'level_2',
      pricingModel: 'per_kwh',
      accessType: 'always_open',
      instantBookEnabled: true,
      idleFeePerMinPence: 10,
    },
  })

  const saveProgress = async () => {
    setSaveError(null)
    const data = form.getValues()
    const plugTypes: string[] = []
    if (data.plugType2) plugTypes.push('type_2')
    if (data.plugCcs2) plugTypes.push('ccs_2')
    if (data.plugChademo) plugTypes.push('chademo')
    if (data.plugNacs) plugTypes.push('nacs')
    if (plugTypes.length === 0) plugTypes.push('type_2')

    const body = {
      title: data.title || 'Draft listing',
      description: data.description,
      addressLine1: data.addressLine1 || '—',
      city: data.city || '—',
      postcode: data.postcode || '—',
      latitude: data.latitude ?? 51.5,
      longitude: data.longitude ?? -0.12,
      chargerLevel: data.chargerLevel || 'level_2',
      plugTypes,
      maxPowerKw: data.maxPowerKw || 7.4,
      pricingModel: data.pricingModel || 'per_kwh',
      pricePerKwhPence: data.pricePerKwhPence,
      accessType: data.accessType || 'always_open',
    }

    try {
      if (listingId) {
        await fetch(`/api/v1/listings/${listingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        const res = await fetch('/api/v1/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json() as { success: boolean; data?: { id: string }; error?: { message: string } }
        if (!res.ok || !json.success) {
          setSaveError(json.error?.message ?? 'Failed to save listing')
          return false
        }
        setListingId(json.data!.id)
      }
      return true
    } catch {
      setSaveError('Network error — please check your connection')
      return false
    }
  }

  const handleNext = async () => {
    setSaving(true)
    // Validate current step fields
    const fieldsToValidate: (keyof ListingFormValues)[][] = [
      ['title'],
      ['addressLine1', 'city', 'postcode'],
      ['chargerLevel', 'maxPowerKw'],
      ['pricingModel'],
      ['accessType'],
      [],
      [],
    ]
    const stepFields = fieldsToValidate[currentStep - 1] ?? []
    const valid = stepFields.length === 0 || await form.trigger(stepFields)

    if (!valid) { setSaving(false); return }

    if (currentStep <= 5) {
      await saveProgress()
    }

    setSaving(false)
    setCurrentStep((s) => Math.min(7, s + 1) as typeof currentStep)
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => currentStep > 1 ? setCurrentStep((s) => s - 1) : router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Create a listing</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Step {currentStep} of 7 — {STEPS[currentStep - 1]?.label}</p>
        </div>
      </div>

      {/* Step indicator */}
      <nav aria-label={`Step ${currentStep} of 7`} className="flex gap-1 overflow-x-auto">
        {STEPS.map(({ number, label }) => (
          <div
            key={number}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors',
              number === currentStep
                ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]'
                : number < currentStep
                  ? 'text-[hsl(var(--primary)/0.7)]'
                  : 'text-[hsl(var(--muted-foreground))]',
            )}
            aria-current={number === currentStep ? 'step' : undefined}
          >
            {number < currentStep && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            {label}
          </div>
        ))}
      </nav>

      {/* Step content */}
      <div className="mx-auto w-full max-w-lg">
        {currentStep === 1 && <Step1 form={form} />}
        {currentStep === 2 && <Step2 form={form} />}
        {currentStep === 3 && <Step3 form={form} />}
        {currentStep === 4 && <Step4 form={form} />}
        {currentStep === 5 && <Step5 form={form} />}
        {currentStep === 6 && <Step6 />}
        {currentStep === 7 && <Step7 listingId={listingId} />}

        {saveError && (
          <p role="alert" className="mt-4 text-sm text-[hsl(var(--destructive))]">{saveError}</p>
        )}

        {currentStep < 7 && (
          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => router.push('/host/listings')}
              className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={saving}
              aria-busy={saving}
              className={cn(
                'flex h-10 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5',
                'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <>Next <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
