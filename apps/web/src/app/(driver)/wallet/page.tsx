/**
 * @file page.tsx
 * @description /driver/wallet — Wallet balance card, top-up form, transaction history.
 * Auto top-up toggle with threshold and amount settings. Data and actions come
 * from useWallet.
 *
 * @module apps/web/app/(driver)/wallet
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Wallet, PoundSterling, ArrowUpCircle, ArrowDownCircle,
  RefreshCw, Loader2, AlertCircle, CheckCircle2, Settings,
  X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWallet, type TopUpResult, type WalletBalance } from '@/hooks/useWallet'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'

/* ── Helpers ────────────────────────────────────────────────── */

function fmt(p: number) { return `£${(Math.abs(p) / 100).toFixed(2)}` }

const TX_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  topup:            { label: 'Top-up',           color: 'text-[hsl(var(--primary))]',     icon: ArrowUpCircle },
  session_payment:  { label: 'Session payment',  color: 'text-[hsl(var(--destructive))]', icon: ArrowDownCircle },
  refund:           { label: 'Refund',            color: 'text-[hsl(var(--primary))]',     icon: ArrowUpCircle },
  reward_redemption:{ label: 'Reward redemption', color: 'text-[hsl(var(--primary))]',    icon: ArrowUpCircle },
  promotional:      { label: 'Promotional credit', color: 'text-[hsl(var(--primary))]',   icon: ArrowUpCircle },
  adjustment:       { label: 'Adjustment',        color: 'text-[hsl(var(--muted-foreground))]', icon: RefreshCw },
}

const TOP_UP_AMOUNTS = [500, 1000, 2000, 5000, 10000] // pence

/* ── Top-up modal ────────────────────────────────────────────── */

