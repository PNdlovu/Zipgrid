/**
 * @file page.tsx
 * @description /marketplace — Product grid with category filters, search, and installer CTA.
 *
 * @module apps/web/app/(marketplace)/marketplace
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Search, SlidersHorizontal, Star, Wrench, ShoppingCart,
  Zap, Package, ChevronRight, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ProductCard = {
  id: string
  name: string
  shortDescription: string | null
  pricePence: number
  compareAtPence: number | null
  thumbnailUrl: string | null
  averageRating: number | null
  reviewCount: number
  vendorName: string | null
  featured: boolean
  compatiblePlugTypes: string[]
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatPence(p: number) { return `£${(p / 100).toFixed(2)}` }

const PLUG_TYPES = ['Type2', 'CCS2', 'CHAdeMO', 'NACS']

const CATEGORIES = [
  { slug: '', label: 'All' },
  { slug: 'ev-chargers', label: 'EV Chargers' },
  { slug: 'charging-cables', label: 'Cables' },
  { slug: 'adapters', label: 'Adapters' },
  { slug: 'solar-energy', label: 'Solar & Energy' },
  { slug: 'accessories', label: 'Accessories' },
]

/* ── Product card ────────────────────────────────────────────── */

function ProductCardComponent({ product }: { product: ProductCard }) {
  const discount = product.compareAtPence && product.compareAtPence > product.pricePence
    ? Math.round((1 - product.pricePence / product.compareAtPence) * 100)
    : null

  return (
    <Link
      href={`/marketplace/products/${product.id}`}
      className="group flex flex-col rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden hover:shadow-md transition-shadow"
      aria-label={`${product.name} — ${formatPence(product.pricePence)}`}
    >
      {/* Image */}
      <div className="relative aspect-square bg-[hsl(var(--secondary))] overflow-hidden">
        {product.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.thumbnailUrl}
            alt={product.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-12 w-12 text-[hsl(var(--muted-foreground)/0.3)]" aria-hidden="true" />
          </div>
        )}
        {product.featured && (
          <span className="absolute left-2 top-2 rounded-full bg-[hsl(var(--primary))] px-2 py-0.5 text-[10px] font-bold text-white">
            Featured
          </span>
        )}
        {discount && (
          <span className="absolute right-2 top-2 rounded-full bg-[hsl(var(--destructive))] px-2 py-0.5 text-[10px] font-bold text-white">
            -{discount}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{product.vendorName ?? 'Zipgrid Marketplace'}</p>
          <p className="mt-0.5 text-sm font-semibold text-[hsl(var(--foreground))] line-clamp-2">{product.name}</p>
        </div>

        {product.shortDescription && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">{product.shortDescription}</p>
        )}

        {/* Rating */}
        {product.averageRating != null && (
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            <span className="text-xs font-medium text-[hsl(var(--foreground))]">{product.averageRating.toFixed(1)}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">({product.reviewCount})</span>
          </div>
        )}

        {/* Plug types */}
        {product.compatiblePlugTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.compatiblePlugTypes.slice(0, 3).map((pt) => (
              <span key={pt} className="rounded-[4px] bg-[hsl(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                {pt}
              </span>
            ))}
          </div>
        )}

        {/* Price */}
        <div className="mt-auto flex items-center gap-2">
          <span className="font-mono text-base font-bold text-[hsl(var(--foreground))]">
            {formatPence(product.pricePence)}
          </span>
          {product.compareAtPence && (
            <span className="font-mono text-xs text-[hsl(var(--muted-foreground))] line-through">
              {formatPence(product.compareAtPence)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

/* ── Main page ───────────────────────────────────────────────── */

function MarketplaceContent() {
  const searchParams = useSearchParams()

  const [products, setProducts] = useState<ProductCard[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') ?? '')
  const [plugFilter, setPlugFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 24

  const fetchProducts = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (activeCategory) params.set('category', activeCategory)
      if (query) params.set('q', query)
      if (plugFilter) params.set('plugType', plugFilter)

      const res = await fetch(`/api/v1/marketplace/products?${params}`)
      const json = await res.json() as {
        success: boolean
        data?: ProductCard[]
        meta?: { total?: number }
      }
      if (json.success) {
        setProducts(p === 1 ? (json.data ?? []) : (prev) => [...prev, ...(json.data ?? [])])
        setTotal(json.meta?.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [activeCategory, query, plugFilter])

  useEffect(() => {
    setPage(1)
    void fetchProducts(1)
  }, [fetchProducts])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    void fetchProducts(1)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">EV Charging Marketplace</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Chargers, cables, accessories and certified installers — all in one place.
          </p>
        </div>
        <Link
          href="/marketplace/installers"
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))]',
            'px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition-colors',
            'hover:bg-[hsl(var(--secondary))]',
          )}
        >
          <Wrench className="h-4 w-4" aria-hidden="true" />
          Find an installer
          <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        </Link>
      </div>

      {/* Search + filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chargers, cables, accessories…"
              aria-label="Search products"
              className={cn(
                'w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
                'py-2 pl-9 pr-4 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]',
                'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]',
              )}
            />
          </div>
          <button
            type="submit"
            className="flex h-9 items-center gap-1.5 rounded-[6px] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))]"
          >
            Search
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-[6px] border border-[hsl(var(--border))] px-3 text-sm font-medium',
            'text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]',
            showFilters && 'bg-[hsl(var(--secondary))]',
          )}
          aria-pressed={showFilters}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">Compatible plug</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPlugFilter('')}
                className={cn('rounded-[4px] border px-2.5 py-1 text-xs font-medium transition-colors',
                  !plugFilter ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]')}
              >Any</button>
              {PLUG_TYPES.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setPlugFilter(pt === plugFilter ? '' : pt)}
                  className={cn('rounded-[4px] border px-2.5 py-1 text-xs font-medium transition-colors',
                    plugFilter === pt ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]')}
                >{pt}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category chips */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Category filter">
        {CATEGORIES.map(({ slug, label }) => (
          <button
            key={slug}
            type="button"
            role="tab"
            aria-selected={activeCategory === slug}
            onClick={() => { setActiveCategory(slug); setPage(1) }}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              activeCategory === slug
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {loading && page === 1 ? 'Loading…' : `${total} product${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {loading && page === 1 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading products" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <Package className="h-12 w-12 text-[hsl(var(--muted-foreground)/0.3)]" aria-hidden="true" strokeWidth={1} />
          <div>
            <p className="font-medium text-[hsl(var(--foreground))]">No products found</p>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Try a different category or search term.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCardComponent key={p.id} product={p} />)}
          </div>

          {products.length < total && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => { const next = page + 1; setPage(next); void fetchProducts(next) }}
                disabled={loading}
                className="flex h-10 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-6 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Load more
              </button>
            </div>
          )}
        </>
      )}

      {/* Installer CTA banner */}
      <div className={cn(
        'mt-16 flex flex-col items-center gap-4 rounded-[8px] border border-[hsl(var(--primary)/0.3)]',
        'bg-[hsl(var(--primary)/0.05)] p-8 text-center sm:flex-row sm:text-left',
      )}>
        <Wrench className="h-10 w-10 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        <div className="flex-1">
          <p className="font-semibold text-[hsl(var(--foreground))]">Need a certified installer?</p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Find OZEV-certified electricians near you for new installations, repairs, and maintenance.
          </p>
        </div>
        <Link
          href="/marketplace/installers"
          className="flex shrink-0 h-10 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
        >
          <Zap className="h-4 w-4" aria-hidden="true" />
          Find installers
        </Link>
      </div>
    </div>
  )
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
      </div>
    }>
      <MarketplaceContent />
    </Suspense>
  )
}
