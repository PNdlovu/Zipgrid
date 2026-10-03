/**
 * @file page.tsx
 * @description /host/chargers/pair — OCPP device pairing wizard.
 * 5 steps: brand select → CP ID entry → URL display → waiting for connection → success.
 * Polls /api/v1/chargers/[id]/health to detect when charger connects.
 *
 * @module apps/web/app/(host)/chargers/pair
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Zap, CheckCircle2, Copy, Loader2, ArrowLeft, ArrowRight, Wifi,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type Step = 1 | 2 | 3 | 4 | 5

const BRANDS = [
  { id: 'eo_charging', name: 'EO Charging', models: ['EO Mini Pro 3', 'EO Basic'] },
  { id: 'rolec_ev', name: 'Rolec EV', models: ['WallPod EV', 'Quantum'] },
  { id: 'andersen_ev', name: 'Andersen EV', models: ['A2'] },
  { id: 'ohme', name: 'Ohme', models: ['Home Pro', 'ePod'] },
  { id: 'myenergi_zappi', name: 'myenergi Zappi', models: ['Zappi 2'] },
  { id: 'wallbox', name: 'Wallbox', models: ['Pulsar Plus', 'Commander 2'] },
  { id: 'pod_point', name: 'Pod Point', models: ['Solo 3'] },
  { id: 'other', name: 'Other (OCPP 1.6J)', models: ['Manual entry'] },
] as const

const CpIdSchema = z.object({
  chargePointId: z
    .string()
    .min(3, 'Charge Point ID must be at least 3 characters')
    .max(100, 'Charge Point ID must be under 100 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, numbers, hyphens, and underscores allowed'),
  brand: z.string().min(1, 'Select your charger brand'),
  model: z.string().min(1, 'Select your charger model'),
})
type CpIdValues = z.infer<typeof CpIdSchema>

/* ── Progress indicator ─────────────────────────────────────── */

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <nav aria-label={`Step ${current} of ${total}`} className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const step = (i + 1) as Step
        const isDone = step < current
        const isActive = step === current
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                isDone
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : isActive
                    ? 'border-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'border-2 border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]',
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : step}
            </div>
            {step < total && (
              <div
                className={cn(
                  'h-px w-6 transition-colors',
                  isDone ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]',
                )}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}

/* ── Main component ─────────────────────────────────────────── */

/**
 * OCPP device pairing wizard — 5-step guided flow.
 */
