/**
 * @file page.tsx
 * @description /help/insurance/marketplace — EV Insurance Marketplace.
 * Compares EV-specific insurance products from partner providers.
 * Includes: specialist EV cover, charging equipment cover, breakdown cover,
 * and battery warranty products.
 *
 * @module apps/web/app/(driver)/help/insurance/marketplace
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Shield, ExternalLink, CheckCircle2, Star, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type InsuranceProduct = {
  id: string
  providerName: string
  providerLogo: string | null
  productName: string
  category: 'ev_car' | 'breakdown' | 'charging_equipment' | 'battery_warranty' | 'home_charging'
  description: string
  highlights: string[]
  monthlyFromPence: number | null
  affiliateUrl: string
  rating: number | null
  isPartner: boolean
}

/* ── Static partner data (affiliate layer) ───────────────────── */

const INSURANCE_PRODUCTS: InsuranceProduct[] = [
  {
    id: 'rac-breakdown',
    providerName: 'RAC',
    providerLogo: null,
    productName: 'EV Breakdown Cover',
    category: 'breakdown',
    description: 'Specialist EV breakdown including charging failure, mobile charging van dispatch, and low-battery rescue.',
    highlights: ['Mobile charging van', 'UK & European cover', 'Flatbed transport to nearest charger', '24/7 helpline'],
    monthlyFromPence: 1300,
    affiliateUrl: 'https://www.rac.co.uk/breakdown-cover/electric-vehicle',
    rating: 4.6,
    isPartner: true,
  },
  {
    id: 'aa-ev',
    providerName: 'AA',
    providerLogo: null,
    productName: 'EV Home & Away Breakdown',
    category: 'breakdown',
    description: 'Complete breakdown cover for EVs with dedicated EV patrols and charging support.',
    highlights: ['Dedicated EV patrols', 'Charging cable replacement', 'Overnight accommodation if stranded', 'EV specialist mechanics'],
    monthlyFromPence: 1450,
    affiliateUrl: 'https://www.theaa.com/breakdown-cover/electric-vehicles',
    rating: 4.5,
    isPartner: true,
  },
  {
    id: 'ageas-ev',
    providerName: 'Ageas',
    providerLogo: null,
    productName: 'Specialist EV Car Insurance',
    category: 'ev_car',
    description: 'Comprehensive car insurance designed specifically for EVs — covers battery as new, charging cable theft, and public charging liability.',
    highlights: ['Battery covered as new for 5 years', 'Charging cable theft included', 'Free courtesy EV while repaired', 'Telematics discount available'],
    monthlyFromPence: 3500,
    affiliateUrl: 'https://www.ageas.co.uk/car-insurance/electric-vehicle',
    rating: 4.3,
    isPartner: false,
  },
  {
    id: 'rac-home-charging',
    providerName: 'Evo Energy',
    providerLogo: null,
    productName: 'Home Charger Protection Plan',
    category: 'home_charging',
    description: 'Annual protection for your home EV charger — covers parts, labour, and call-out for electrical faults.',
    highlights: ['Annual service included', 'Parts & labour covered', 'Next-day engineer call-out', 'Covers all major brands'],
    monthlyFromPence: 800,
    affiliateUrl: 'https://evoenergy.co.uk/charger-protection',
    rating: 4.1,
    isPartner: true,
  },
  {
    id: 'battery-warranty',
    providerName: 'Warrantywise',
    providerLogo: null,
    productName: 'EV Battery Warranty',
    category: 'battery_warranty',
    description: 'Extended battery warranty for EVs beyond the manufacturer warranty period. Covers cell degradation below 70% capacity.',
    highlights: ['Covers below 70% capacity', 'Up to £30,000 battery replacement', 'Transferable to new owner', 'Up to 8 years / 100,000 miles'],
    monthlyFromPence: 1800,
    affiliateUrl: 'https://www.warrantywise.co.uk/ev-battery-warranty',
    rating: 4.0,
    isPartner: false,
  },
  {
    id: 'zipgrid-host-insurance',
    providerName: 'Zipgrid (Platform)',
    providerLogo: null,
    productName: 'Zipgrid Host Platform Cover',
    category: 'charging_equipment',
    description: 'Built-in platform liability cover for all Zipgrid hosts — up to £1m per incident, automatically applied when you list.',
    highlights: ['Automatic — no signup needed', 'Up to £1,000,000 per incident', 'Covers bodily injury & property damage', 'Active on all Zipgrid sessions'],
    monthlyFromPence: 0,
    affiliateUrl: '/legal/host-insurance',
    rating: null,
    isPartner: true,
  },
]

const CATEGORY_LABELS: Record<string, string> = {
  all:                'All',
  ev_car:             '🚗 EV Car Insurance',
  breakdown:          '🔧 Breakdown Cover',
  charging_equipment: '🔌 Charger Cover',
  battery_warranty:   '🔋 Battery Warranty',
  home_charging:      '🏠 Home Charger Cover',
}

/* ── Page ───────────────────────────────────────────────────── */

/** EV insurance marketplace — compares specialist EV insurance products. */
export default function InsuranceMarketplacePage() {
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all' ? INSURANCE_PRODUCTS : INSURANCE_PRODUCTS.filter((p) => p.category === filter)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/help/insurance" className="mb-3 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
          ← Back to Insurance Hub
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">EV Insurance Marketplace</h1>
            <p className="text-sm text-gray-500">Specialist cover for EV drivers and Zipgrid hosts.</p>
          </div>
        </div>
      </div>

      {/* Affiliate disclosure */}
      <div className="mb-5 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
        <p className="text-xs text-amber-800">
          <strong>Disclosure:</strong> Some products below include affiliate links — Zipgrid may earn a small commission if you purchase. This never affects our recommendations or pricing. Products marked <strong>Partner</strong> have been vetted by our team.
        </p>
      </div>

      {/* Category filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              filter === key ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="space-y-4">
        {filtered.map((product) => (
          <div key={product.id} className={cn('rounded-2xl border bg-white p-5 shadow-sm', product.isPartner && 'border-green-200')}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{product.providerName}</span>
                  {product.isPartner && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">PARTNER</span>
                  )}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 capitalize">
                    {CATEGORY_LABELS[product.category]?.replace(/^.+\s/, '') ?? product.category}
                  </span>
                </div>
                <h2 className="text-base font-bold text-gray-900">{product.productName}</h2>
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">{product.description}</p>
              </div>

              <div className="flex-shrink-0 text-right">
                {product.monthlyFromPence !== null && product.monthlyFromPence > 0 ? (
                  <>
                    <p className="text-xs text-gray-400">from</p>
                    <p className="text-lg font-extrabold text-gray-900">£{(product.monthlyFromPence / 100).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">/month</p>
                  </>
                ) : product.monthlyFromPence === 0 ? (
                  <p className="text-sm font-bold text-green-700">Included Free</p>
                ) : null}
                {product.rating != null && (
                  <div className="mt-1 flex items-center gap-1 justify-end">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs text-gray-500">{product.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Highlights */}
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {product.highlights.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                  <span className="text-xs text-gray-600">{h}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-4 flex justify-end">
              {product.affiliateUrl.startsWith('/') ? (
                <Link
                  href={product.affiliateUrl}
                  className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  View details <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <a
                  href={product.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Get a quote <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Zipgrid does not provide regulated insurance advice. Products listed are from independent providers — please read policy documents carefully before purchasing.
      </p>
    </div>
  )
}
