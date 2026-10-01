/**
 * @file page.tsx
 * @description /host/onboarding — Voice-guided homeowner setup wizard.
 * Step-by-step onboarding that uses the voice assistant to guide hosts
 * through: profile setup → charger specs → safety checklist → pricing →
 * availability → Stripe Connect → listing publish.
 *
 * Each step can be completed via voice or by filling the form.
 * The AI assistant narrates every screen and answers questions.
 *
 * @module apps/web/app/(host)/onboarding
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, ChevronRight, Loader2, Mic, Home,
  Zap, Shield, PoundSterling, Calendar, CreditCard, Rocket,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VoiceButton } from '@/components/voice/VoiceButton'

/* ── Step definitions ───────────────────────────────────────── */

type StepId = 'welcome' | 'profile' | 'charger' | 'safety' | 'pricing' | 'availability' | 'stripe' | 'publish'

const STEPS: Array<{ id: StepId; label: string; icon: React.ReactNode; voiceHint: string }> = [
  { id: 'welcome',      label: 'Welcome',       icon: <Home className="h-5 w-5" />,         voiceHint: 'Say "next" to continue or ask me any question.' },
  { id: 'profile',      label: 'Your profile',  icon: <Home className="h-5 w-5" />,         voiceHint: 'Tell me your name and whether you\'re a homeowner or business.' },
  { id: 'charger',      label: 'Charger setup',  icon: <Zap className="h-5 w-5" />,          voiceHint: 'Tell me your charger brand, speed in kilowatts, and plug type.' },
  { id: 'safety',       label: 'Safety check',   icon: <Shield className="h-5 w-5" />,       voiceHint: 'Was your charger installed by a qualified electrician? Does it have RCD protection?' },
  { id: 'pricing',      label: 'Set your price', icon: <PoundSterling className="h-5 w-5" />, voiceHint: 'What price per kilowatt-hour would you like? The local average is 28 pence.' },
  { id: 'availability', label: 'Availability',   icon: <Calendar className="h-5 w-5" />,     voiceHint: 'Which days and hours is your charger available? For example, weekdays 9am to 5pm.' },
  { id: 'stripe',       label: 'Get paid',       icon: <CreditCard className="h-5 w-5" />,   voiceHint: 'We use Stripe to pay you out weekly. Say "set up payments" to continue.' },
  { id: 'publish',      label: 'Go live!',       icon: <Rocket className="h-5 w-5" />,       voiceHint: 'Your charger is ready to list. Say "publish" to go live and start earning.' },
]

