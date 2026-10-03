/**
 * @file page.tsx
 * @description /driver/rewards — Points balance, tier progress bar, badges, redeem CTA.
 *
 * @module apps/web/app/(driver)/rewards
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Star, Gift, Trophy, Zap, CheckCircle2,
  Loader2, AlertCircle, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type RewardBalance = {
  userId: string; totalPoints: number; lifetimePoints: number
  currentTier: 'standard' | 'silver' | 'gold' | 'platinum'
  tierQualifyingPts: number; nextTierName: string | null; nextTierPtsNeeded: number | null
  tierMultiplier: number; walletEquivalentPence: number
}

type Badge = { badgeType: string; label: string; description: string; earnedAt: string }

/* ── Tier config ─────────────────────────────────────────────── */

const TIER_CONFIG = {
  standard: { label: 'Standard', color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]', ring: 'border-[hsl(var(--border))]', threshold: 0, next: 1000 },
  silver:   { label: 'Silver',   color: 'text-zinc-400', bg: 'bg-zinc-500/10', ring: 'border-zinc-400', threshold: 1000, next: 5000 },
  gold:     { label: 'Gold',     color: 'text-yellow-500', bg: 'bg-yellow-500/10', ring: 'border-yellow-500', threshold: 5000, next: 15000 },
  platinum: { label: 'Platinum', color: 'text-[hsl(var(--primary))]', bg: 'bg-[hsl(var(--primary)/0.1)]', ring: 'border-[hsl(var(--primary))]', threshold: 15000, next: null },
} as const

/* ── Redeem modal ────────────────────────────────────────────── */

