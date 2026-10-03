/**
 * @file page.tsx
 * @description /marketplace/installers/[id] — Installer profile + service booking.
 * Shows the installer's certifications, portfolio, reviews, and a booking form
 * that places a hold on one of the driver's saved cards via /api/v1/marketplace/checkout.
 *
 * @module apps/web/app/(marketplace)/marketplace/installers/[id]
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Star, CheckCircle2, MapPin, Wrench, Loader2,
  AlertTriangle, ArrowLeft, Shield, Phone, Globe,
  CalendarDays, PoundSterling,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'

/* ── Types ──────────────────────────────────────────────────── */

type InstallerDetail = {
  id: string
  companyName: string
  tradingName: string | null
  description: string | null
  longBio: string | null
  logoUrl: string | null
  phone: string | null
  website: string | null
  isOzevApproved: boolean
  certifications: string[]
  serviceCategories: string[]
  averageRating: number | null
  reviewCount: number
  completedJobs: number
  baseChargePence: number | null
  coveragePostcodes: string[]
  jobs: InstallerJob[]
}

type InstallerJob = {
  id: string
  title: string
  description: string | null
  serviceCategory: string
  quotePence: number
  estimatedDays: number | null
  status: string
}

/* ── API ─────────────────────────────────────────────────────── */

/** Fetches a single installer profile with available jobs. */
async function fetchInstaller(id: string): Promise<InstallerDetail> {
  const res = await fetch(`/api/v1/marketplace/installers/${id}`)
  const json = await res.json() as { data?: { installer: InstallerDetail }; error?: { message: string } }
  if (!res.ok) throw new Error(json.error?.message ?? 'Installer not found')
  return json.data!.installer
}

/** Initiates checkout for an installer job, holding the chosen saved card. */
async function requestBooking(installerJobId: string, paymentMethodId: string): Promise<{ orderId: string }> {
  const res = await fetch('/api/v1/marketplace/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ installerJobId, paymentMethodId }),
  })
  const json = await res.json() as { success: boolean; data?: { orderId: string }; error?: { message: string } }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Booking failed')
  return { orderId: json.data!.orderId }
}

/* ── Helpers ─────────────────────────────────────────────────── */

/** Formats pence as a £ price string. */
function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

/* ── Page ───────────────────────────────────────────────────── */

