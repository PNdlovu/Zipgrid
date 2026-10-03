/**
 * @file page.tsx
 * @description /onboarding — Voice-guided host setup wizard.
 *
 * profile → location → charger → safety → pricing → availability → payouts → publish
 *
 * Answers are kept in one draft (persisted to sessionStorage so the Stripe
 * redirect doesn't lose them). "Go live" creates the listing, saves its weekly
 * schedule and safety declarations, then publishes it — any failure is shown
 * and nothing claims success that didn't happen.
 *
 * @module apps/web/app/(host)/onboarding
 */

'use client'

import { Suspense, useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle2, ChevronRight, Loader2, Mic, Home, MapPin,
  Zap, Shield, PoundSterling, Calendar, CreditCard, Rocket, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VoiceButton } from '@/components/voice/VoiceButton'

/* ── Draft ──────────────────────────────────────────────────── */

type PricingModel = 'per_kwh' | 'per_hour' | 'per_session'

type Draft = {
  hostType: 'residential' | 'commercial'
  name: string
  title: string
  addressLine1: string
  city: string
  postcode: string
  accessType: 'always_open' | 'gate_code' | 'buzz_in' | 'key_pickup' | 'app_unlock'
  accessInstructions: string
  level: 'level_2' | 'dc_fast' | 'dc_ultra_fast'
  maxKw: string
  plugTypes: string[]
  brand: string
  isSmart: boolean
  ocppId: string
  rcd: boolean | null
  electrician: boolean | null
  installYear: string
  tosAccepted: boolean
  pricingModel: PricingModel
  kwhPrice: string
  hourPrice: string
  sessionPrice: string
  idleFee: string
  activeDays: string[]
  openTime: string
  closeTime: string
  instantBook: boolean
  listingId: string | null
}

const INITIAL: Draft = {
  hostType: 'residential', name: '', title: '', addressLine1: '', city: '', postcode: '',
  accessType: 'always_open', accessInstructions: '',
  level: 'level_2', maxKw: '7', plugTypes: ['Type2'], brand: '', isSmart: false, ocppId: '',
  rcd: null, electrician: null, installYear: '', tosAccepted: false,
  pricingModel: 'per_hour', kwhPrice: '0.28', hourPrice: '2.50', sessionPrice: '5.00', idleFee: '0.10',
  activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], openTime: '08:00', closeTime: '18:00',
  instantBook: true, listingId: null,
}

const DRAFT_KEY = 'zg_onboarding_draft'
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const pence = (pounds: string) => Math.round(Number.parseFloat(pounds || '0') * 100)

type StepProps = { draft: Draft; update: (patch: Partial<Draft>) => void; onNext: () => void }

/** POSTs/PATCHes JSON and throws the API's error message on failure. */
async function send(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
  if (!res.ok || json.success === false) throw new Error(json.error?.message ?? 'Something went wrong — please try again.')
  return json.data ?? {}
}

/* ── Step definitions ───────────────────────────────────────── */

type StepId = 'welcome' | 'profile' | 'location' | 'charger' | 'safety' | 'pricing' | 'availability' | 'stripe' | 'publish'

const STEPS: Array<{ id: StepId; label: string; voiceHint: string }> = [
  { id: 'welcome',      label: 'Welcome',        voiceHint: 'Say "next" to continue or ask me any question.' },
  { id: 'profile',      label: 'Your profile',   voiceHint: "Tell me your name and whether you're a homeowner or business." },
  { id: 'location',     label: 'Location',       voiceHint: 'Where is your charger? Tell me the street address and postcode.' },
  { id: 'charger',      label: 'Charger setup',  voiceHint: 'Tell me your charger brand, speed in kilowatts, and plug type.' },
  { id: 'safety',       label: 'Safety check',   voiceHint: 'Was your charger installed by a qualified electrician? Does it have RCD protection?' },
  { id: 'pricing',      label: 'Set your price', voiceHint: 'How would you like to charge drivers — per hour or a flat fee?' },
  { id: 'availability', label: 'Availability',   voiceHint: 'Which days and hours is your charger available? For example, weekdays 9am to 5pm.' },
  { id: 'stripe',       label: 'Get paid',       voiceHint: 'We use Stripe to pay you out weekly. Say "set up payments" to continue.' },
  { id: 'publish',      label: 'Go live!',       voiceHint: 'Your charger is ready to list. Say "publish" to go live and start earning.' },
]