export default function PairChargerPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [pairedChargerId, setPairedChargerId] = useState<string | null>(null)
  const [ocppUrl, setOcppUrl] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState<'url' | 'key' | null>(null)
  const [pairError, setPairError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<CpIdValues>({ resolver: zodResolver(CpIdSchema) })

  const brandId = watch('brand')
  const selectedBrandData = BRANDS.find((b) => b.id === brandId)

  /* ── Polling for OCPP connection ──────────────────────────── */
  const pollForConnection = useCallback(async (id: string) => {
    setIsPolling(true)
    let attempts = 0
    const maxAttempts = 40 // 40 × 5s = 3.3 minutes

    const poll = async (): Promise<void> => {
      attempts++
      try {
        const res = await fetch(`/api/v1/chargers/${encodeURIComponent(id)}/health`)
        if (res.ok) {
          const data = await res.json() as { success: boolean; data?: { connected: boolean } }
          if (data.success && data.data?.connected) {
            setConnected(true)
            setIsPolling(false)
            setStep(5)
            return
          }
        }
      } catch { /* continue polling */ }

      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5000))
        return poll()
      }
      setIsPolling(false)
    }

    void poll()
  }, [])

  /* ── Step 4: start polling when we reach the waiting step ─── */
  useEffect(() => {
    if (step === 4 && pairedChargerId && !connected) {
      void pollForConnection(pairedChargerId)
    }
  }, [step, pairedChargerId, connected, pollForConnection])

  /* ── Submit CP ID → register with API ────────────────────── */
  const onSubmitCpId = async (data: CpIdValues) => {
    setPairError(null)
    try {
      const res = await fetch('/api/v1/chargers/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargePointId: data.chargePointId, brand: data.brand, model: data.model }),
      })
      const json = await res.json() as {
        success: boolean
        data?: { chargerId: string; ocppUrl: string; apiKey: string }
        error?: { message: string }
      }
      if (!res.ok || !json.success) {
        setPairError(json.error?.message ?? 'Pairing failed. Please try again.')
        return
      }
      setPairedChargerId(json.data!.chargerId)
      setOcppUrl(json.data!.ocppUrl)
      setApiKey(json.data!.apiKey)
      setStep(3)
    } catch {
      setPairError('Network error — please check your connection.')
    }
  }

  const copyToClipboard = async (text: string, type: 'url' | 'key') => {
    await navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => step > 1 ? setStep((s) => Math.max(1, s - 1) as Step) : router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Pair a charger</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Takes about 5 minutes</p>
        </div>
      </div>

      <StepIndicator current={step} total={5} />

      <div className="mx-auto w-full max-w-lg">

        {/* ── STEP 1: Brand selection ── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Select your charger brand</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                All listed brands support OCPP 1.6J — the standard used by Zipgrid.
              </p>
            </div>
            <div role="radiogroup" aria-label="Charger brand" className="grid gap-2 sm:grid-cols-2">
              {BRANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedBrand === b.id}
                  onClick={() => { setSelectedBrand(b.id); setValue('brand', b.id) }}
                  className={cn(
                    'flex items-center gap-3 rounded-[6px] border p-4 text-left transition-colors',
                    selectedBrand === b.id
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.3)]',
                  )}
                >
                  <Zap
                    className={cn('h-4 w-4 shrink-0', selectedBrand === b.id ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]')}
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{b.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { if (selectedBrand) setStep(2) }}
              disabled={!selectedBrand}
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
                'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ── STEP 2: Enter CP ID + model ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit(onSubmitCpId)} className="flex flex-col gap-6" noValidate>
            <div>
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Enter your Charge Point ID</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Find this on the sticker on your charger, in its app, or in the charger settings menu.
              </p>
            </div>

            {/* Model select */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="model" className="text-sm font-medium text-[hsl(var(--foreground))]">
                Charger model
              </label>
              <select
                id="model"
                className={cn(
                  'h-11 w-full rounded-[6px] border bg-[hsl(var(--background))] px-3.5 text-sm',
                  'text-[hsl(var(--foreground))] focus:border-[hsl(var(--primary))] focus:outline-none',
                  errors.model ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]',
                )}
                {...register('model')}
              >
                <option value="">Select model…</option>
                {selectedBrandData?.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {errors.model && <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{errors.model.message}</p>}
            </div>

            {/* CP ID input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="chargePointId" className="text-sm font-medium text-[hsl(var(--foreground))]">
                Charge Point ID
              </label>
              <input
                id="chargePointId"
                type="text"
                placeholder="e.g. EO-HOME-00042 or MYCHARGER-001"
                autoCapitalize="none"
                spellCheck={false}
                className={cn(
                  'h-11 w-full rounded-[6px] border bg-[hsl(var(--background))] px-3.5 font-mono text-sm',
                  'text-[hsl(var(--foreground))] placeholder:font-sans placeholder:text-[hsl(var(--muted-foreground))]',
                  'focus:border-[hsl(var(--primary))] focus:outline-none',
                  errors.chargePointId ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]',
                )}
                {...register('chargePointId')}
              />
              {errors.chargePointId && (
                <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{errors.chargePointId.message}</p>
              )}
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                This uniquely identifies your charger on the OCPP network.
              </p>
            </div>

            {pairError && (
              <div role="alert" className="rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
                {pairError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
                'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <>Register charger <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
          </form>
        )}

        {/* ── STEP 3: Show OCPP URL + API key ── */}
        {step === 3 && ocppUrl && apiKey && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Configure your charger</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Open your charger&apos;s settings (via its app or web portal) and enter these values in the OCPP configuration.
              </p>
            </div>

            {[
              { label: 'OCPP Central System URL', value: ocppUrl, type: 'url' as const },
              { label: 'OCPP API Key (password)', value: apiKey, type: 'key' as const },
            ].map(({ label, value, type }) => (
              <div key={type} className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>
                <div className="flex gap-2">
                  <div className="flex-1 overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5">
                    <p className="truncate font-mono text-xs text-[hsl(var(--foreground))]">{value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(value, type)}
                    aria-label={`Copy ${label}`}
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border transition-colors',
                      copied === type
                        ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                        : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                    )}
                  >
                    {copied === type ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
            ))}

            <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4 text-sm">
              <p className="font-semibold text-[hsl(var(--foreground))]">Brand-specific instructions</p>
              <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                {selectedBrand === 'eo_charging' && 'In the EO app: Settings → Connectivity → OCPP → enter the URL above and set password to the API key.'}
                {selectedBrand === 'myenergi_zappi' && 'On myenergi hub: Settings → OCPP → Server URL → paste the URL. Note: Zappi requires hub firmware ≥ 3.100.'}
                {selectedBrand === 'ohme' && 'In the Ohme app: Settings → Smart Charging → External OCPP → paste URL and key.'}
                {(!selectedBrand || !['eo_charging', 'myenergi_zappi', 'ohme'].includes(selectedBrand)) && 'Enter the URL as the OCPP Central System URL and the API key as the OCPP password in your charger settings.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStep(4)}
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
                'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
              )}
            >
              I&apos;ve configured my charger <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ── STEP 4: Waiting for connection ── */}
        {step === 4 && (
          <div className="flex flex-col items-center gap-6 py-8 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-[hsl(var(--primary)/0.3)]">
              {isPolling && (
                <div className="absolute inset-0 animate-ping rounded-full bg-[hsl(var(--primary)/0.1)]" aria-hidden="true" />
              )}
              <Wifi className="h-8 w-8 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                Waiting for your charger to connect…
              </h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Make sure your charger is powered on and connected to the internet. This can take up to 2 minutes after saving settings.
              </p>
            </div>

            {isPolling && (
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Checking for connection…
              </div>
            )}

            <div className="flex flex-col gap-2 w-full">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Not seeing a connection?</p>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
              >
                ← Back to configuration instructions
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Success ── */}
        {step === 5 && pairedChargerId && (
          <div className="flex flex-col items-center gap-6 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)]">
              <CheckCircle2 className="h-8 w-8 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Charger connected!</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Your charger is now paired with Zipgrid. Next, create a listing so drivers can find and book it.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={() => router.push('/host/listings/new')}
                className={cn(
                  'flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
                  'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                )}
              >
                Create a listing for this charger <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => router.push(`/host/chargers/${pairedChargerId}`)}
                className={cn(
                  'flex h-11 w-full items-center justify-center rounded-[6px] border border-[hsl(var(--border))]',
                  'text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors',
                )}
              >
                View charger dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
