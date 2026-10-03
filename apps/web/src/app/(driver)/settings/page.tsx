/**
 * @file page.tsx
 * @description /settings — Driver account settings.
 * Tabs: AI Mode, Notifications, Payments (saved cards), Privacy & GDPR,
 * Account / Danger Zone. ?tab=<key> opens a tab directly (e.g. ?tab=payments).
 *
 * @module apps/web/app/(driver)/settings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Zap, Bell, Shield, AlertTriangle, CheckCircle,
  Loader2, Download, Trash2, CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PaymentMethodsManager } from '@/components/payments/PaymentMethodsManager'

/* ── Types ───────────────────────────────────────────────── */

type AiMode = 'standard' | 'hybrid' | 'agentic'
type Tab    = 'ai'       | 'notifications' | 'payments' | 'privacy' | 'account'

type NotifPrefs = {
  emailEnabled: boolean
  smsEnabled:   boolean
  pushEnabled:  boolean
}

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'ai',            label: 'AI assistant',  icon: Zap },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'payments',      label: 'Payments',      icon: CreditCard },
  { key: 'privacy',       label: 'Privacy',       icon: Shield },
  { key: 'account',       label: 'Account',       icon: AlertTriangle },
]

const AI_MODES: { value: AiMode; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard',  description: 'One-step answers — quick, direct, and simple.' },
  { value: 'hybrid',   label: 'Hybrid',    description: 'Multi-step — finds chargers and manages bookings automatically. (Recommended)' },
  { value: 'agentic',  label: 'Agentic',   description: 'Fully autonomous — completes tasks with minimal prompts. Confirm before use.' },
]

/* ── Page ─────────────────────────────────────────────────── */

