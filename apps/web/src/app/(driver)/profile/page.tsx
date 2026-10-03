/**
 * @file page.tsx
 * @description Driver profile page — view and update account details,
 * KYC verification, AI mode preference, notification preferences.
 *
 * @module apps/web/app/(driver)/profile
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, Shield, Bell, Zap, ChevronRight,
  CheckCircle, Clock, AlertCircle, Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type Profile = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  phoneNumber: string | null
  phoneVerified: boolean
  emailVerified: boolean
  kycStatus: 'not_started' | 'pending' | 'verified' | 'rejected'
  roles: string[]
  aiMode: 'standard' | 'hybrid' | 'agentic'
}

type NotifPrefs = {
  emailEnabled: boolean
  smsEnabled: boolean
  pushEnabled: boolean
}

/* ── KYC badge ────────────────────────────────────────────── */

function KycBadge({ status }: { status: Profile['kycStatus'] }) {
  const map = {
    verified:    { label: 'Verified', icon: CheckCircle, cls: 'text-[hsl(var(--primary))]' },
    pending:     { label: 'Pending',  icon: Clock,       cls: 'text-amber-500' },
    rejected:    { label: 'Rejected', icon: AlertCircle, cls: 'text-[hsl(var(--destructive))]' },
    not_started: { label: 'Not verified', icon: AlertCircle, cls: 'text-[hsl(var(--muted-foreground))]' },
  }
  const { label, icon: Icon, cls } = map[status]
  return (
    <span className={cn('flex items-center gap-1 text-sm font-medium', cls)}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  )
}

/* ── AI mode labels ───────────────────────────────────────── */

const AI_MODES: { value: Profile['aiMode']; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard',  description: 'One-step answers — quick and simple' },
  { value: 'hybrid',   label: 'Hybrid',    description: 'Multi-step — finds chargers and manages bookings (default)' },
  { value: 'agentic',  label: 'Agentic',   description: 'Fully autonomous — completes tasks with minimal prompts' },
]