/* ── Shared UI ──────────────────────────────────────────────── */

function NextButton({ onClick, disabled, busy, children }: { onClick: () => void; disabled?: boolean; busy?: boolean; children?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children ?? <>Continue <ChevronRight className="h-4 w-4" /></>}
    </button>
  )
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {message}
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

/* ── Steps ──────────────────────────────────────────────────── */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <Zap className="h-10 w-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900">Welcome to Zipgrid</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">
        You&apos;re about to list your EV charger and start earning. This wizard takes about 5 minutes.
        You can use your voice or type at each step.
      </p>
      <div className="mt-6 rounded-xl border border-green-100 bg-green-50 p-4 text-left">
        <p className="mb-2 text-sm font-semibold text-green-800">What you&apos;ll need:</p>
        <ul className="space-y-1.5 text-sm text-green-700">
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> The charger&apos;s address and postcode</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Its make and power output</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Your bank details (for payouts — can be done later)</li>
        </ul>
      </div>
      <NextButton onClick={onNext}>Get started <ChevronRight className="h-4 w-4" /></NextButton>
    </div>
  )
}

function ProfileStep({ draft, update, onNext }: StepProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await send('/api/v1/host/profile', 'PATCH', { hostType: draft.hostType, displayName: draft.name.trim() })
      onNext()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Tell us about you</h2>
      <p className="mb-5 text-sm text-gray-500">Are you listing a home charger or a business charger?</p>
      <div className="mb-5 grid grid-cols-2 gap-3">
        {(['residential', 'commercial'] as const).map((t) => (
          <button
            key={t}
            onClick={() => update({ hostType: t })}
            className={cn('rounded-xl border-2 p-4 text-center transition-colors', draft.hostType === t ? 'border-green-500 bg-green-50' : 'border-gray-200')}
          >
            <span className="text-2xl">{t === 'residential' ? '🏠' : '🏢'}</span>
            <p className="mt-1 text-sm font-semibold text-gray-900">{t === 'residential' ? 'Home charger' : 'Business charger'}</p>
          </button>
        ))}
      </div>
      <Field label="Your name / business name">
        <input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Sarah or Green Energy Ltd" className={inputClass} />
      </Field>
      <ErrorNote message={error} />
      <NextButton onClick={() => void handleSave()} disabled={draft.name.trim().length < 2} busy={saving} />
    </div>
  )
}

function LocationStep({ draft, update, onNext }: StepProps) {
  const ready = draft.title.trim().length >= 5 && draft.addressLine1.trim().length >= 3 && draft.city.trim().length >= 2 && draft.postcode.trim().length >= 5
  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Where is your charger?</h2>
      <p className="mb-5 text-sm text-gray-500">Drivers see the street and area; exact access details are only shared once a booking is confirmed.</p>
      <Field label="Listing title">
        <input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. 7kW driveway charger near Clapham Common" className={inputClass} maxLength={120} />
      </Field>
      <Field label="Street address">
        <input value={draft.addressLine1} onChange={(e) => update({ addressLine1: e.target.value })} placeholder="12 Example Road" className={inputClass} autoComplete="address-line1" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Town / city">
          <input value={draft.city} onChange={(e) => update({ city: e.target.value })} className={inputClass} autoComplete="address-level2" />
        </Field>
        <Field label="Postcode">
          <input value={draft.postcode} onChange={(e) => update({ postcode: e.target.value.toUpperCase() })} className={inputClass} autoComplete="postal-code" maxLength={10} />
        </Field>
      </div>
      <Field label="How do drivers get access?">
        <select value={draft.accessType} onChange={(e) => update({ accessType: e.target.value as Draft['accessType'] })} className={inputClass}>
          <option value="always_open">Open driveway / no gate</option>
          <option value="gate_code">Gate code</option>
          <option value="buzz_in">Buzz in</option>
          <option value="key_pickup">Key pickup</option>
          <option value="app_unlock">Unlock via app</option>
        </select>
      </Field>
      <Field label="Access instructions (shared after booking)">
        <textarea value={draft.accessInstructions} onChange={(e) => update({ accessInstructions: e.target.value })} rows={2} maxLength={1000} className={inputClass} placeholder="e.g. Park on the left, charger is on the garage wall." />
      </Field>
      <NextButton onClick={onNext} disabled={!ready} />
    </div>
  )
}

