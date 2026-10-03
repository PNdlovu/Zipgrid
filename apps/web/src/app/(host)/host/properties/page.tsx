/**
 * @file page.tsx
 * @description /host/properties — residential buildings the host manages.
 *
 * @module apps/web/app/(host)/host/properties
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import type { PropertySummary } from '@/domains/property/PropertyService'
import { pounds, propertyApi } from '@/components/property/api'
import { primaryButton } from '@/components/property/PropertyForm'

const ACCESS_LABEL: Record<PropertySummary['accessMode'], string> = {
  residents_priority: 'Residents first',
  residents_only: 'Residents only',
  public: 'Open to everyone',
}

function revenueLabel(p: PropertySummary): string {
  if (p.revenueModel === 'property') return 'Property keeps earnings'
  if (p.revenueModel === 'resident') return 'Residents keep earnings'
  return `Split ${p.splitPropertyPct}/${100 - p.splitPropertyPct}`
}

/** Host's property list. */
export default function HostPropertiesPage() {
  const [properties, setProperties] = useState<PropertySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    propertyApi<{ properties: PropertySummary[] }>('')
      .then((d) => setProperties(d.properties))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Properties</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Group your chargers into a building&apos;s bays, invite residents and share the revenue.
          </p>
        </div>
        <Link href="/host/properties/new" className={primaryButton}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add property
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-16">
          <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}

      {!loading && !error && properties.length === 0 && (
        <div className="flex flex-col items-center gap-5 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-16 text-center">
          <Building2 className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
          <div className="flex flex-col gap-2">
            <p className="text-base font-semibold text-[hsl(var(--foreground))]">No properties yet</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Manage charging for a block of flats or a shared car park.
            </p>
          </div>
          <Link href="/host/properties/new" className={primaryButton}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add your first property
          </Link>
        </div>
      )}

      {!loading && properties.length > 0 && (
        <ul role="list" className="grid gap-3 md:grid-cols-2">
          {properties.map((p) => (
            <li key={p.id}>
              <Link
                href={`/host/properties/${p.id}`}
                className="flex h-full flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-colors hover:bg-[hsl(var(--secondary)/0.5)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{p.name}</p>
                    <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                      {p.addressLine1}, {p.city} {p.postcode}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <Stat label="Bays" value={`${p.activeBays}/${p.totalBays} live`} />
                  <Stat label="Residents" value={`${p.totalResidents}${p.pendingInvites ? ` (+${p.pendingInvites} invited)` : ''}`} />
                  <Stat label="Last 30 days" value={pounds(p.last30DaysRevenuePence)} />
                </dl>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {ACCESS_LABEL[p.accessMode]} · {revenueLabel(p)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="font-medium text-[hsl(var(--foreground))]">{value}</dd>
    </div>
  )
}
