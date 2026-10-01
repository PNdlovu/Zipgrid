/**
 * @file page.tsx
 * @description /host/listings — manage all host listings.
 * Shows list with status badges, earnings, session count, and actions.
 *
 * @module apps/web/app/(host)/listings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, MapPin, Zap, MoreVertical, Edit, PauseCircle,
  PlayCircle, Trash2, Eye, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Listing = {
  id: string
  title: string
  city: string
  postcode: string
  status: 'draft' | 'active' | 'paused' | 'under_review' | 'deactivated'
  chargerLevel: string
  maxPowerKw: number
  pricePerKwhPence: number | null
  averageRating: number | null
  reviewCount: number
  totalKwhDelivered: number
}

const STATUS_LABELS: Record<Listing['status'], { label: string; classes: string }> = {
  active:       { label: 'Live',         classes: 'border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]' },
  draft:        { label: 'Draft',        classes: 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]' },
  paused:       { label: 'Paused',       classes: 'border-yellow-400/30 bg-yellow-400/08 text-yellow-600' },
  under_review: { label: 'Under review', classes: 'border-blue-400/30 bg-blue-400/08 text-blue-600' },
  deactivated:  { label: 'Deactivated',  classes: 'border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.08)] text-[hsl(var(--destructive))]' },
}

/**
 * Host listings management page.
 */
export default function HostListingsPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchListings = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/host/listings')
      if (res.ok) {
        const data = await res.json() as { success: boolean; data: Listing[] }
        if (data.success) setListings(data.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchListings() }, [fetchListings])

  const handleAction = async (listingId: string, action: 'publish' | 'pause' | 'delete') => {
    setActionLoading(`${listingId}:${action}`)
    try {
      if (action === 'publish') {
        await fetch(`/api/v1/listings/${listingId}/publish`, { method: 'POST' })
      } else if (action === 'pause') {
        await fetch(`/api/v1/listings/${listingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) })
      } else {
        await fetch(`/api/v1/listings/${listingId}`, { method: 'DELETE' })
      }
      await fetchListings()
    } finally {
      setActionLoading(null)
      setOpenMenuId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Listings</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {listings.length} listing{listings.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/host/listings/new"
          className={cn(
            'flex h-9 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4',
            'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add listing
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-16">
          <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
        </div>
      )}

      {!loading && listings.length === 0 && (
        <div className="flex flex-col items-center gap-5 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-16 text-center">
          <MapPin className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
          <div className="flex flex-col gap-2">
            <p className="text-base font-semibold text-[hsl(var(--foreground))]">No listings yet</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Create your first listing to start earning from your charger.
            </p>
          </div>
          <Link
            href="/host/listings/new"
            className={cn(
              'flex h-10 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5',
              'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Create first listing
          </Link>
        </div>
      )}

      {!loading && listings.length > 0 && (
        <ul role="list" className="flex flex-col gap-3">
          {listings.map((listing) => {
            const statusInfo = STATUS_LABELS[listing.status]
            return (
              <li
                key={listing.id}
                className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:flex-row sm:items-center"
              >
                {/* Main info */}
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/host/listings/${listing.id}`}
                      className="text-base font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors"
                    >
                      {listing.title}
                    </Link>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusInfo.classes)}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {listing.city}, {listing.postcode}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" aria-hidden="true" />
                      {listing.maxPowerKw}kW · {listing.chargerLevel.replace('_', ' ')}
                    </span>
                    {listing.pricePerKwhPence && (
                      <span className="font-mono">£{(listing.pricePerKwhPence / 100).toFixed(2)}/kWh</span>
                    )}
                    {listing.averageRating && (
                      <span>★ {listing.averageRating.toFixed(1)} ({listing.reviewCount})</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="relative flex shrink-0 items-center gap-2">
                  <Link
                    href={`/listings/${listing.id}`}
                    target="_blank"
                    className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                    aria-label="Preview as driver"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href={`/host/listings/${listing.id}/edit`}
                    className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                    aria-label="Edit listing"
                  >
                    <Edit className="h-4 w-4" aria-hidden="true" />
                  </Link>

                  {/* More menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === listing.id ? null : listing.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                      aria-label="More options"
                      aria-expanded={openMenuId === listing.id}
                      aria-haspopup="true"
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {openMenuId === listing.id && (
                      <div
                        role="menu"
                        className={cn(
                          'absolute right-0 top-9 z-20 w-44 rounded-[6px] border border-[hsl(var(--border))]',
                          'bg-[hsl(var(--background))] shadow-lg',
                        )}
                      >
                        {listing.status === 'draft' && (
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => handleAction(listing.id, 'publish')}
                            disabled={actionLoading === `${listing.id}:publish`}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                          >
                            <PlayCircle className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                            Publish listing
                          </button>
                        )}
                        {listing.status === 'active' && (
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => handleAction(listing.id, 'pause')}
                            disabled={actionLoading === `${listing.id}:pause`}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                          >
                            <PauseCircle className="h-4 w-4 text-yellow-500" aria-hidden="true" />
                            Pause listing
                          </button>
                        )}
                        {listing.status === 'paused' && (
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => handleAction(listing.id, 'publish')}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                          >
                            <PlayCircle className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                            Resume listing
                          </button>
                        )}
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => { if (confirm('Deactivate this listing? This cannot be undone.')) void handleAction(listing.id, 'delete') }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.06)]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Deactivate
                        </button>
                      </div>
                    )}
                  </div>

                  {listing.status === 'draft' && (
                    <span className="flex items-center gap-1 text-[10px] text-yellow-600">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Not live
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