function ChargerStep({ draft, update, onNext }: StepProps) {
  const LEVELS = [
    { value: 'level_2', label: 'Level 2 (7–22 kW)', desc: 'Most home chargers' },
    { value: 'dc_fast', label: 'DC Fast (50–150 kW)', desc: 'Business / rapid charger' },
    { value: 'dc_ultra_fast', label: 'Ultra-fast (150kW+)', desc: 'High-power DC' },
  ] as const
  const PLUGS = ['Type2', 'CCS2', 'NACS', 'CHAdeMO', 'J1772']
  const togglePlug = (p: string) => update({ plugTypes: draft.plugTypes.includes(p) ? draft.plugTypes.filter((x) => x !== p) : [...draft.plugTypes, p] })
  const kw = Number.parseFloat(draft.maxKw)

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Charger specs</h2>
      <p className="mb-5 text-sm text-gray-500">Tell us about your charger so drivers know what to expect.</p>
      <div className="mb-4 space-y-2">
        {LEVELS.map((l) => (
          <button key={l.value} onClick={() => update({ level: l.value })} className={cn('w-full rounded-xl border-2 p-3 text-left transition-colors', draft.level === l.value ? 'border-green-500 bg-green-50' : 'border-gray-200')}>
            <p className="text-sm font-semibold text-gray-900">{l.label}</p>
            <p className="text-xs text-gray-400">{l.desc}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max power (kW)">
          <input value={draft.maxKw} onChange={(e) => update({ maxKw: e.target.value })} type="number" min="1" max="350" className={inputClass} />
        </Field>
        <Field label="Brand (optional)">
          <input value={draft.brand} onChange={(e) => update({ brand: e.target.value })} placeholder="e.g. Wallbox" className={inputClass} />
        </Field>
      </div>
      <span className="mb-2 block text-xs font-medium text-gray-600">Plug types (select all that apply)</span>
      <div className="mb-4 flex flex-wrap gap-2">
        {PLUGS.map((p) => (
          <button key={p} onClick={() => togglePlug(p)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', draft.plugTypes.includes(p) ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600')}>{p}</button>
        ))}
      </div>
      <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.isSmart} onChange={(e) => update({ isSmart: e.target.checked })} className="rounded accent-green-600" />
        This is a smart (OCPP-connected) charger I have paired with Zipgrid
      </label>
      {draft.isSmart && (
        <input value={draft.ocppId} onChange={(e) => update({ ocppId: e.target.value })} placeholder="OCPP Charge Point ID (from Chargers → Pair)" className={cn(inputClass, 'mt-2')} />
      )}
      <NextButton onClick={onNext} disabled={draft.plugTypes.length === 0 || !(kw > 0) || (draft.isSmart && !draft.ocppId.trim())} />
    </div>
  )
}

function SafetyStep({ draft, update, onNext }: StepProps) {
  const ready = draft.rcd !== null && draft.electrician !== null && draft.tosAccepted
  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Safety checklist</h2>
      <p className="mb-5 text-sm text-gray-500">We need to verify your charger meets basic safety standards.</p>
      <div className="mb-5 space-y-4">
        <YesNoQuestion question="Was your charger installed by a qualified electrician (NICEIC / NAPIT / ECA approved)?" value={draft.electrician} onChange={(v) => update({ electrician: v })} />
        <YesNoQuestion question="Does your charger have RCD (Residual Current Device) protection?" value={draft.rcd} onChange={(v) => update({ rcd: v })} />
      </div>
      <Field label="Installation year (optional)">
        <input type="number" min="2000" max={new Date().getFullYear()} value={draft.installYear} onChange={(e) => update({ installYear: e.target.value })} placeholder={String(new Date().getFullYear())} className={inputClass} />
      </Field>
      <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="mb-2 text-sm font-semibold text-amber-900">Platform Insurance Terms</p>
        <p className="mb-3 text-xs leading-relaxed text-amber-800">
          By listing on Zipgrid, you confirm your charger meets UK electrical safety standards. You retain responsibility for the physical installation and ongoing maintenance of your charger.
        </p>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={draft.tosAccepted} onChange={(e) => update({ tosAccepted: e.target.checked })} className="mt-0.5 h-4 w-4 rounded accent-green-600" />
          <span className="text-xs text-amber-800">
            I accept the <a href="/legal/host-terms" className="font-semibold underline" target="_blank" rel="noopener noreferrer">Platform Insurance Terms</a> and confirm my charger is safely installed.
          </span>
        </label>
      </div>
      <NextButton onClick={onNext} disabled={!ready}><Shield className="h-4 w-4" /> Continue</NextButton>
    </div>
  )
}

