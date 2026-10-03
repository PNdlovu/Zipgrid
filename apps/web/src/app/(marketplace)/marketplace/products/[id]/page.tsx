/**
 * @file page.tsx
 * @description /marketplace/products/[id] — Product detail page.
 * Shows full product info, images, specs, reviews, and add-to-cart / buy-now.
 *
 * @module apps/web/app/(marketplace)/marketplace/products/[id]
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Star, ShoppingCart, Loader2, AlertTriangle, ArrowLeft,
  CheckCircle2, Truck, Shield, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ProductDetail = {
  id: string
  vendorId: string
  vendorName: string
  vendorRating: number | null
  name: string
  description: string | null
  longDescription: string | null
  pricePence: number
  compareAtPricePence: number | null
  plugTypes: string[]
  imageUrls: string[]
  averageRating: number | null
  reviewCount: number
  stock: number | null
  isFeatured: boolean
  specifications: Record<string, string> | null
}

/* ── API ─────────────────────────────────────────────────────── */

/** Fetches a single product by ID. */
async function fetchProduct(id: string): Promise<ProductDetail> {
  const res = await fetch(`/api/v1/marketplace/products/${id}`)
  const json = await res.json() as { data?: { product: ProductDetail }; error?: { message: string } }
  if (!res.ok || !json.data?.product) throw new Error(json.error?.message ?? 'Product not found')
  return json.data.product
}

/** Adds a product to the cart. */
async function addToCart(productId: string, quantity: number): Promise<void> {
  await fetch('/api/v1/marketplace/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ productId, quantity }),
  })
}

/* ── Helpers ─────────────────────────────────────────────────── */

/** Formats pence as a £ price string. */
function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

/* ── Page ───────────────────────────────────────────────────── */

/** Product detail page with image gallery, specs, and checkout initiation. */
export default function ProductDetailPage() {
  const params  = useParams<{ id: string }>()
  const [product, setProduct]   = useState<ProductDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [qty, setQty]           = useState(1)
  const [adding, setAdding]     = useState(false)
  const [added, setAdded]       = useState(false)
  const [activeImg, setActiveImg] = useState(0)

  useEffect(() => {
    void fetchProduct(params.id)
      .then(setProduct)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [params.id])

  const handleAddToCart = async () => {
    if (!product) return
    setAdding(true)
    try {
      await addToCart(product.id, qty)
      setAdded(true)
      setTimeout(() => setAdded(false), 3000)
    } catch {
      setError('Could not add to cart. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>

  if (error || !product) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="text-sm text-red-700">{error ?? 'Product not found.'}</p>
        <Link href="/marketplace/products" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-green-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to products
        </Link>
      </div>
    )
  }

  const inStock = product.stock == null || product.stock > 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/marketplace" className="hover:text-gray-600">Marketplace</Link>
        <span>/</span>
        <Link href="/marketplace/products" className="hover:text-gray-600">Products</Link>
        <span>/</span>
        <span className="text-gray-700">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image gallery */}
        <div>
          <div className="mb-3 aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
            {product.imageUrls[activeImg] ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from an arbitrary host, size unknown
              <img src={product.imageUrls[activeImg]} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Zap className="h-16 w-16 text-gray-200" />
              </div>
            )}
          </div>
          {product.imageUrls.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.imageUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={cn('h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors', activeImg === i ? 'border-green-500' : 'border-gray-200')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from an arbitrary host, size unknown */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="mb-1 text-sm text-gray-400">{product.vendorName}</p>
          <h1 className="mb-3 text-2xl font-extrabold tracking-tight text-gray-900">{product.name}</h1>

          {product.averageRating != null && (
            <div className="mb-4 flex items-center gap-2">
              <div className="flex">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className={cn('h-4 w-4', s <= Math.round(product.averageRating!) ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
                ))}
              </div>
              <span className="text-sm text-gray-600">{product.averageRating.toFixed(1)} ({product.reviewCount} reviews)</span>
            </div>
          )}

          {/* Price */}
          <div className="mb-5">
            <span className="text-3xl font-extrabold text-gray-900">{fmtPence(product.pricePence)}</span>
            {product.compareAtPricePence && (
              <>
                <span className="ml-3 text-lg text-gray-400 line-through">{fmtPence(product.compareAtPricePence)}</span>
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                  Save {Math.round(((product.compareAtPricePence - product.pricePence) / product.compareAtPricePence) * 100)}%
                </span>
              </>
            )}
          </div>

          {/* Plug types */}
          {product.plugTypes.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {product.plugTypes.map((p) => (
                <span key={p} className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">{p}</span>
              ))}
            </div>
          )}

          {/* Description */}
          {product.description && (
            <p className="mb-5 text-sm text-gray-600 leading-relaxed">{product.description}</p>
          )}

          {/* Trust indicators */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <TrustBadge icon={<Truck className="h-4 w-4 text-green-600" />} label="Free delivery over £50" />
            <TrustBadge icon={<Shield className="h-4 w-4 text-blue-600" />} label="2-year warranty" />
            <TrustBadge icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} label="EV-compatible" />
          </div>

          {/* Quantity + Add to cart */}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-gray-200">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg font-medium text-gray-600 hover:bg-gray-50 rounded-l-xl">−</button>
              <span className="min-w-[2rem] text-center text-sm font-semibold">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="px-3 py-2 text-lg font-medium text-gray-600 hover:bg-gray-50 rounded-r-xl">+</button>
            </div>
            <button
              onClick={() => void handleAddToCart()}
              disabled={!inStock || adding}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : added ? <CheckCircle2 className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              {added ? 'Added!' : adding ? 'Adding…' : inStock ? 'Add to cart' : 'Out of stock'}
            </button>
          </div>

          {/* Specs */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">Specifications</h2>
              <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {Object.entries(product.specifications).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-sm text-gray-500">{k}</dt>
                    <dd className="text-sm font-medium text-gray-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Small trust indicator badge. */
function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
      {icon}
      <span className="text-[10px] font-medium text-gray-500 leading-tight">{label}</span>
    </div>
  )
}
