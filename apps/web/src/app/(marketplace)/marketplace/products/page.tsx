/**
 * @file page.tsx
 * @description /marketplace/products — EV charging product catalogue.
 * Cables, wallboxes, accessories, solar panels and EV-compatible hardware.
 * Filterable by category, plug type, price, and vendor rating.
 *
 * @module apps/web/app/(marketplace)/marketplace/products
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Star, Loader2, AlertCircle, Tag, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type Product = {
  id: string
  vendorName: string
  vendorRating: number | null
  categorySlug: string
  name: string
  description: string | null
  pricePence: number
  compareAtPricePence: number | null
  imageUrls: string[]
  isFeatured: boolean
  reviewCount: number
  averageRating: number | null
}

type Category = { slug: string; name: string }

/* ── API ─────────────────────────────────────────────────────── */

/** Fetches products from the API with optional filters. */
async function fetchProducts(params: {
  q?: string; category?: string; maxPrice?: number; page?: number
}): Promise<{ products: Product[]; total: number }> {
  const sp = new URLSearchParams()
  if (params.q)        sp.set('q', params.q)
  if (params.category) sp.set('category', params.category)
  if (params.maxPrice) sp.set('maxPrice', String(params.maxPrice))
  sp.set('page', String(params.page ?? 1))
  sp.set('pageSize', '24')
  const res = await fetch(`/api/v1/marketplace/products?${sp}`)
  const json = await res.json() as { data?: Product[]; meta?: { total: number } }
  return { products: json.data ?? [], total: json.meta?.total ?? 0 }
}

/* ── Helpers ─────────────────────────────────────────────────── */

/** Formats pence as a £ price string. */
function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

const CATEGORIES: Category[] = [
  { slug: '',             name: 'All products' },
  { slug: 'cables',       name: 'Cables & Adapters' },
  { slug: 'wallboxes',    name: 'Home Wallboxes' },
  { slug: 'accessories',  name: 'Accessories' },
  { slug: 'solar',        name: 'Solar & Storage' },
  { slug: 'portables',    name: 'Portable Chargers' },
]

/* ── Product card ─────────────────────────────────────────────── */

function ProductCard({ p }: { p: Product }) {
  const saving = p.compareAtPricePence && p.compareAtPricePence > p.pricePence
    ? Math.round(((p.compareAtPricePence - p.pricePence) / p.compareAtPricePence) * 100)
    : null

  return (
    <Link
      href={`/marketplace/products/${p.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        {p.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from an arbitrary host, size unknown
          <img src={p.imageUrls[0]} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Zap className="h-12 w-12 text-gray-200" />
          </div>
        )}
        {p.isFeatured && (
          <span className="absolute left-2 top-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white">Featured</span>
        )}
        {saving && (
          <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">-{saving}%</span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-1 text-xs text-gray-400">{p.vendorName}</p>
        <h3 className="mb-2 text-sm font-semibold text-gray-900 line-clamp-2">{p.name}</h3>

        {p.averageRating != null && (
          <div className="mb-2 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs text-gray-600">{p.averageRating.toFixed(1)} ({p.reviewCount})</span>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between">
          <div>
            <span className="text-base font-extrabold text-gray-900">{fmtPence(p.pricePence)}</span>
            {p.compareAtPricePence && (
              <span className="ml-2 text-sm text-gray-400 line-through">{fmtPence(p.compareAtPricePence)}</span>
            )}
          </div>
          <span className="text-xs font-medium text-green-600">View →</span>
        </div>
      </div>
    </Link>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

/** Marketplace products listing page — searchable, filterable product catalogue. */
export default function MarketplaceProductsPage() {
  const [products, setProducts]   = useState<Product[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [query, setQuery]         = useState('')
  const [category, setCategory]   = useState('')
  const [page, setPage]           = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { products: ps, total: t } = await fetchProducts({ q: query || undefined, category: category || undefined, page })
      setProducts(ps)
      setTotal(t)
    } catch {
      setError('Could not load products. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [query, category, page])

  useEffect(() => { void load() }, [load])

  const totalPages = Math.ceil(total / 24)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">EV Products</h1>
        <p className="mt-1 text-sm text-gray-500">Cables, wallboxes, accessories and more — all EV-compatible.</p>
      </div>

      {/* Search + filter row */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search products…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              onClick={() => { setCategory(c.slug); setPage(1) }}
              className={cn(
                'flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                category === c.slug
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!loading && <p className="mb-4 text-sm text-gray-500">{total.toLocaleString()} product{total !== 1 ? 's' : ''}</p>}

      {/* Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Tag className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No products found. Try a different search.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