function YesNoQuestion({ question, value, onChange }: { question: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm text-gray-700">{question}</p>
      <div className="flex gap-3">
        <button onClick={() => onChange(true)} className={cn('flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors', value === true ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600')}>Yes</button>
        <button onClick={() => onChange(false)} className={cn('flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors', value === false ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600')}>No</button>
      </div>
    </div>
  )
}

function PricingStep({ draft, update, onNext }: StepProps) {
  const models: Array<{ value: PricingModel; label: string; desc: string }> = [
    ...(draft.isSmart ? [{ value: 'per_kwh' as const, label: 'Per kWh', desc: 'Fairest — drivers pay for the energy they use' }] : []),
    { value: 'per_hour', label: 'Per hour', desc: 'Simple — charge by connection time' },
    { value: 'per_session', label: 'Flat fee', desc: 'Fixed charge per booking regardless of energy' },
  ]
  useEffect(() => {
    if (!draft.isSmart && draft.pricingModel === 'per_kwh') update({ pricingModel: 'per_hour' })
  }, [draft.isSmart, draft.pricingModel, update])

  const price = draft.pricingModel === 'per_kwh' ? draft.kwhPrice : draft.pricingModel === 'per_hour' ? draft.hourPrice : draft.sessionPrice
  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Set your price</h2>
      <p className="mb-2 text-sm text-gray-500">You can change this any time. Zipgrid&apos;s fee is 15%.</p>
      {!draft.isSmart && <p className="mb-3 text-xs text-gray-400">Per-kWh pricing needs a connected (OCPP) charger to measure energy.</p>}
      <div className="mb-4 space-y-2">
        {models.map((m) => (
          <button key={m.value} onClick={() => update({ pricingModel: m.value })} className={cn('w-full rounded-xl border-2 p-3 text-left transition-colors', draft.pricingModel === m.value ? 'border-green-500 bg-green-50' : 'border-gray-200')}>
            <p className="text-sm font-semibold text-gray-900">{m.label}</p>
            <p className="text-xs text-gray-400">{m.desc}</p>
          </button>
        ))}
      </div>
      {draft.pricingModel === 'per_kwh' && <PriceInput label="Price per kWh (£)" value={draft.kwhPrice} onChange={(v) => update({ kwhPrice: v })} placeholder="0.28" />}
      {draft.pricingModel === 'per_hour' && <PriceInput label="Price per hour (£)" value={draft.hourPrice} onChange={(v) => update({ hourPrice: v })} placeholder="2.50" />}
      {draft.pricingModel === 'per_session' && <PriceInput label="Flat fee per session (£)" value={draft.sessionPrice} onChange={(v) => update({ sessionPrice: v })} placeholder="5.00" />}
      <div className="mt-4">
        <PriceInput label="Idle fee per minute after charging ends (£)" value={draft.idleFee} onChange={(v) => update({ idleFee: v })} placeholder="0.10" />
        <p className="mt-1 text-xs text-gray-400">Encourages drivers to move their car promptly once charged.</p>
      </div>
      <NextButton onClick={onNext} disabled={!(pence(price) > 0)} />
    </div>
  )
}

function PriceInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-gray-200">
        <span className="border-r border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500">£</span>
        <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} type="number" min="0" step="0.01" placeholder={placeholder} className="flex-1 px-3 py-2 text-sm focus:outline-none" />
      </div>
    </div>
  )
}