export default function DriverSettingsPage() {
  const [tab,        setTab]        = useState<Tab>('ai')

  // Deep link: /settings?tab=payments
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (TABS.some((t) => t.key === requested)) setTab(requested as Tab)
  }, [])
  const [aiMode,     setAiMode]     = useState<AiMode>('hybrid')
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({ emailEnabled: true, smsEnabled: false, pushEnabled: true })
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [success,    setSuccess]    = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  // GDPR state
  const [exportLoading,  setExportLoading]  = useState(false)
  const [deleteStep,     setDeleteStep]     = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle')
  const [deleteConfirm,  setDeleteConfirm]  = useState('')
  const [deletionDate,   setDeletionDate]   = useState<string | null>(null)
  const [cancelling,     setCancelling]     = useState(false)

  // Show an existing pending deletion request (with its cancel option).
  useEffect(() => {
    fetch('/api/v1/account/delete')
      .then((r) => r.json() as Promise<{ data?: { hasPendingRequest: boolean; request: { scheduledFor: string } | null } }>)
      .then((json) => {
        if (json.data?.hasPendingRequest && json.data.request) {
          setDeletionDate(json.data.request.scheduledFor)
          setDeleteStep('done')
        }
      })
      .catch(() => {})
  }, [])

  const handleCancelDeletion = async () => {
    setCancelling(true)
    try {
      const res = await fetch('/api/v1/account/delete', { method: 'DELETE' })
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } }
        setError(d.error?.message ?? 'Could not cancel the deletion request.')
        return
      }
      setDeleteStep('idle'); setDeleteConfirm(''); setDeletionDate(null)
      setSuccess('Your account deletion request has been cancelled.')
    } catch { setError('Network error.') }
    finally { setCancelling(false) }
  }

  const fetchPreferences = useCallback(async () => {
    setLoading(true)
    try {
      const [meRes, notifRes] = await Promise.all([
        fetch('/api/v1/auth/me'),
        fetch('/api/v1/notifications/preferences'),
      ])
      if (meRes.ok) {
        const d = (await meRes.json()) as { data: { aiMode: AiMode } }
        setAiMode(d.data.aiMode ?? 'hybrid')
      }
      if (notifRes.ok) {
        const d = (await notifRes.json()) as { data: NotifPrefs }
        setNotifPrefs(d.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchPreferences() }, [fetchPreferences])

  const handleSaveAiMode = async () => {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiMode }),
      })
      if (!res.ok) { setError('Failed to save. Please try again.') }
      else { setSuccess('AI mode updated.') }
    } finally { setSaving(false) }
  }

  const handleNotifToggle = async (field: keyof NotifPrefs) => {
    const updated = { ...notifPrefs, [field]: !notifPrefs[field] }
    setNotifPrefs(updated)
    await fetch('/api/v1/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: updated[field] }),
    }).catch(() => { /* best-effort */ })
  }

  const handleExportData = async () => {
    setExportLoading(true)
    try {
      const res = await fetch('/api/v1/account/export', { method: 'POST' })
      if (!res.ok) { setError('Export failed. Please try again.'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `zipgrid-data-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch { setError('Export failed.') }
    finally { setExportLoading(false) }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE MY ACCOUNT') return
    setDeleteStep('loading')
    try {
      const res = await fetch('/api/v1/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } }
        setError(d.error?.message ?? 'Deletion request failed.')
        setDeleteStep('confirm')
      } else {
        setDeletionDate(new Date(Date.now() + 30 * 86_400_000).toISOString())
        setDeleteStep('done')
      }
    } catch { setError('Network error.'); setDeleteStep('confirm') }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading settings" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
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

      {/* ── AI Mode ──────────────────────────────────────────── */}
      {tab === 'ai' && (
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Choose how autonomous the Zipgrid AI assistant is when you use voice commands or the chat interface.
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">AI assistant mode</legend>
            {AI_MODES.map((mode) => (
              <label
                key={mode.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-[6px] border p-4 transition-colors',
                  aiMode === mode.value
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_5%)]'
                    : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)_/_40%)]',
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
          </fieldset>
          <button
            onClick={() => { void handleSaveAiMode() }}
            disabled={saving}
            className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save preference
          </button>
        </div>
      )}

      {/* ── Notifications ─────────────────────────────────────── */}
      {tab === 'notifications' && (
        <div className="divide-y divide-[hsl(var(--border))] rounded-[6px] border border-[hsl(var(--border))]">
          {([
            { key: 'emailEnabled', label: 'Email',  desc: 'Booking confirmations, receipts, and session summaries' },
            { key: 'smsEnabled',   label: 'SMS',    desc: 'Urgent alerts — emergency mode, session faults' },
            { key: 'pushEnabled',  label: 'Push',   desc: 'Real-time in-app notifications' },
          ] as Array<{ key: keyof NotifPrefs; label: string; desc: string }>)
            .map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{desc}</p>
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
                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', notifPrefs[key] ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* ── Payments ──────────────────────────────────────────── */}
      {tab === 'payments' && <PaymentMethodsManager />}

      {/* ── Privacy ───────────────────────────────────────────── */}
      {tab === 'privacy' && (
        <div className="space-y-5">
          <div className="rounded-[6px] border border-[hsl(var(--border))] p-5">
            <h2 className="text-sm font-semibold">Download your data</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Under UK GDPR (Art. 20), you can download a copy of all your personal data. Your export includes bookings, sessions, wallet history, and account details.
            </p>
            <button
              onClick={() => { void handleExportData() }}
              disabled={exportLoading}
              className="mt-3 flex items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--muted))] disabled:opacity-60"
            >
              {exportLoading
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Download className="h-4 w-4" aria-hidden="true" />}
              {exportLoading ? 'Preparing export…' : 'Download data export'}
            </button>
          </div>
          <div className="rounded-[6px] border border-[hsl(var(--border))] p-5">
            <h2 className="text-sm font-semibold">Data retention</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Transaction records are retained for 7 years (HMRC requirement). Charging session energy data for 2 years. All other personal data is deleted on account closure.
            </p>
          </div>
          <div className="rounded-[6px] border border-[hsl(var(--border))] p-5">
            <h2 className="text-sm font-semibold">Consent management</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              We only use analytics and personalisation cookies. We never sell your data. See our <Link href="/legal/privacy" className="text-[hsl(var(--primary))] hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      )}

      {/* ── Account / Danger zone ─────────────────────────────── */}
      {tab === 'account' && (
        <div className="space-y-5">
          {/* Profile link */}
          <Link
            href="/profile"
            className="flex items-center justify-between rounded-[6px] border border-[hsl(var(--border))] p-4 transition-colors hover:bg-[hsl(var(--muted))]"
          >
            <div>
              <p className="text-sm font-medium">Edit profile</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Name, photo, phone number, KYC verification</p>
            </div>
            <span className="text-xs text-[hsl(var(--primary))]">Edit →</span>
          </Link>

          {/* Danger zone */}
          {deleteStep === 'done' ? (
            <div className="rounded-[6px] border border-[hsl(var(--primary)_/_30%)] bg-[hsl(var(--primary)_/_5%)] p-5 text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-[hsl(var(--primary))]" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Deletion request submitted</p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Your account will be deleted on {deletionDate ? new Date(deletionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the end of the 30-day cooling-off period'}.
                You can cancel until then.
              </p>
              <button
                onClick={() => { void handleCancelDeletion() }}
                disabled={cancelling}
                className="mt-3 inline-flex items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-4 py-2 text-xs font-medium hover:bg-[hsl(var(--muted))] disabled:opacity-60"
              >
                {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Cancel deletion request
              </button>
            </div>
          ) : (
            <div className="rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_5%)] p-5">
              <h2 className="text-sm font-semibold text-[hsl(var(--destructive))]">Delete account</h2>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Permanently deletes your account after a 30-day cooling-off period. Financial records are kept for HMRC compliance (7 years).
                Money you topped up into your wallet is refunded to your card; promotional and reward credit is forfeited.
                Upcoming bookings and any outstanding balance must be settled first.
              </p>
              {deleteStep === 'idle' && (
                <button
                  onClick={() => setDeleteStep('confirm')}
                  className="mt-3 flex items-center gap-2 rounded-[6px] border border-[hsl(var(--destructive)_/_40%)] px-4 py-2 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_8%)]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Request account deletion
                </button>
              )}
              {deleteStep === 'confirm' && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs font-medium">
                    Type <strong>DELETE MY ACCOUNT</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    className="h-10 w-full rounded-[6px] border border-[hsl(var(--destructive)_/_40%)] bg-[hsl(var(--background))] px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--destructive))]"
                    aria-label="Type DELETE MY ACCOUNT to confirm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { void handleDeleteAccount() }}
                      disabled={deleteConfirm !== 'DELETE MY ACCOUNT'}
                      className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--destructive))] py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete my account
                    </button>
                    <button
                      onClick={() => { setDeleteStep('idle'); setDeleteConfirm('') }}
                      className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-2 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {deleteStep === 'loading' && (
                <div className="mt-3 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Submitting request…
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