/** Installer profile and service booking page. */
export default function InstallerDetailPage() {
  const params  = useParams<{ id: string }>()
  const [installer, setInstaller] = useState<InstallerDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<InstallerJob | null>(null)
  const [requestDate, setRequestDate] = useState('')
  const [notes, setNotes]             = useState('')
  const [booking, setBooking]         = useState(false)
  const [booked, setBooked]           = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const { cards, defaultCard } = usePaymentMethods()
  const [chosenCardId, setChosenCardId] = useState<string | null>(null)
  const cardId = chosenCardId ?? defaultCard?.id ?? ''

  useEffect(() => {
    void fetchInstaller(params.id)
      .then((i) => { setInstaller(i); if (i.jobs[0]) setSelectedJob(i.jobs[0]) })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [params.id])

  const handleBook = async () => {
    if (!selectedJob || !cardId) return
    setBooking(true)
    setBookingError(null)
    try {
      await requestBooking(selectedJob.id, cardId)
      setBooked(true)
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setBooking(false)
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>

  if (error || !installer) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="text-sm text-red-700">{error ?? 'Installer not found.'}</p>
        <Link href="/marketplace/installers" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-green-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to installers
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
          {installer.logoUrl ? <img src={installer.logoUrl} alt="" className="h-full w-full object-cover" /> : <Wrench className="h-8 w-8 text-gray-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-gray-900">{installer.companyName}</h1>
            {installer.isOzevApproved && (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-0.5 text-xs font-bold text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> OZEV Approved
              </span>
            )}
          </div>
          {installer.averageRating != null && (
            <div className="mt-1 flex items-center gap-2">
              <div className="flex">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className={cn('h-3.5 w-3.5', s <= Math.round(installer.averageRating!) ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
                ))}
              </div>
              <span className="text-sm text-gray-600">{installer.averageRating.toFixed(1)} · {installer.reviewCount} reviews · {installer.completedJobs} jobs</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: profile */}
        <div className="lg:col-span-2 space-y-5">
          {installer.description && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-bold text-gray-700">About</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{installer.description}</p>
            </div>
          )}

          {/* Certifications */}
          {installer.certifications.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700"><Shield className="h-4 w-4 text-green-600" /> Certifications</h2>
              <div className="flex flex-wrap gap-2">
                {installer.certifications.map((c) => (
                  <span key={c} className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-gray-700">Services offered</h2>
            <div className="space-y-3">
              {installer.jobs.filter((j) => j.status === 'open').map((j) => (
                <button
                  key={j.id}
                  onClick={() => setSelectedJob(j)}
                  className={cn('w-full rounded-xl border p-4 text-left transition-colors', selectedJob?.id === j.id ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50')}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">{j.title}</span>
                    <span className="text-sm font-bold text-gray-900">{fmtPence(j.quotePence)}</span>
                  </div>
                  {j.description && <p className="mt-1 text-xs text-gray-500">{j.description}</p>}
                  {j.estimatedDays && <p className="mt-1 text-xs text-gray-400">Est. {j.estimatedDays} day{j.estimatedDays !== 1 ? 's' : ''}</p>}
                </button>
              ))}
            </div>
          </div>

          {/* Contact */}
          {(installer.phone || installer.website) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold text-gray-700">Contact</h2>
              {installer.phone && (
                <a href={`tel:${installer.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                  <Phone className="h-4 w-4 text-gray-400" /> {installer.phone}
                </a>
              )}
              {installer.website && (
                <a href={installer.website} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 text-sm text-green-600 hover:underline">
                  <Globe className="h-4 w-4" /> {installer.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Right: booking form */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm h-fit sticky top-4">
          {booked ? (
            <div className="text-center py-6">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
              <h3 className="text-base font-bold text-gray-900">Request sent!</h3>
              <p className="mt-1 text-sm text-gray-500">The installer will confirm your booking. Your card is held — no charge until the job is complete.</p>
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-base font-bold text-gray-900">Request a booking</h2>
              {selectedJob && (
                <div className="mb-4 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Selected service</p>
                  <p className="text-sm font-semibold text-gray-900">{selectedJob.title}</p>
                  <p className="text-base font-bold text-green-700 mt-0.5">{fmtPence(selectedJob.quotePence)}</p>
                </div>
              )}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-gray-600">Preferred date</label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-gray-600">Notes for installer</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Property type, cable run distance, any special requirements…"
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="mb-4">
                <label htmlFor="installer-card" className="mb-1 block text-xs font-medium text-gray-600">Pay with</label>
                {cards === null ? (
                  <p className="text-xs text-gray-400">Loading cards…</p>
                ) : cards.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    No saved cards. <Link href="/settings?tab=payments" className="font-medium text-green-600 hover:underline">Add a card</Link>
                  </p>
                ) : (
                  <select id="installer-card" value={cardId} onChange={(e) => setChosenCardId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    {cards.map((c) => <option key={c.id} value={c.id}>{c.brand.toUpperCase()} •••• {c.last4}</option>)}
                  </select>
                )}
              </div>
              {bookingError && <p role="alert" className="mb-3 text-xs text-red-600">{bookingError}</p>}
              <button
                onClick={() => void handleBook()}
                disabled={!selectedJob || !cardId || booking}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <PoundSterling className="h-4 w-4" />}
                {booking ? 'Requesting…' : 'Request booking'}
              </button>
              <p className="mt-2 text-center text-xs text-gray-400">Your card is held. You're only charged when the job is confirmed complete.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
