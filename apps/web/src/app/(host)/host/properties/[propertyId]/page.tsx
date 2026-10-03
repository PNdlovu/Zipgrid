/**
 * @file page.tsx
 * @description /host/properties/:id — manage one property: bays, residents
 * and settings (tabs).
 *
 * @module apps/web/app/(host)/host/properties/[propertyId]
 */

'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PropertyBay, PropertyDetail, PropertyResident } from '@/domains/property/PropertyService'
import {
  PropertyForm, inputClass, primaryButton, secondaryButton, type PropertyFormValues, toPropertyBody,
} from '@/components/property/PropertyForm'
import { pounds, propertyApi } from '@/components/property/api'

type Tab = 'bays' | 'residents' | 'settings'

const card = 'rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]'
const muted = 'text-[hsl(var(--muted-foreground))]'

function toFormValues(p: PropertyDetail): PropertyFormValues {
  return {
    name: p.name, addressLine1: p.addressLine1, addressLine2: p.addressLine2 ?? '', city: p.city,
    postcode: p.postcode, totalUnits: p.totalUnits ? String(p.totalUnits) : '',
    revenueModel: p.revenueModel, splitPropertyPct: p.revenueModel === 'split' ? p.splitPropertyPct : 70,
    accessMode: p.accessMode, residentDiscountPct: p.residentDiscountPct,
  }
}

/** Property management page. */
export default function PropertyDetailPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = use(params)
  const [property, setProperty] = useState<PropertyDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('bays')

  const reload = useCallback(async () => {
    try {
      setProperty(await propertyApi<PropertyDetail>(`/${propertyId}`))
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [propertyId])

  useEffect(() => { void reload() }, [reload])

  if (loadError && !property) {
    return (
      <div className="flex flex-col gap-4 p-6 lg:p-8">
        <BackLink />
        <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{loadError}</p>
      </div>
    )
  }
  if (!property) {
    return (
      <div className="flex items-center justify-center p-16">
        <RefreshCw className={cn('h-6 w-6 animate-spin', muted)} aria-label="Loading" />
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bays', label: `Bays (${property.bays.length})` },
    { id: 'residents', label: `Residents (${property.residents.length})` },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <BackLink />
        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">{property.name}</h1>
        <p className={cn('text-sm', muted)}>
          {property.addressLine1}{property.addressLine2 ? `, ${property.addressLine2}` : ''}, {property.city} {property.postcode}
          {' · '}{pounds(property.last30DaysRevenuePence)} in the last 30 days
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-[hsl(var(--border))]">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-[hsl(var(--primary))] text-[hsl(var(--foreground))]'
                : cn('border-transparent hover:text-[hsl(var(--foreground))]', muted),
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bays' && <BaysTab property={property} reload={reload} />}
      {tab === 'residents' && <ResidentsTab property={property} reload={reload} />}
      {tab === 'settings' && <SettingsTab property={property} reload={reload} />}
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/host/properties" className={cn('inline-flex items-center gap-1 text-sm hover:text-[hsl(var(--foreground))]', muted)}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Properties
    </Link>
  )
}

/** Runs an action, tracking which key is busy and surfacing the error. */
function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await reload()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, run }
}

/* ── Bays ───────────────────────────────────────────────────── */

