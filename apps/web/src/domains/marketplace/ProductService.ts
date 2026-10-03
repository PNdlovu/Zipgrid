/**
 * @file ProductService.ts
 * @description Marketplace product service — CRUD, search, cart, orders.
 * All monetary values in pence (integer). Never floats.
 *
 * @module domains/marketplace
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/lib/errors/AppError'

/* ── Types ──────────────────────────────────────────────────── */

export type ProductRow = {
  id: string
  vendorProfileId: string
  vendorName: string | null
  categoryId: string
  categoryName: string | null
  name: string
  slug: string
  description: string | null
  shortDescription: string | null
  status: string
  pricePence: number
  compareAtPence: number | null
  vatInclusive: boolean
  stockQty: number
  photoUrls: string[]
  thumbnailUrl: string | null
  specs: Record<string, unknown>
  compatiblePlugTypes: string[]
  featured: boolean
  totalSold: number
  averageRating: number | null
  reviewCount: number
  createdAt: Date
}

export type SearchProductsParams = {
  categorySlug?: string
  query?: string
  plugType?: string
  maxPricePence?: number
  featuredOnly?: boolean
  page?: number
  pageSize?: number
}

/**
 * Product marketplace service.
 */
export const ProductService = {

  async search(params: SearchProductsParams = {}): Promise<{ products: ProductRow[]; total: number }> {
    const db = await getDb()
    const page = params.page ?? 1
    const pageSize = Math.min(params.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const conditions: string[] = [`p.status = 'active'`, `p.stock_qty > 0`]
    const values: unknown[] = []
    let i = 1

    if (params.categorySlug) {
      conditions.push(`pc.slug = $${i++}`)
      values.push(params.categorySlug)
    }
    if (params.query) {
      conditions.push(`(p.name ILIKE $${i} OR p.description ILIKE $${i} OR p.short_description ILIKE $${i})`)
      values.push(`%${params.query}%`)
      i++
    }
    if (params.plugType) {
      conditions.push(`p.compatible_plug_types @> ARRAY[$${i++}]::text[]`)
      values.push(params.plugType)
    }
    if (params.maxPricePence !== undefined) {
      conditions.push(`p.price_pence <= $${i++}`)
      values.push(params.maxPricePence)
    }
    if (params.featuredOnly) {
      conditions.push(`p.featured = TRUE`)
    }

    const where = conditions.join(' AND ')

    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS total FROM products p JOIN product_categories pc ON pc.id = p.category_id WHERE ${where}`,
      values,
    )
    const total = (countRes.rows[0] as { total: number }).total

    values.push(pageSize, offset)
    const res = await db.execute(
      `SELECT p.id, p.vendor_profile_id, vp.business_name AS vendor_name,
              p.category_id, pc.name AS category_name,
              p.name, p.slug, p.description, p.short_description, p.status,
              p.price_pence, p.compare_at_pence, p.vat_inclusive,
              p.stock_qty, p.photo_urls, p.thumbnail_url,
              p.specs, p.compatible_plug_types, p.featured,
              p.total_sold, p.average_rating, p.review_count, p.created_at
       FROM products p
       JOIN product_categories pc ON pc.id = p.category_id
       JOIN vendor_profiles vp ON vp.id = p.vendor_profile_id
       WHERE ${where}
       ORDER BY p.featured DESC, p.total_sold DESC, p.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      values,
    )

    return { products: res.rows.map(this._mapRow), total }
  },

  async getById(productId: string): Promise<ProductRow> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT p.id, p.vendor_profile_id, vp.business_name AS vendor_name,
              p.category_id, pc.name AS category_name,
              p.name, p.slug, p.description, p.short_description, p.status,
              p.price_pence, p.compare_at_pence, p.vat_inclusive,
              p.stock_qty, p.photo_urls, p.thumbnail_url,
              p.specs, p.compatible_plug_types, p.featured,
              p.total_sold, p.average_rating, p.review_count, p.created_at
       FROM products p
       JOIN product_categories pc ON pc.id = p.category_id
       JOIN vendor_profiles vp ON vp.id = p.vendor_profile_id
       WHERE p.id = $1 LIMIT 1`,
      [productId],
    )
    if (res.rows.length === 0) throw new NotFoundError('Product', productId)
    return this._mapRow(res.rows[0] as Record<string, unknown>)
  },

  // ── Cart ──────────────────────────────────────────────────

  async addToCart(userId: string, productId: string, quantity = 1): Promise<void> {
    const db = await getDb()
    // Verify product is available
    const prod = await this.getById(productId)
    if (prod.status !== 'active') throw new ValidationError('Product is not available.')
    if (prod.stockQty < quantity) throw new ValidationError('Not enough stock.')

    await db.execute(
      `INSERT INTO cart_items (id, user_id, product_id, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [uuidv4(), userId, productId, quantity],
    )
  },

  async removeFromCart(userId: string, productId: string): Promise<void> {
    const db = await getDb()
    await db.execute(
      `DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2`,
      [userId, productId],
    )
  },

  async getCart(userId: string): Promise<Array<{ product: ProductRow; quantity: number }>> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT ci.quantity, p.id, p.vendor_profile_id, vp.business_name AS vendor_name,
              p.category_id, pc.name AS category_name,
              p.name, p.slug, p.description, p.short_description, p.status,
              p.price_pence, p.compare_at_pence, p.vat_inclusive,
              p.stock_qty, p.photo_urls, p.thumbnail_url,
              p.specs, p.compatible_plug_types, p.featured,
              p.total_sold, p.average_rating, p.review_count, p.created_at
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN product_categories pc ON pc.id = p.category_id
       JOIN vendor_profiles vp ON vp.id = p.vendor_profile_id
       WHERE ci.user_id = $1
       ORDER BY ci.added_at DESC`,
      [userId],
    )
    return res.rows.map((r) => {
      const row = r as Record<string, unknown>
      return { product: this._mapRow(row), quantity: Number(row['quantity']) }
    })
  },

  _mapRow(row: Record<string, unknown>): ProductRow {
    return {
      id: row['id'] as string,
      vendorProfileId: row['vendor_profile_id'] as string,
      vendorName: (row['vendor_name'] as string | null) ?? null,
      categoryId: row['category_id'] as string,
      categoryName: (row['category_name'] as string | null) ?? null,
      name: row['name'] as string,
      slug: row['slug'] as string,
      description: (row['description'] as string | null) ?? null,
      shortDescription: (row['short_description'] as string | null) ?? null,
      status: row['status'] as string,
      pricePence: Number(row['price_pence']),
      compareAtPence: row['compare_at_pence'] != null ? Number(row['compare_at_pence']) : null,
      vatInclusive: Boolean(row['vat_inclusive']),
      stockQty: Number(row['stock_qty']),
      photoUrls: (row['photo_urls'] as string[]) ?? [],
      thumbnailUrl: (row['thumbnail_url'] as string | null) ?? null,
      specs: (row['specs'] as Record<string, unknown>) ?? {},
      compatiblePlugTypes: (row['compatible_plug_types'] as string[]) ?? [],
      featured: Boolean(row['featured']),
      totalSold: Number(row['total_sold']),
      averageRating: row['average_rating'] != null ? Number(row['average_rating']) : null,
      reviewCount: Number(row['review_count']),
      createdAt: new Date(row['created_at'] as string),
    }
  },
}