function TopupModal({ onClose, onSuccess, topUp }: {
  onClose: () => void
  onSuccess: () => void
  topUp: (amountPence: number, paymentMethodId: string) => Promise<TopUpResult>
}) {
  const [amountPence, setAmountPence] = useState(2000)
  const { cards, defaultCard, error: cardsError } = usePaymentMethods()
  const [chosenCardId, setChosenCardId] = useState<string | null>(null)
  const cardId = chosenCardId ?? defaultCard?.id ?? ''
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(cardsError)

  const handleTopup = async () => {
    if (!cardId) { setError('No saved card. Add one in Settings → Payments.'); return }
    setError(null); setSubmitting(true)
    try {
      const result = await topUp(amountPence, cardId)
      if (result.ok) onSuccess()
      else setError(result.error)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="topup-title">
      <div className="w-full max-w-sm rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="topup-title" className="font-semibold text-[hsl(var(--foreground))]">Top up wallet</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">Select amount to add to your Zipgrid wallet.</p>

        {/* Amount pills */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {TOP_UP_AMOUNTS.map((p) => (
            <button key={p} type="button" onClick={() => setAmountPence(p)}
              className={cn('rounded-[6px] border py-2.5 text-sm font-semibold transition-colors',
                amountPence === p ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--foreground))]')}
              aria-pressed={amountPence === p}>
              {fmt(p)}
            </button>
          ))}
        </div>

        <label htmlFor="topup-card" className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Pay with</label>
        {cards === null ? (
          <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">Loading cards…</p>
        ) : cards.length === 0 ? (
          <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
            No saved cards. <Link href="/settings?tab=payments" className="font-medium text-[hsl(var(--primary))]">Add a card</Link>
          </p>
        ) : (
          <select id="topup-card" value={cardId} onChange={(e) => setChosenCardId(e.target.value)}
            className="mb-4 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none">
            {cards.map((c) => <option key={c.id} value={c.id}>{c.brand.toUpperCase()} •••• {c.last4}</option>)}
          </select>
        )}

        {error && <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-[hsl(var(--destructive))]"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}

        <p className="mb-4 text-center text-xl font-bold text-[hsl(var(--foreground))]">{fmt(amountPence)}</p>

        <button type="button" onClick={handleTopup} disabled={submitting || !cardId} aria-busy={submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PoundSterling className="h-4 w-4" aria-hidden="true" />}
          {submitting ? 'Processing…' : `Add ${fmt(amountPence)} to wallet`}
        </button>
      </div>
    </div>
  )
}

/* ── Auto top-up settings ────────────────────────────────────── */

function AutoTopupSettings({ balance, save: saveSettings }: {
  balance: WalletBalance
  save: (enabled: boolean, thresholdPence: number, amountPence: number) => Promise<TopUpResult>
}) {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(balance.autoTopupEnabled)
  const [threshold, setThreshold] = useState(balance.autoTopupThresholdPence)
  const [amount, setAmount] = useState(balance.autoTopupAmountPence)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [saveError, setSaveError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveSettings(enabled, threshold, amount)
      if (result.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
      else setSaveError(result.error)
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}>
        <Settings className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <span className="flex-1 text-sm font-medium text-[hsl(var(--foreground))]">Auto top-up</span>
        <span className={cn('text-xs font-medium', balance.autoTopupEnabled ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]')}>
          {balance.autoTopupEnabled ? 'On' : 'Off'}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
      </button>

      {open && (
        <div className="border-t border-[hsl(var(--border))] px-4 py-4">
          <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
            We charge your default card when your available balance drops below your threshold, and when a wallet
            booking needs more than you have, so the booking still goes through. At most 3 auto top-ups a day;
            if your card is declined twice in a row we switch auto top-up off and let you know.
          </p>

          {/* Enable toggle */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-[hsl(var(--foreground))]">Enable auto top-up</span>
            <button type="button" onClick={() => setEnabled(!enabled)} role="switch" aria-checked={enabled}
              className={cn('relative h-6 w-11 rounded-full transition-colors', enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))]')}>
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} aria-hidden="true" />
            </button>
          </div>

          {enabled && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Top up when below</label>
                <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none">
                  {[200, 500, 1000, 2000].map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Top up by</label>
                <select value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none">
                  {[500, 1000, 2000, 5000, 10000].map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
                </select>
              </div>
            </div>
          )}

          {saveError && <p role="alert" className="mt-3 text-xs text-[hsl(var(--destructive))]">{saveError}</p>}
          <button type="button" onClick={save} disabled={saving}
            className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] text-xs font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-50">
            {saved ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Saved</> : saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : 'Save settings'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

/** Page at /wallet — Wallet balance card, top-up form, transaction history. */
export default function WalletPage() {
  const { balance, outstandingPence, transactions: allTxns, hasMore, loading, error, topUp, setAutoTopup, loadMore } = useWallet()
  const [showTopup, setShowTopup] = useState(false)

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
    </div>
  )


  return (
    <>
      <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
        <header className="border-b border-[hsl(var(--border))] px-4 py-5">
          <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">Wallet</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Your Zipgrid credit balance</p>
        </header>

        <main className="flex-1 px-4 py-6">
          <div className="mx-auto flex max-w-lg flex-col gap-5">

            {/* Balance card */}
            <div className={cn(
              'flex flex-col items-center gap-3 rounded-[8px] p-8 text-center',
              'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
            )}>
              <Wallet className="h-8 w-8 opacity-80" aria-hidden="true" strokeWidth={1.5} />
              <div>
                <p className="text-sm opacity-80">Available balance</p>
                <p className="font-mono text-4xl font-bold" aria-label={`Available wallet balance: ${fmt(balance?.availablePence ?? 0)}`}>
                  {fmt(balance?.availablePence ?? 0)}
                </p>
              </div>
              {(balance?.pendingPence ?? 0) > 0 && (
                <p className="text-xs opacity-70">{fmt(balance!.pendingPence)} reserved for upcoming bookings</p>
              )}
              <button
                type="button"
                onClick={() => setShowTopup(true)}
                className="mt-2 flex h-10 items-center gap-2 rounded-[6px] bg-white/15 px-6 text-sm font-semibold transition-colors hover:bg-white/25"
              >
                <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />
                Top up
              </button>
            </div>

            {outstandingPence > 0 && (
              <div role="alert" className="rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_5%)] p-4 text-sm">
                <p className="font-semibold text-[hsl(var(--destructive))]">Outstanding balance: {fmt(outstandingPence)}</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  A recent session cost more than was held. Top up your wallet and it is cleared automatically —
                  you can book again as soon as it is paid.
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}
              </p>
            )}

            {/* Auto top-up */}
            {balance && (
              <AutoTopupSettings balance={balance} save={setAutoTopup} />
            )}

            {/* Transaction history */}
            <div>
              <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">Transaction history</h2>
              {allTxns.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <PoundSterling className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.3)]" aria-hidden="true" strokeWidth={1} />
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No transactions yet.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Transactions">
                  {allTxns.map((tx) => {
                    const cfg = TX_CONFIG[tx.type] ?? { label: tx.type, color: 'text-[hsl(var(--foreground))]', icon: RefreshCw }
                    const Icon = cfg.icon
                    const isCredit = tx.amountPence > 0
                    return (
                      <li key={tx.id} className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
                        <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{cfg.label}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            {tx.description} · {new Date(tx.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn('font-mono text-sm font-semibold', isCredit ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]')}>
                            {isCredit ? '+' : '-'}{fmt(tx.amountPence)}
                          </p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">bal {fmt(tx.balanceAfterPence)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <button type="button" onClick={loadMore}
                    className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
                    Load more
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {showTopup && (
        <TopupModal
          onClose={() => setShowTopup(false)}
          onSuccess={() => setShowTopup(false)}
          topUp={topUp}
        />
      )}
    </>
  )
}
