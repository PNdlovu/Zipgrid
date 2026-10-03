/**
 * @file PaymentMethodsManager.tsx
 * @description Saved-card management: list, set default, remove, and add a card
 * with Stripe Elements (SetupIntent, saved for off-session use so it can pay for
 * bookings, wallet top-ups, auto top-ups and outstanding balances).
 *
 * @module components/payments
 */

'use client'

import { useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { CreditCard, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePaymentMethods, type SavedCard } from '@/hooks/usePaymentMethods'

let stripePromise: Promise<Stripe | null> | null = null
function getStripe(): Promise<Stripe | null> {
  const key = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
  if (!key) return Promise.resolve(null)
  stripePromise ??= loadStripe(key)
  return stripePromise
}

/* ── Add-card form (inside <Elements>) ───────────────────────── */

function AddCardForm({ onSaved, onCancel }: { onSaved: (paymentMethodId: string | null) => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setSaving(true)
    setError(null)
    const { error: stripeError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/settings?tab=payments` },
    })
    setSaving(false)
    if (stripeError) { setError(stripeError.message ?? 'Your card could not be saved.'); return }
    const pm = setupIntent?.payment_method
    onSaved(typeof pm === 'string' ? pm : (pm?.id ?? null))
  }

  return (
    <form onSubmit={(e) => { void submit(e) }} className="space-y-3 rounded-[6px] border border-[hsl(var(--border))] p-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!stripe || saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save card
        </button>
        <button type="button" onClick={onCancel} className="rounded-[6px] border border-[hsl(var(--border))] px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
        Your card is stored by Stripe, not Zipgrid. By saving it you allow Zipgrid to charge it for bookings, wallet
        top-ups you set up, and any balance left over after a charging session.
      </p>
    </form>
  )
}

/* ── Card row ─────────────────────────────────────────────────── */

function CardRow({ card, onDefault, onRemove }: { card: SavedCard; onDefault: () => Promise<void>; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState<'default' | 'remove' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const run = async (kind: 'default' | 'remove', fn: () => Promise<void>) => {
    setBusy(kind)
    try { await fn() } finally { setBusy(null); setConfirmRemove(false) }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <CreditCard className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium capitalize">{card.brand} ···· {card.last4}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Expires {card.expMonth}/{String(card.expYear).slice(-2)}</p>
      </div>
      {card.isDefault ? (
        <span className="rounded-full bg-[hsl(var(--primary)_/_10%)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">Default</span>
      ) : (
        <button type="button" disabled={busy !== null} onClick={() => { void run('default', onDefault) }}
          className="text-xs font-medium text-[hsl(var(--primary))] disabled:opacity-50">
          {busy === 'default' ? 'Saving…' : 'Make default'}
        </button>
      )}
      {confirmRemove ? (
        <span className="flex items-center gap-2 text-xs">
          <button type="button" disabled={busy !== null} onClick={() => { void run('remove', onRemove) }}
            className="font-semibold text-[hsl(var(--destructive))] disabled:opacity-50">
            {busy === 'remove' ? 'Removing…' : 'Confirm remove'}
          </button>
          <button type="button" onClick={() => setConfirmRemove(false)} className="text-[hsl(var(--muted-foreground))]">Keep</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmRemove(true)} aria-label={`Remove card ending ${card.last4}`}
          className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/* ── Manager ─────────────────────────────────────────────────── */

/** Saved-card manager: list, make default, remove, and add a card with Stripe Elements. */
export function PaymentMethodsManager() {
  const { cards, error, refresh, createSetupIntent, setDefault, remove } = usePaymentMethods()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const publishableKeySet = Boolean(process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'])

  const startAdd = async () => {
    setStarting(true)
    setActionError(null)
    try {
      setClientSecret((await createSetupIntent()).clientSecret)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not start adding a card')
    } finally {
      setStarting(false)
    }
  }

  const onSaved = async (paymentMethodId: string | null) => {
    setClientSecret(null)
    const hadDefault = cards?.some((c) => c.isDefault)
    if (paymentMethodId && !hadDefault) await setDefault(paymentMethodId).catch(() => {})
    else await refresh()
  }

  const guard = (fn: () => Promise<void>) => async () => {
    setActionError(null)
    try { await fn() } catch (e) { setActionError(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Your default card pays for bookings and wallet auto top-ups, and settles any balance left after a session.
      </p>

      {(error || actionError) && (
        <p role="alert" className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{actionError ?? error}
        </p>
      )}

      {cards === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading cards" />
      ) : cards.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No saved cards yet.</p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-[6px] border border-[hsl(var(--border))]" aria-label="Saved cards">
          {cards.map((card) => (
            <CardRow key={card.id} card={card}
              onDefault={guard(() => setDefault(card.id))}
              onRemove={guard(() => remove(card.id))} />
          ))}
        </ul>
      )}

      {clientSecret ? (
        <Elements stripe={getStripe()} options={{ clientSecret }}>
          <AddCardForm onSaved={(pm) => { void onSaved(pm) }} onCancel={() => setClientSecret(null)} />
        </Elements>
      ) : (
        <button type="button" onClick={() => { void startAdd() }} disabled={starting || !publishableKeySet}
          className={cn('flex items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium',
            'hover:bg-[hsl(var(--muted))] disabled:opacity-50')}>
          {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Add a card
        </button>
      )}
      {!publishableKeySet && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Card payments are not configured on this environment.</p>
      )}
    </div>
  )
}