/* ── Page ─────────────────────────────────────────────────── */

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Edit state
  const [displayName, setDisplayName] = useState('')
  const [aiMode, setAiMode] = useState<Profile['aiMode']>('hybrid')

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  useEffect(() => {
    void fetchProfile()
  }, [])

  async function fetchProfile() {
    setLoading(true)
    try {
      const [profileRes, prefsRes] = await Promise.all([
        fetch('/api/v1/auth/me'),
        fetch('/api/v1/notifications/preferences'),
      ])

      if (profileRes.ok) {
        const data = (await profileRes.json()) as { data: Profile }
        setProfile(data.data)
        setDisplayName(data.data.displayName)
        setAiMode(data.data.aiMode)
      }
      if (prefsRes.ok) {
        const data = (await prefsRes.json()) as { data: NotifPrefs }
        setNotifPrefs(data.data)
      }
    } catch {
      setError('Failed to load profile.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, aiMode }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } }
        setError(err.error?.message ?? 'Save failed.')
      } else {
        setSuccess('Profile updated.')
        await fetchProfile()
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleNotifToggle(field: keyof NotifPrefs) {
    if (!notifPrefs) return
    const updated = { ...notifPrefs, [field]: !notifPrefs[field] }
    setNotifPrefs(updated)
    await fetch('/api/v1/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: updated[field] }),
    })
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setError(null)
    setSuccess(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/v1/account/avatar', { method: 'POST', body: form })
      const json = await res.json() as { success: boolean; data?: { avatarUrl: string }; error?: { message: string } }
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Avatar upload failed. Please try again.')
        return
      }
      setSuccess('Profile photo updated.')
      await fetchProfile()
    } catch {
      setError('Network error uploading photo. Please try again.')
    } finally {
      setUploadingAvatar(false)
      // Reset file input so the same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  async function handleStartKyc() {
    try {
      const res = await fetch('/api/v1/auth/kyc/initiate', { method: 'POST' })
      if (res.ok) {
        const data = (await res.json()) as { data: { clientSecret: string } }
        // In production: load Stripe Identity SDK and call stripe.verifyIdentity(clientSecret)
        // For now redirect to a placeholder KYC flow page
        router.push(`/profile/kyc?session=${data.data.clientSecret}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" aria-label="Loading" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">
        Could not load profile.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Profile</h1>

      {/* Avatar + name display */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
              <User className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            </div>
          )}
          {/* Hidden file input */}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            aria-label="Choose profile photo"
            onChange={handleAvatarChange}
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-white disabled:opacity-60"
            aria-label="Change profile photo"
          >
            <Camera className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
        <div>
          <p className="text-lg font-semibold">{profile.displayName}</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{profile.email}</p>
          {uploadingAvatar && (
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Uploading…</p>
          )}
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-[hsl(var(--destructive)_/_10%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="mb-4 rounded-lg bg-[hsl(var(--primary)_/_10%)] px-4 py-3 text-sm text-[hsl(var(--primary))]">
          {success}
        </div>
      )}

      {/* Edit form */}
      <form onSubmit={(e) => { void handleSaveProfile(e) }} className="space-y-5">
        {/* Display name */}
        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
          />
        </div>

        {/* Phone number */}
        <div>
          <p className="mb-1 text-sm font-medium">Phone number</p>
          <div className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-2">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {profile.phoneNumber ?? 'Not added'}
            </span>
            {profile.phoneVerified && (
              <CheckCircle className="h-4 w-4 text-[hsl(var(--primary))]" aria-label="Verified" />
            )}
          </div>
        </div>

        {/* AI mode */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">AI assistant mode</legend>
          <div className="space-y-2">
            {AI_MODES.map((mode) => (
              <label
                key={mode.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  aiMode === mode.value
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_5%)]'
                    : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)_/_50%)]',
                )}
              >
                <input
                  type="radio"
                  name="aiMode"
                  value={mode.value}
                  checked={aiMode === mode.value}
                  onChange={() => setAiMode(mode.value)}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <div>
                  <p className="text-sm font-medium">{mode.label}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{mode.description}</p>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-[hsl(var(--primary))] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {/* Identity verification */}
      <section className="mt-8" aria-labelledby="kyc-heading">
        <h2 id="kyc-heading" className="mb-3 text-base font-semibold">Identity verification</h2>
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">ID check</p>
                <KycBadge status={profile.kycStatus} />
              </div>
            </div>
            {profile.kycStatus !== 'verified' && (
              <button
                onClick={() => { void handleStartKyc() }}
                disabled={saving || profile.kycStatus === 'pending'}
                className="flex items-center gap-1 rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {profile.kycStatus === 'pending' ? 'Pending' : 'Verify now'}
                {profile.kycStatus !== 'pending' && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            Required to book your first session. Takes under 2 minutes.
          </p>
        </div>
      </section>

      {/* Notification preferences */}
      {notifPrefs && (
        <section className="mt-8" aria-labelledby="notif-heading">
          <h2 id="notif-heading" className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Bell className="h-4 w-4" aria-hidden="true" />
            Notifications
          </h2>
          <div className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))]">
            {(
              [
                { key: 'emailEnabled',  label: 'Email',       description: 'Booking confirmations, receipts, session summaries' },
                { key: 'smsEnabled',    label: 'SMS',         description: 'Urgent alerts only — session started, emergency mode' },
                { key: 'pushEnabled',   label: 'Push',        description: 'Real-time in-app notifications' },
              ] as Array<{ key: keyof NotifPrefs; label: string; description: string }>
            ).map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={notifPrefs[key]}
                  onClick={() => { void handleNotifToggle(key) }}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:ring-offset-2',
                    notifPrefs[key] ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]',
                  )}
                  aria-label={`Toggle ${label} notifications`}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                      notifPrefs[key] ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick links */}
      <section className="mt-8 space-y-2" aria-label="Account links">
        {[
          { label: 'My vehicles', href: '/vehicles', icon: Zap },
          { label: 'Manage vehicles →', href: '/vehicles', icon: ChevronRight },
        ].slice(0, 1).map(({ label, href, icon: Icon }) => (
          <a
            key={href}
            href={href}
            className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-4 py-3 transition-colors hover:bg-[hsl(var(--muted))]"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          </a>
        ))}
      </section>
    </div>
  )
}