function AvailabilityStep({ draft, update, onNext }: StepProps) {
  const toggleDay = (d: string) => update({ activeDays: draft.activeDays.includes(d) ? draft.activeDays.filter((x) => x !== d) : [...draft.activeDays, d] })
  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">When is it available?</h2>
      <p className="mb-4 text-sm text-gray-500">Set the days and hours your charger can be booked (UK time).</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {DAYS.map((d) => (
          <button key={d} onClick={() => toggleDay(d)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', draft.activeDays.includes(d) ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500')}>{d.slice(0, 3)}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opens"><input type="time" value={draft.openTime} onChange={(e) => update({ openTime: e.target.value })} className={inputClass} /></Field>
        <Field label="Closes"><input type="time" value={draft.closeTime} onChange={(e) => update({ closeTime: e.target.value })} className={inputClass} /></Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-gray-200 bg-white p-4">
        <input type="checkbox" checked={draft.instantBook} onChange={(e) => update({ instantBook: e.target.checked })} className="rounded accent-green-600" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Allow instant booking</p>
          <p className="text-xs text-gray-400">Drivers book without waiting for your approval. Recommended.</p>
        </div>
      </label>
      <NextButton onClick={onNext} disabled={draft.activeDays.length === 0 || draft.openTime >= draft.closeTime} />
    </div>
  )
}

function StripeStep({ onNext }: { onNext: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStripe = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await send('/api/v1/host/stripe-onboarding', 'POST', {
        returnUrl: `${window.location.origin}/onboarding?step=publish`,
        refreshUrl: `${window.location.origin}/onboarding?step=stripe`,
      })
      if (typeof data['onboardingUrl'] === 'string') window.location.href = data['onboardingUrl']
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Set up your payouts</h2>
      <p className="mb-5 text-sm text-gray-500">We use Stripe to pay you weekly into your bank account. Takes about 2 minutes.</p>
      <div className="mb-5 space-y-3">
        {['Your earnings land in your bank every week', 'Zipgrid takes 15% — you keep 85%', 'Earnings are held safely until payouts are set up'].map((item) => (
          <div key={item} className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
            <span className="text-sm text-gray-700">{item}</span>
          </div>
        ))}
      </div>
      <ErrorNote message={error} />
      <NextButton onClick={() => void handleStripe()} busy={loading}><CreditCard className="h-4 w-4" /> Set up Stripe payments</NextButton>
      <button onClick={onNext} className="mt-3 w-full text-sm text-gray-400 underline hover:text-gray-600">Skip for now (set up later)</button>
    </div>
  )
}

function PublishStep({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePublish = async () => {
    setPublishing(true)
    setError(null)
    try {
      let listingId = draft.listingId
      if (!listingId) {
        const listing = await send('/api/v1/listings', 'POST', {
          title: draft.title.trim(),
          addressLine1: draft.addressLine1.trim(),
          city: draft.city.trim(),
          postcode: draft.postcode.trim(),
          countryCode: 'GB',
          chargerLevel: draft.level,
          plugTypes: draft.plugTypes,
          maxPowerKw: Number.parseFloat(draft.maxKw),
          ...(draft.brand.trim() ? { chargerBrand: draft.brand.trim() } : {}),
          isSmartCharger: draft.isSmart,
          ...(draft.isSmart ? { ocppChargePointId: draft.ocppId.trim() } : {}),
          pricingModel: draft.pricingModel,
          ...(draft.pricingModel === 'per_kwh' ? { pricePerKwhPence: pence(draft.kwhPrice) } : {}),
          ...(draft.pricingModel === 'per_hour' ? { pricePerHourPence: pence(draft.hourPrice) } : {}),
          ...(draft.pricingModel === 'per_session' ? { pricePerSessionPence: pence(draft.sessionPrice) } : {}),
          idleFeePerMinPence: pence(draft.idleFee),
          accessType: draft.accessType,
          ...(draft.accessInstructions.trim() ? { accessInstructions: draft.accessInstructions.trim() } : {}),
          instantBookEnabled: draft.instantBook,
        })
        listingId = String(listing['id'])
        update({ listingId }) // retries won't create a duplicate
      }

      await send(`/api/v1/listings/${listingId}/schedule`, 'PUT', {
        schedule: DAYS.map((d) => ({
          dayOfWeek: d.toLowerCase(),
          openTime: draft.openTime,
          closeTime: draft.closeTime,
          isAvailable: draft.activeDays.includes(d),
        })),
      })
      await send('/api/v1/host/safety-checklist', 'POST', {
        listingId,
        hasRcdProtection: draft.rcd === true,
        isElectricianInstalled: draft.electrician === true,
        chargerInstallYear: draft.installYear ? Number.parseInt(draft.installYear, 10) : null,
        termsAccepted: draft.tosAccepted,
      })
      await send(`/api/v1/listings/${listingId}/publish`, 'POST')

      sessionStorage.removeItem(DRAFT_KEY)
      setPublished(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  if (published) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <Rocket className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900">You&apos;re live! 🎉</h2>
        <p className="mt-2 text-sm text-gray-500">Your charger is now visible to drivers. We&apos;ll notify you when your first booking arrives.</p>
        <NextButton onClick={() => router.push('/dashboard')}>Go to dashboard</NextButton>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
        <Rocket className="h-10 w-10 text-amber-600" />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900">Ready to go live?</h2>
      <p className="mb-2 mt-2 text-sm text-gray-500">
        {draft.title || 'Your charger'} · {draft.postcode} · {draft.maxKw} kW
      </p>
      <ErrorNote message={error} />
      <NextButton onClick={() => void handlePublish()} busy={publishing}><Rocket className="h-4 w-4" /> Publish my charger</NextButton>
    </div>
  )
}

/* ── Main wizard ─────────────────────────────────────────────── */

const STEP_ICONS: Record<StepId, React.ReactNode> = {
  welcome: <Home className="h-5 w-5" />, profile: <Home className="h-5 w-5" />, location: <MapPin className="h-5 w-5" />,
  charger: <Zap className="h-5 w-5" />, safety: <Shield className="h-5 w-5" />, pricing: <PoundSterling className="h-5 w-5" />,
  availability: <Calendar className="h-5 w-5" />, stripe: <CreditCard className="h-5 w-5" />, publish: <Rocket className="h-5 w-5" />,
}

/** Voice-guided host onboarding wizard. */
function OnboardingWizard() {
  const searchParams = useSearchParams()
  const [draft, setDraft] = useState<Draft>(INITIAL)
  const [currentStep, setCurrentStep] = useState<StepId>('welcome')

  // Restore the draft (e.g. after returning from Stripe) and honour ?step=.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      if (saved) setDraft({ ...INITIAL, ...(JSON.parse(saved) as Partial<Draft>) })
    } catch { /* ignore corrupt draft */ }
    const step = searchParams.get('step') as StepId | null
    if (step && STEPS.some((s) => s.id === step)) setCurrentStep(step)
  }, [searchParams])

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
      return next
    })
  }, [])

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const goNext = useCallback(() => {
    const next = STEPS[stepIndex + 1]
    if (next) setCurrentStep(next.id)
  }, [stepIndex])
  const goBack = () => {
    const prev = STEPS[stepIndex - 1]
    if (prev) setCurrentStep(prev.id)
  }

  const currentMeta = STEPS[stepIndex]!
  const props = { draft, update, onNext: goNext }

  const stepContent: Record<StepId, React.ReactNode> = {
    welcome: <WelcomeStep onNext={goNext} />,
    profile: <ProfileStep {...props} />,
    location: <LocationStep {...props} />,
    charger: <ChargerStep {...props} />,
    safety: <SafetyStep {...props} />,
    pricing: <PricingStep {...props} />,
    availability: <AvailabilityStep {...props} />,
    stripe: <StripeStep onNext={goNext} />,
    publish: <PublishStep draft={draft} update={update} />,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 pb-20 pt-8 sm:px-6">
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Step {stepIndex + 1} of {STEPS.length} · {currentMeta.label}</p>
            <p className="text-xs text-gray-400">{Math.round((stepIndex / (STEPS.length - 1)) * 100)}% complete</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-green-600 transition-all duration-500" style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }} />
          </div>
          <div className="mt-3 flex justify-between">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                title={s.label}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  i < stepIndex ? 'border-green-500 bg-green-500 text-white' : i === stepIndex ? 'border-green-500 bg-white text-green-600' : 'border-gray-200 bg-white text-gray-400',
                )}
              >
                {i < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i === stepIndex ? STEP_ICONS[s.id] : i + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5">
          <Mic className="h-4 w-4 flex-shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">{currentMeta.voiceHint}</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {stepContent[currentStep]}
          {stepIndex > 0 && currentStep !== 'publish' && (
            <button onClick={goBack} className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600">← Back</button>
          )}
        </div>
      </div>

      <VoiceButton role="host" context={{ page: 'onboarding', step: currentStep }} />
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-green-600" /></div>}>
      <OnboardingWizard />
    </Suspense>
  )
}
