/**
 * @file page.tsx
 * @description /host/settings — Host account settings.
 * Tabs: Payout (Stripe Connect), Profile, Notifications, Danger Zone.
 *
 * @module apps/web/app/(host)/settings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, User, Bell, AlertTriangle,
  ExternalLink, CheckCircle, Loader2, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type Tab = 'payout' | 'profile' | 'notifications' | 'danger'

type HostProfile = {
  displayName: string
  email: string
  phoneNumber: string | null
  stripeConnectAccountId: string | null
  stripeConnectOnboarded: boolean
  emailEnabled: boolean
  smsEnabled: boolean
  pushEnabled: boolean
}

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'payout',        label: 'Payout',        icon: CreditCard },
  { key: 'profile',       label: 'Profile',        icon: User },
  { key: 'notifications', label: 'Notifications',  icon: Bell },
  { key: 'danger',        label: 'Danger zone',    icon: AlertTriangle },
]

/* ── Page ─────────────────────────────────────────────── */

export default function HostSettingsPage() {
  const [tab, setTab]             = useState<Tab>('payout')
  const [profile, setProfile]     = useState<HostProfile | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [success, setSuccess]     = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  // Edit state
  const [displayName, setDisplayName]   = useState('')
  const [phoneNumber, setPhoneNumber]   = useState('')

  const fetchProfile = useCallback(async () => {
    try {
      const [meRes, prefsRes, stripeRes] = await Promise.all([
        fetch('/api/v1/auth/me'),
        fetch('/api/v1/notifications/preferences'),
        fetch('/api/v1/host/stripe-onboarding'),
      ])
      if (meRes.ok) {
        const d = (await meRes.json()) as {
          data: { displayName: string; email: string; phoneNumber: string | null }
        }
        const stripe = stripeRes.ok
          ? (await stripeRes.json()) as {
              data: { stripeConnectAccountId: string | null; stripeConnectOnboarded: boolean }
            }
          : null

        setProfile({
          displayName: d.data.displayName,
          email: d.data.email,
          phoneNumber: d.data.phoneNumber,
          stripeConnectAccountId: stripe?.data.stripeConnectAccountId ?? null,
          stripeConnectOnboarded: stripe?.data.stripeConnectOnboarded ?? false,
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: true,
        })
        setDisplayName(d.data.displayName)
        setPhoneNumber(d.data.phoneNumber ?? '')
      }
      if (prefsRes.ok) {
        const d = (await prefsRes.json()) as {
          data: { emailEnabled: boolean; smsEnabled: boolean; pushEnabled: boolean }
        }
        setProfile((prev) => prev ? { ...prev, ...d.data } : prev)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchProfile() }, [fetchProfile])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, phoneNumber: phoneNumber || undefined }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        setError(body.error?.message ?? 'Save failed')
      } else {
        setSuccess('Profile updated.')
        await fetchProfile()
      }
    } finally { setSaving(false) }
  }

  async function handleStartStripeOnboarding() {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/v1/host/stripe-onboarding', { method: 'POST' })
      if (res.ok) {
        const d = (await res.json()) as { data: { onboardingUrl: string } }
        window.location.href = d.data.onboardingUrl
      } else {
        setError('Could not start Stripe onboarding. Please try again.')
      }
    } finally { setSaving(false) }
  }

  async function handleNotifToggle(field: 'emailEnabled' | 'smsEnabled' | 'pushEnabled') {
    if (!profile) return
    const newVal = !profile[field]
    setProfile((p) => p ? { ...p, [field]: newVal } : p)
    await fetch('/api/v1/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newVal }),
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>

      {/* Tab bar */}
      <div role="tablist" className="mb-6 flex overflow-x-auto border-b border-[hsl(var(--border))]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => { setTab(key); setSuccess(null); setError(null) }}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === key
                ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {success && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary)_/_10%)] px-4 py-3 text-sm font-medium text-[hsl(var(--primary))]">
          <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {success}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)_/_10%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ── Payout tab ────────────────────────────────────── */}
      {tab === 'payout' && (
        <div className="space-y-6">
          <div className="rounded-[6px] border border-[hsl(var(--border))] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Bank account (Stripe Connect)</h2>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  Connect your bank account to receive weekly payouts for completed sessions.
                </p>
              </div>
              {profile?.stripeConnectOnboarded && (
                <CheckCircle className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-label="Connected" />
              )}
            </div>

            {profile?.stripeConnectOnboarded ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-[6px] bg-[hsl(var(--muted))] px-3 py-2 text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">Account</span>
                  <span className="font-mono text-xs">{profile.stripeConnectAccountId ?? 'Connected'}</span>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Payouts are processed every Monday for the previous week's sessions. Minimum payout: £5.
                </p>
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[hsl(var(--primary))] hover:underline"
                >
                  View in Stripe Dashboard
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  You won't receive payouts until you connect a bank account.
                </div>
                <button
                  onClick={() => { void handleStartStripeOnboarding() }}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                  Connect bank account
                </button>
              </div>
            )}
          </div>

          <div className="rounded-[6px] border border-[hsl(var(--border))] p-5">
            <h2 className="text-base font-semibold">Commission</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Zipgrid charges a <strong>15% platform fee</strong> on each completed session.
              Your net earnings are the remaining 85% of the session total.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                { label: 'Session total', value: '£10.00' },
                { label: 'Platform fee (15%)', value: '£1.50' },
                { label: 'Your payout', value: '£8.50' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-[6px] bg-[hsl(var(--muted))] p-2">
                  <p className="text-[hsl(var(--muted-foreground))]">{label}</p>
                  <p className="mt-0.5 font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Profile tab ───────────────────────────────────── */}
      {tab === 'profile' && (
        <form onSubmit={(e) => { void handleSaveProfile(e) }} className="space-y-5">
          <div>
            <label htmlFor="displayName" className="mb-1 block text-sm font-medium">Display name</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              className="h-11 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              value={profile?.email ?? ''}
              disabled
              className="h-11 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3.5 text-sm text-[hsl(var(--muted-foreground))] cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Email changes require identity re-verification.</p>
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium">Phone number</label>
            <input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+44 7700 900000"
              className="h-11 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save changes
          </button>
        </form>
      )}

      {/* ── Notifications tab ─────────────────────────────── */}
      {tab === 'notifications' && profile && (
        <div className="divide-y divide-[hsl(var(--border))] rounded-[6px] border border-[hsl(var(--border))]">
          {([
            { key: 'emailEnabled', label: 'Email', desc: 'Booking confirmations, payout receipts, session summaries' },
            { key: 'smsEnabled',   label: 'SMS',   desc: 'Urgent alerts — new booking, charger fault, emergency mode' },
            { key: 'pushEnabled',  label: 'Push',  desc: 'Real-time in-app notifications' },
          ] as Array<{ key: 'emailEnabled' | 'smsEnabled' | 'pushEnabled'; label: string; desc: string }>)
            .map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{desc}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={profile[key]}
                  onClick={() => { void handleNotifToggle(key) }}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:ring-offset-2',
                    profile[key] ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]',
                  )}
                  aria-label={`Toggle ${label} notifications`}
                >
                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', profile[key] ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* ── Danger zone tab ───────────────────────────────── */}
      {tab === 'danger' && (
        <div className="space-y-5">
          <div className="rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_5%)] p-5">
            <h2 className="text-base font-semibold text-[hsl(var(--destructive))]">Delete account</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Permanently delete your Zipgrid account. All your listings will be deactivated
              and your personal data will be anonymised within 30 days (UK GDPR Art. 17).
              Transaction records are retained for 7 years for tax compliance.
            </p>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Active bookings must be cancelled before requesting deletion.
            </p>
            <a
              href="/account/delete"
              className="mt-4 flex w-fit items-center gap-1.5 rounded-[6px] border border-[hsl(var(--destructive))] px-4 py-2 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_10%)]"
            >
              Request account deletion
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