function BaysTab({ property, reload }: { property: PropertyDetail; reload: () => Promise<void> }) {
  const { busy, error, run } = useAction(reload)
  const [listingId, setListingId] = useState('')
  const [label, setLabel] = useState('')
  const active = property.residents.filter((r) => r.status === 'active')

  const addBay = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await run('add', () => propertyApi(`/${property.id}/bays`, { method: 'POST', body: { listingId, bayLabel: label } }))
    if (ok) { setListingId(''); setLabel('') }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}

      <form onSubmit={addBay} className={cn(card, 'flex flex-col gap-3 p-5 sm:flex-row sm:items-end')}>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">Add a charger as a bay</span>
          <select required className={inputClass} value={listingId} onChange={(e) => setListingId(e.target.value)}>
            <option value="">
              {property.availableListings.length ? 'Choose a listing…' : 'All your listings are already bays'}
            </option>
            {property.availableListings.map((l) => (
              <option key={l.id} value={l.id}>{l.title}{l.status !== 'active' ? ` (${l.status})` : ''}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:w-40">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">Bay label</span>
          <input className={inputClass} maxLength={40} placeholder="e.g. B12" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <button type="submit" disabled={!listingId || busy === 'add'} className={primaryButton}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add bay
        </button>
      </form>
      {property.availableListings.length === 0 && (
        <p className={cn('text-xs', muted)}>
          Need another bay? <Link href="/host/listings/new" className="underline">Create a listing</Link> for the charger first.
        </p>
      )}

      {property.bays.length === 0 ? (
        <p className={cn(card, 'p-8 text-center text-sm', muted)}>No bays yet.</p>
      ) : (
        <ul role="list" className={cn(card, 'divide-y divide-[hsl(var(--border))]')}>
          {property.bays.map((b) => (
            <BayRow key={b.id} bay={b} propertyId={property.id} residents={active} busy={busy} run={run} />
          ))}
        </ul>
      )}
      <p className={cn('text-xs', muted)}>
        Only residents who have accepted their invite can be assigned a bay. Removing a bay keeps the listing live; it then pays you in full.
      </p>
    </div>
  )
}

function BayRow({ bay, propertyId, residents, busy, run }: {
  bay: PropertyBay
  propertyId: string
  residents: PropertyResident[]
  busy: string | null
  run: (key: string, fn: () => Promise<unknown>) => Promise<boolean>
}) {
  const [label, setLabel] = useState(bay.bayLabel ?? '')
  const path = `/${propertyId}/bays/${bay.id}`
  const saveLabel = () => {
    if (label === (bay.bayLabel ?? '')) return
    void run(bay.id, () => propertyApi(path, { method: 'PATCH', body: { bayLabel: label } }))
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{bay.listingTitle}</p>
        <p className={cn('text-xs', muted)}>{bay.listingStatus === 'active' ? 'Live' : bay.listingStatus}</p>
      </div>
      <input
        aria-label="Bay label"
        className={cn(inputClass, 'sm:w-28')}
        maxLength={40}
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
      />
      <select
        aria-label="Assigned resident"
        className={cn(inputClass, 'sm:w-56')}
        value={bay.assignedResidentId ?? ''}
        disabled={busy === bay.id}
        onChange={(e) => void run(bay.id, () => propertyApi(path, { method: 'PATCH', body: { assignedResidentId: e.target.value || null } }))}
      >
        <option value="">Shared (no resident)</option>
        {residents.map((r) => (
          <option key={r.id} value={r.id}>{r.name ?? r.email}{r.unitNumber ? ` · ${r.unitNumber}` : ''}</option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`Remove ${bay.listingTitle}`}
        disabled={busy === bay.id}
        className={secondaryButton}
        onClick={() => {
          if (confirm(`Remove ${bay.bayLabel ?? bay.listingTitle} from this property?`)) {
            void run(bay.id, () => propertyApi(path, { method: 'DELETE' }))
          }
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

/* ── Residents ──────────────────────────────────────────────── */

function ResidentsTab({ property, reload }: { property: PropertyDetail; reload: () => Promise<void> }) {
  const { busy, error, run } = useAction(reload)
  const [email, setEmail] = useState('')
  const [unit, setUnit] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotice(null)
    const sent = email
    const ok = await run('invite', () => propertyApi(`/${property.id}/residents`, { method: 'POST', body: { email, unitNumber: unit } }))
    if (ok) { setEmail(''); setUnit(''); setNotice(`Invite sent to ${sent}.`) }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
      {notice && <p role="status" className="text-sm text-[hsl(var(--primary))]">{notice}</p>}

      <form onSubmit={invite} className={cn(card, 'flex flex-col gap-3 p-5 sm:flex-row sm:items-end')}>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">Invite a resident</span>
          <input type="email" required maxLength={254} className={inputClass} placeholder="resident@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 sm:w-32">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">Flat / unit</span>
          <input maxLength={30} className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <button type="submit" disabled={busy === 'invite'} className={primaryButton}>
          <Mail className="h-4 w-4" aria-hidden="true" /> Send invite
        </button>
      </form>
      <p className={cn('text-xs', muted)}>
        Residents get an emailed link valid for 14 days and must accept it with the same email address.
      </p>

      {property.residents.length === 0 ? (
        <p className={cn(card, 'p-8 text-center text-sm', muted)}>No residents yet.</p>
      ) : (
        <ul role="list" className={cn(card, 'divide-y divide-[hsl(var(--border))]')}>
          {property.residents.map((r) => (
            <ResidentRow key={r.id} resident={r} propertyId={property.id} busy={busy} run={run} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ResidentRow({ resident: r, propertyId, busy, run }: {
  resident: PropertyResident
  propertyId: string
  busy: string | null
  run: (key: string, fn: () => Promise<unknown>) => Promise<boolean>
}) {
  const [unit, setUnit] = useState(r.unitNumber ?? '')
  const path = `/${propertyId}/residents/${r.id}`
  const expired = r.status === 'invited' && r.inviteExpiresAt !== null && new Date(r.inviteExpiresAt) < new Date()

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{r.name ?? r.email}</p>
        <p className={cn('truncate text-xs', muted)}>
          {r.name ? `${r.email} · ` : ''}
          {r.status === 'active'
            ? `Joined ${new Date(r.acceptedAt ?? r.invitedAt).toLocaleDateString('en-GB')}`
            : expired ? 'Invite expired' : `Invited ${new Date(r.invitedAt).toLocaleDateString('en-GB')}`}
        </p>
      </div>
      <input
        aria-label="Flat / unit"
        className={cn(inputClass, 'sm:w-28')}
        maxLength={30}
        placeholder="Unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        onBlur={() => {
          if (unit !== (r.unitNumber ?? '')) void run(r.id, () => propertyApi(path, { method: 'PATCH', body: { unitNumber: unit } }))
        }}
      />
      {r.status === 'invited' && (
        <button
          type="button"
          disabled={busy === r.id}
          className={secondaryButton}
          onClick={() => void run(r.id, () => propertyApi(`${path}/resend`, { method: 'POST' }))}
        >
          Resend
        </button>
      )}
      <button
        type="button"
        aria-label={`Remove ${r.email}`}
        disabled={busy === r.id}
        className={secondaryButton}
        onClick={() => {
          const msg = r.status === 'active'
            ? `Remove ${r.name ?? r.email}? Their bays will be unassigned. Earnings they already have stay theirs.`
            : `Cancel the invite to ${r.email}?`
          if (confirm(msg)) void run(r.id, () => propertyApi(path, { method: 'DELETE' }))
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

/* ── Settings ───────────────────────────────────────────────── */

function SettingsTab({ property, reload }: { property: PropertyDetail; reload: () => Promise<void> }) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const archive = async () => {
    if (!confirm(`Archive ${property.name}? This cannot be undone.`)) return
    setArchiving(true)
    setError(null)
    try {
      await propertyApi(`/${property.id}`, { method: 'DELETE' })
      router.push('/host/properties')
    } catch (e) {
      setError((e as Error).message)
      setArchiving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {saved && <p role="status" className="text-sm text-[hsl(var(--primary))]">Settings saved.</p>}
      <PropertyForm
        initial={toFormValues(property)}
        submitLabel="Save settings"
        note="A change to the split applies to sessions from now on."
        onSubmit={async (v) => {
          setSaved(false)
          try {
            await propertyApi(`/${property.id}`, { method: 'PATCH', body: toPropertyBody(v) })
            await reload()
            setSaved(true)
            return null
          } catch (e) {
            return (e as Error).message
          }
        }}
      />

      <section className={cn(card, 'flex flex-col gap-3 border-[hsl(var(--destructive)/0.4)] p-5')}>
        <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Archive property</h2>
        <p className={cn('text-sm', muted)}>
          Bays are released (their listings stay live and pay you in full) and every resident&apos;s membership ends.
          Earnings already paid out or allocated are not affected.
        </p>
        {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
        <div>
          <button
            type="button"
            disabled={archiving}
            className={cn(secondaryButton, 'border-[hsl(var(--destructive)/0.5)] text-[hsl(var(--destructive))]')}
            onClick={() => void archive()}
          >
            Archive property
          </button>
        </div>
      </section>
    </div>
  )
}