function RedeemModal({ totalPoints, onClose, onSuccess }: {
  totalPoints: number; onClose: () => void; onSuccess: (creditPence: number) => void
}) {
  const MAX_REDEEMABLE = Math.floor(totalPoints / 100) * 100
  const [pts, setPts] = useState(Math.min(500, MAX_REDEEMABLE))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creditPence = Math.floor(pts / 100) * 10  // 100pts = £0.10

  const handleRedeem = async () => {
    setError(null); setSubmitting(true)
    try {
      const res = await fetch('/api/v1/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pts }),
      })
      const json = await res.json() as { success: boolean; data?: { walletCreditPence: number }; error?: { message: string } }
      if (!res.ok || !json.success) { setError(json.error?.message ?? 'Redemption failed'); return }
      onSuccess(json.data?.walletCreditPence ?? creditPence)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="redeem-title">
      <div className="w-full max-w-sm rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-xl">
        <h2 id="redeem-title" className="mb-4 font-semibold text-[hsl(var(--foreground))]">Redeem points</h2>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          100 points = £0.10 wallet credit. Minimum 500 pts, multiples of 100.
        </p>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">Points to redeem</span>
            <span className="font-semibold text-[hsl(var(--foreground))]">{pts.toLocaleString()} pts → £{(creditPence / 100).toFixed(2)}</span>
          </div>
          <input type="range" min={500} max={MAX_REDEEMABLE} step={100} value={pts}
            onChange={(e) => setPts(Number(e.target.value))}
            disabled={MAX_REDEEMABLE < 500}
            className="w-full accent-[hsl(var(--primary))]"
            aria-label="Points to redeem" />
          <div className="mt-1 flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
            <span>500 pts</span><span>{MAX_REDEEMABLE.toLocaleString()} pts</span>
          </div>
        </div>

        {error && <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-[hsl(var(--destructive))]"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 rounded-[6px] border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--foreground))] disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleRedeem} disabled={submitting || MAX_REDEEMABLE < 500} aria-busy={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Gift className="h-4 w-4" aria-hidden="true" />}
            {submitting ? 'Redeeming…' : `Redeem ${pts} pts`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

/** Page at /rewards — Points balance, tier progress bar, badges, redeem CTA. */
export default function RewardsPage() {
  const [balance, setBalance] = useState<RewardBalance | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [showRedeem, setShowRedeem] = useState(false)
  const [redeemSuccess, setRedeemSuccess] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/rewards')
      const json = await res.json() as { success: boolean; data?: { balance: RewardBalance; badges: Badge[] } }
      if (json.success && json.data) { setBalance(json.data.balance); setBadges(json.data.badges) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
    </div>
  )

  if (!balance) return null
  const tier = TIER_CONFIG[balance.currentTier]

  // Tier progress bar
  const tierPct = balance.nextTierPtsNeeded != null
    ? Math.min(100, Math.round((balance.tierQualifyingPts / (balance.tierQualifyingPts + balance.nextTierPtsNeeded)) * 100))
    : 100

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
        <header className="border-b border-[hsl(var(--border))] px-4 py-5">
          <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">Rewards</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Earn points. Level up. Redeem for wallet credit.</p>
        </header>

        <main className="flex-1 px-4 py-6">
          <div className="mx-auto flex max-w-lg flex-col gap-5">

            {/* Redeem success banner */}
            {redeemSuccess != null && (
              <div className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] p-3" role="alert">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  £{(redeemSuccess / 100).toFixed(2)} added to your wallet!
                </p>
              </div>
            )}

            {/* Points card */}
            <div className={cn('rounded-[8px] border-2 p-6', tier.ring)}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Your points</p>
                  <p className="mt-1 font-mono text-4xl font-bold text-[hsl(var(--foreground))]">{balance.totalPoints.toLocaleString()}</p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    ≈ £{(balance.walletEquivalentPence / 100).toFixed(2)} wallet value · {balance.tierMultiplier}× earn rate
                  </p>
                </div>
                <span className={cn('rounded-full px-3 py-1 text-xs font-bold', tier.bg, tier.color)}>
                  {tier.label}
                </span>
              </div>

              {/* Tier progress */}
              {balance.nextTierName && (
                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-[hsl(var(--muted-foreground))]">{tier.label}</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{balance.nextTierPtsNeeded?.toLocaleString()} pts to {balance.nextTierName}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]" role="progressbar" aria-valuenow={tierPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${balance.nextTierName}`}>
                    <div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${tierPct}%` }} />
                  </div>
                </div>
              )}

              <button type="button" onClick={() => { setRedeemSuccess(null); setShowRedeem(true) }}
                disabled={balance.totalPoints < 500}
                className={cn('mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-[6px] text-sm font-semibold transition-colors',
                  balance.totalPoints >= 500
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
                    : 'cursor-not-allowed bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]')}>
                <Gift className="h-4 w-4" aria-hidden="true" />
                {balance.totalPoints >= 500 ? 'Redeem points' : `Need ${500 - balance.totalPoints} more pts to redeem`}
              </button>
            </div>

            {/* Earn rates */}
            <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">How to earn ({balance.tierMultiplier}× multiplier active)</p>
              <div className="flex flex-col gap-2 text-sm">
                {[
                  { action: 'Complete a session', pts: `10 pts per £1 spent`, icon: Zap },
                  { action: 'Leave a review', pts: '50 pts', icon: Star },
                  { action: 'Refer a friend', pts: '500 pts', icon: ChevronRight },
                  { action: 'Welcome bonus', pts: '200 pts', icon: Gift },
                ].map(({ action, pts, icon: Icon }) => (
                  <div key={action} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                    <span className="flex-1 text-[hsl(var(--foreground))]">{action}</span>
                    <span className="font-mono text-xs font-semibold text-[hsl(var(--muted-foreground))]">{pts}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Badges */}
            <div>
              <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                Badges <span className="text-[hsl(var(--muted-foreground))]">({badges.length})</span>
              </h2>
              {badges.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-[hsl(var(--border))] py-10 text-center">
                  <Trophy className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.3)]" aria-hidden="true" strokeWidth={1} />
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Complete sessions to earn your first badge.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {badges.map((b) => (
                    <div key={b.badgeType} className="flex flex-col gap-1.5 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-center">
                      <p className="text-xl">{b.label.split(' ')[0]}</p>
                      <p className="text-xs font-medium text-[hsl(var(--foreground))] leading-tight">{b.label.replace(/^[^ ]+ /, '')}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                        {new Date(b.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {showRedeem && (
        <RedeemModal
          totalPoints={balance.totalPoints}
          onClose={() => setShowRedeem(false)}
          onSuccess={(pence) => { setShowRedeem(false); setRedeemSuccess(pence); void fetchData() }}
        />
      )}
    </>
  )
}
