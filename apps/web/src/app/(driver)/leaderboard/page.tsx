/**
 * @file page.tsx
 * @description /leaderboard — Gamification: host streaks, eco-milestone badges,
 * and platform leaderboard. Shows top hosts by sessions/earnings, eco milestones
 * (kgCO₂ avoided), and streak achievements.
 *
 * @module apps/web/app/(driver)/leaderboard
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Trophy, Zap, Leaf, Flame, Star, Medal } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type LeaderboardEntry = {
  rank: number
  userId: string
  displayName: string
  avatarUrl: string | null
  totalSessions: number
  totalKwhDelivered: number
  totalCo2Kg: number
  currentStreak: number
  isSuperhost: boolean
  badgeCount: number
  tier: string
}

type EcoMilestone = {
  id: string
  label: string
  icon: string
  thresholdKg: number
  earned: boolean
  earnedAt: string | null
}

/* ── API ─────────────────────────────────────────────────────── */

/** Fetches leaderboard and user eco milestones. */
async function fetchLeaderboard(tab: string): Promise<{ entries: LeaderboardEntry[]; userRank: number | null; milestones: EcoMilestone[] }> {
  const res = await fetch(`/api/v1/gamification/leaderboard?tab=${tab}`, { credentials: 'include' })
  const json = await res.json() as { data?: { entries: LeaderboardEntry[]; userRank: number | null; milestones: EcoMilestone[] } }
  return json.data ?? { entries: [], userRank: null, milestones: [] }
}

/* ── Helpers ─────────────────────────────────────────────────── */

const TIER_COLORS: Record<string, string> = {
  standard: 'text-gray-500', silver: 'text-gray-400',
  gold: 'text-amber-500', platinum: 'text-purple-500',
}

const RANK_MEDALS = ['🥇', '🥈', '🥉']

/* ── Page ───────────────────────────────────────────────────── */

type Tab = 'hosts' | 'drivers' | 'eco'

/** Gamification leaderboard page — top hosts, drivers, and eco milestones. */
export default function LeaderboardPage() {
  const [tab, setTab]             = useState<Tab>('hosts')
  const [data, setData]           = useState<{ entries: LeaderboardEntry[]; userRank: number | null; milestones: EcoMilestone[] } | null>(null)
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await fetchLeaderboard(tab)) }
    finally { setLoading(false) }
  }, [tab])

  useEffect(() => { void load() }, [load])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 text-center">
        <Trophy className="mx-auto mb-2 h-12 w-12 text-amber-500" />
        <h1 className="text-3xl font-extrabold text-gray-900">Zipgrid Leaderboard</h1>
        <p className="mt-1 text-sm text-gray-500">Top hosts, greenest drivers, and eco milestones.</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
        {(['hosts', 'drivers', 'eco'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors', tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
          >
            {t === 'hosts' ? '🏠 Top Hosts' : t === 'drivers' ? '⚡ Top Drivers' : '🌱 Eco Leaders'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-green-600" /></div>
      ) : !data ? null : (
        <>
          {/* User rank badge */}
          {data.userRank != null && (
            <div className="mb-5 rounded-xl bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-sm font-semibold text-green-800">Your rank: <span className="text-xl font-extrabold">#{data.userRank}</span></p>
            </div>
          )}

          {/* Eco milestones (shown in eco tab) */}
          {tab === 'eco' && data.milestones.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">Your eco milestones</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.milestones.map((m) => (
                  <div key={m.id} className={cn('rounded-xl border p-4 text-center', m.earned ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-50')}>
                    <span className="text-3xl">{m.icon}</span>
                    <p className="mt-1 text-xs font-semibold text-gray-700">{m.label}</p>
                    {m.earned && m.earnedAt && <p className="text-[10px] text-gray-400">{new Date(m.earnedAt).toLocaleDateString('en-GB')}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {data.entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No data yet — be the first!</div>
            ) : (
              data.entries.map((entry) => (
                <div key={entry.userId} className={cn('flex items-center gap-4 px-4 py-3.5', entry.rank > 1 && 'border-t border-gray-100')}>
                  {/* Rank */}
                  <div className="w-10 flex-shrink-0 text-center">
                    {entry.rank <= 3
                      ? <span className="text-xl">{RANK_MEDALS[entry.rank - 1]}</span>
                      : <span className="text-sm font-bold text-gray-400">#{entry.rank}</span>}
                  </div>

                  {/* Avatar */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-sm font-bold text-gray-600">
                    {entry.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from an arbitrary host, size unknown
                      ? <img src={entry.avatarUrl} alt="" className="h-full w-full object-cover" />
                      : entry.displayName[0]?.toUpperCase()}
                  </div>

                  {/* Name + badges */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">{entry.displayName}</span>
                      {entry.isSuperhost && <Star className="h-3.5 w-3.5 flex-shrink-0 text-amber-500 fill-amber-500" aria-label="Superhost" />}
                      <span className={cn('text-xs font-semibold capitalize', TIER_COLORS[entry.tier] ?? 'text-gray-400')}>{entry.tier}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-400">
                      {tab === 'hosts' && <><Zap className="h-3 w-3" />{entry.totalSessions} sessions</>}
                      {tab === 'drivers' && <><Flame className="h-3 w-3 text-orange-400" />{entry.currentStreak}w streak</>}
                      {tab === 'eco' && <><Leaf className="h-3 w-3 text-green-500" />{entry.totalCo2Kg.toFixed(1)} kgCO₂ avoided</>}
                      {entry.badgeCount > 0 && <><Medal className="h-3 w-3 text-amber-400" />{entry.badgeCount} badges</>}
                    </div>
                  </div>

                  {/* Stat */}
                  <div className="flex-shrink-0 text-right">
                    {tab === 'hosts' && <p className="text-sm font-bold text-gray-900">{entry.totalKwhDelivered.toFixed(0)} kWh</p>}
                    {tab === 'drivers' && <p className="text-sm font-bold text-gray-900">{entry.totalSessions} sessions</p>}
                    {tab === 'eco' && <p className="text-sm font-bold text-green-700">{entry.totalCo2Kg.toFixed(1)} kg</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