/* ── Step content ─────────────────────────────────────────────── */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <Zap className="h-10 w-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900">Welcome to Zipgrid</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-gray-500 leading-relaxed">
        You're about to list your EV charger and start earning. This wizard will guide you through
        the whole setup in about 5 minutes. You can use your voice or type at each step.
      </p>
      <div className="mt-6 rounded-xl bg-green-50 border border-green-100 p-4 text-left">
        <p className="text-sm font-semibold text-green-800 mb-2">What you'll need:</p>
        <ul className="space-y-1.5 text-sm text-green-700">
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Your charger's make, model, and power output</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> A photo of your charger</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Your bank account details (for payouts)</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> UK government ID for verification</li>
        </ul>
      </div>
      <button
        onClick={onNext}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700"
      >
        Get started <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const [hostType, setHostType] = useState<'residential' | 'commercial'>('residential')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await fetch('/api/v1/host/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hostType, displayName: name }),
      })
      onNext()
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
            onClick={() => setHostType(t)}
            className={cn('rounded-xl border-2 p-4 text-center transition-colors capitalize', hostType === t ? 'border-green-500 bg-green-50' : 'border-gray-200')}
          >
            <span className="text-2xl">{t === 'residential' ? '🏠' : '🏢'}</span>
            <p className="mt-1 text-sm font-semibold text-gray-900">{t === 'residential' ? 'Home charger' : 'Business charger'}</p>
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Your name / business name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Sarah or Green Energy Ltd"
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        onClick={() => void handleSave()}
        disabled={!name.trim() || saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Continue <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function ChargerStep({ onNext }: { onNext: () => void }) {
  const LEVELS = [
    { value: 'level_2', label: 'Level 2 (7–22 kW)', desc: 'Most home chargers' },
    { value: 'dc_fast', label: 'DC Fast (50–150 kW)', desc: 'Business / rapid charger' },
    { value: 'dc_ultra_fast', label: 'Ultra-fast (150kW+)', desc: 'High-power DC' },
  ]
  const PLUGS = ['Type2', 'CCS2', 'NACS', 'CHAdeMO', 'J1772']

  const [level, setLevel] = useState('level_2')
  const [maxKw, setMaxKw] = useState('7')
  const [plugTypes, setPlugTypes] = useState<string[]>(['Type2'])
  const [brand, setBrand] = useState('')
  const [ocppId, setOcppId] = useState('')
  const [isSmart, setIsSmart] = useState(false)

  const togglePlug = (p: string) => setPlugTypes((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Charger specs</h2>
      <p className="mb-5 text-sm text-gray-500">Tell us about your charger so drivers know what to expect.</p>

      <div className="mb-4 space-y-2">
        {LEVELS.map((l) => (
          <button key={l.value} onClick={() => setLevel(l.value)} className={cn('w-full rounded-xl border-2 p-3 text-left transition-colors', level === l.value ? 'border-green-500 bg-green-50' : 'border-gray-200')}>
            <p className="text-sm font-semibold text-gray-900">{l.label}</p>
            <p className="text-xs text-gray-400">{l.desc}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Max power (kW)</label>
          <input value={maxKw} onChange={(e) => setMaxKw(e.target.value)} type="number" min="1" max="350" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Brand (optional)</label>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Wallbox" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
      </div>

      <label className="mb-2 block text-xs font-medium text-gray-600">Plug types (select all that apply)</label>
      <div className="mb-4 flex flex-wrap gap-2">
        {PLUGS.map((p) => (
          <button key={p} onClick={() => togglePlug(p)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', plugTypes.includes(p) ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600')}>{p}</button>
        ))}
      </div>

      <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={isSmart} onChange={(e) => setIsSmart(e.target.checked)} className="rounded accent-green-600" />
        This is a smart (OCPP-connected) charger
      </label>
      {isSmart && (
        <input value={ocppId} onChange={(e) => setOcppId(e.target.value)} placeholder="OCPP Charge Point ID" className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      )}

      <button
        onClick={onNext}
        disabled={plugTypes.length === 0}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        Continue <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function SafetyStep({ onNext }: { onNext: () => void }) {
  const [rcd, setRcd] = useState<boolean | null>(null)
  const [electrician, setElectrician] = useState<boolean | null>(null)
  const [installYear, setInstallYear] = useState('')
  const [tosAccepted, setTosAccepted] = useState(false)
  const [saving, setSaving] = useState(false)

  const ready = rcd !== null && electrician !== null && tosAccepted

  const handleSave = async () => {
    if (!ready) return
    setSaving(true)
    try {
      await fetch('/api/v1/host/safety-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hasRcdProtection: rcd, isElectricianInstalled: electrician, chargerInstallYear: installYear ? parseInt(installYear) : null }),
      })
      onNext()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Safety checklist</h2>
      <p className="mb-5 text-sm text-gray-500">We need to verify your charger meets basic safety standards.</p>

      <div className="space-y-4 mb-5">
        <YesNoQuestion
          question="Was your charger installed by a qualified electrician (NICEIC / NAPIT / ECA approved)?"
          value={electrician}
          onChange={setElectrician}
        />
        <YesNoQuestion
          question="Does your charger have RCD (Residual Current Device) protection?"
          value={rcd}
          onChange={setRcd}
        />
      </div>

      <div className="mb-5">
        <label className="mb-1 block text-sm font-medium text-gray-700">Installation year (optional)</label>
        <input
          type="number" min="2010" max={new Date().getFullYear()}
          value={installYear} onChange={(e) => setInstallYear(e.target.value)}
          placeholder={String(new Date().getFullYear())}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {/* Platform insurance ToS */}
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="mb-2 text-sm font-semibold text-amber-900">Platform Insurance Terms</p>
        <p className="mb-3 text-xs text-amber-800 leading-relaxed">
          By listing on Zipgrid, you confirm your charger meets UK electrical safety standards. Zipgrid provides platform liability cover of up to £1,000,000 per incident for bodily injury or property damage occurring during a Zipgrid-booked session. You retain responsibility for the physical installation and ongoing maintenance of your charger.
        </p>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={tosAccepted}
            onChange={(e) => setTosAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded accent-green-600"
          />
          <span className="text-xs text-amber-800">
            I accept the <a href="/legal/host-terms" className="font-semibold underline" target="_blank" rel="noopener noreferrer">Platform Insurance Terms</a> and confirm my charger is safely installed.
          </span>
        </label>
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={!ready || saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        Continue
      </button>
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

function PricingStep({ onNext }: { onNext: () => void }) {
  const [pricingModel, setPricingModel] = useState('per_kwh')
  const [kwhPrice, setKwhPrice] = useState('0.28')
  const [hourPrice, setHourPrice] = useState('2.50')
  const [sessionPrice, setSessionPrice] = useState('5.00')
  const [idleFee, setIdleFee] = useState('0.10')

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Set your price</h2>
      <p className="mb-2 text-sm text-gray-500">The UK average is <strong>28p/kWh</strong>. You can change this any time.</p>

      <div className="mb-4 space-y-2">
        {[
          { value: 'per_kwh', label: 'Per kWh', desc: 'Fairest — drivers pay for what they use' },
          { value: 'per_hour', label: 'Per hour', desc: 'Simple — charge by connection time' },
          { value: 'per_session', label: 'Flat fee', desc: 'Fixed charge per booking regardless of energy' },
        ].map((m) => (
          <button key={m.value} onClick={() => setPricingModel(m.value)} className={cn('w-full rounded-xl border-2 p-3 text-left transition-colors', pricingModel === m.value ? 'border-green-500 bg-green-50' : 'border-gray-200')}>
            <p className="text-sm font-semibold text-gray-900">{m.label}</p>
            <p className="text-xs text-gray-400">{m.desc}</p>
          </button>
        ))}
      </div>

      {pricingModel === 'per_kwh' && <PriceInput label="Price per kWh (£)" value={kwhPrice} onChange={setKwhPrice} placeholder="0.28" />}
      {pricingModel === 'per_hour' && <PriceInput label="Price per hour (£)" value={hourPrice} onChange={setHourPrice} placeholder="2.50" />}
      {pricingModel === 'per_session' && <PriceInput label="Flat fee per session (£)" value={sessionPrice} onChange={setSessionPrice} placeholder="5.00" />}

      <div className="mt-4">
        <PriceInput label="Idle fee per minute after disconnect (£)" value={idleFee} onChange={setIdleFee} placeholder="0.10" />
        <p className="mt-1 text-xs text-gray-400">Encourages drivers to move their car promptly once charged.</p>
      </div>

      <button onClick={onNext} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700">
        Continue <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function PriceInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
        <span className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500 border-r border-gray-200">£</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} type="number" min="0" step="0.01" placeholder={placeholder} className="flex-1 px-3 py-2 text-sm focus:outline-none" />
      </div>
    </div>
  )
}

function AvailabilityStep({ onNext }: { onNext: () => void }) {
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const [activeDays, setActiveDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  const [openTime, setOpenTime] = useState('08:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [instantBook, setInstantBook] = useState(true)

  const toggleDay = (d: string) => setActiveDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">When is it available?</h2>
      <p className="mb-4 text-sm text-gray-500">Set the days and hours your charger can be booked.</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {DAYS.map((d) => (
          <button key={d} onClick={() => toggleDay(d)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', activeDays.includes(d) ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500')}>{d.slice(0, 3)}</button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Opens</label>
          <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Closes</label>
          <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-gray-200 bg-white p-4">
        <input type="checkbox" checked={instantBook} onChange={(e) => setInstantBook(e.target.checked)} className="rounded accent-green-600" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Allow instant booking</p>
          <p className="text-xs text-gray-400">Drivers book without waiting for your approval. Recommended.</p>
        </div>
      </label>

      <button onClick={onNext} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700">
        Continue <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function StripeStep({ onNext }: { onNext: () => void }) {
  const [loading, setLoading] = useState(false)

  const handleStripe = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/host/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/host/onboarding?step=publish`,
          refreshUrl: `${window.location.origin}/host/onboarding?step=stripe`,
        }),
      })
      const json = await res.json() as { data?: { onboardingUrl: string } }
      if (json.data?.onboardingUrl) {
        window.location.href = json.data.onboardingUrl
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-xl font-extrabold text-gray-900">Set up your payouts</h2>
      <p className="mb-5 text-sm text-gray-500">We use Stripe to pay you weekly directly into your bank account. Takes about 2 minutes.</p>

      <div className="mb-5 space-y-3">
        {['Your earnings land in your bank every week', 'No minimum payout — earn from your first session', 'Zipgrid takes 15% — you keep 85%', '£20 minimum payout threshold'].map((item) => (
          <div key={item} className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
            <span className="text-sm text-gray-700">{item}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => void handleStripe()}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Set up Stripe payments
      </button>
      <button onClick={onNext} className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600 underline">Skip for now (set up later)</button>
    </div>
  )
}

function PublishStep() {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)

  const handlePublish = async () => {
    setPublishing(true)
    try {
      await fetch('/api/v1/host/listings/publish-draft', {
        method: 'POST',
        credentials: 'include',
      })
      setPublished(true)
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
        <h2 className="text-2xl font-extrabold text-gray-900">You're live! 🎉</h2>
        <p className="mt-2 text-sm text-gray-500">Your charger is now visible to drivers. You'll get a push notification when your first booking arrives.</p>
        <button onClick={() => router.push('/host/dashboard')} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700">
          Go to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
        <Rocket className="h-10 w-10 text-amber-600" />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900">Ready to go live?</h2>
      <p className="mt-2 mb-6 text-sm text-gray-500">Your charger is set up and ready. Publish it so drivers can book it.</p>
      <button
        onClick={() => void handlePublish()}
        disabled={publishing}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
        Publish my charger
      </button>
    </div>
  )
}

/* ── Main wizard ─────────────────────────────────────────────── */

/** Voice-guided homeowner onboarding wizard. */
export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<StepId>('welcome')
  const stepIndex = STEPS.findIndex((s) => s.id === currentStep)

  const goNext = useCallback(() => {
    const next = STEPS[stepIndex + 1]
    if (next) setCurrentStep(next.id)
  }, [stepIndex])

  const currentMeta = STEPS[stepIndex]!

  const stepContent: Record<StepId, React.ReactNode> = {
    welcome:      <WelcomeStep onNext={goNext} />,
    profile:      <ProfileStep onNext={goNext} />,
    charger:      <ChargerStep onNext={goNext} />,
    safety:       <SafetyStep onNext={goNext} />,
    pricing:      <PricingStep onNext={goNext} />,
    availability: <AvailabilityStep onNext={goNext} />,
    stripe:       <StripeStep onNext={goNext} />,
    publish:      <PublishStep />,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 pb-20 pt-8 sm:px-6">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Step {stepIndex + 1} of {STEPS.length}</p>
            <p className="text-xs text-gray-400">{Math.round(((stepIndex) / (STEPS.length - 1)) * 100)}% complete</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-green-600 transition-all duration-500"
              style={{ width: `${((stepIndex) / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          {/* Step pills */}
          <div className="mt-3 flex justify-between">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  i < stepIndex  ? 'border-green-500 bg-green-500 text-white' :
                  i === stepIndex ? 'border-green-500 bg-white text-green-600' :
                  'border-gray-200 bg-white text-gray-400',
                )}
              >
                {i < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Voice hint */}
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
          <Mic className="h-4 w-4 flex-shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">{currentMeta.voiceHint}</p>
        </div>

        {/* Step content */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {stepContent[currentStep]}
        </div>
      </div>

      {/* Floating voice button */}
      <VoiceButton role="host" context={{ page: 'onboarding', step: currentStep }} />
    </div>
  )
}
