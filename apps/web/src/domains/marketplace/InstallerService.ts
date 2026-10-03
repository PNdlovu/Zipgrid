/**
 * @file InstallerService.ts
 * @description Marketplace installer service — profiles, job booking, job management.
 * All monetary values in pence (integer).
 *
 * @module domains/marketplace
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/lib/errors/AppError'
import { distanceMetresSql } from '@/lib/db/geo'

/* ── Types ──────────────────────────────────────────────────── */

export type InstallerRow = {
  id: string
  userId: string
  businessName: string | null
  bio: string | null
  avatarUrl: string | null
  portfolioUrls: string[]
  ozevCertified: boolean
  niceicRegistered: boolean
  napitRegistered: boolean
  coveragePostcodes: string[]
  coverageRadiusKm: number
  serviceCategories: string[]
  hourlyRatePence: number | null
  callOutFeePence: number
  isVerified: boolean
  totalJobs: number
  averageRating: number | null
  reviewCount: number
  acceptingWork: boolean
  basePostcode: string | null
}

export type BookJobInput = {
  installerProfileId: string
  clientUserId: string
  serviceCategory: string
  title: string
  description?: string
  address: Record<string, unknown>
  scheduledDate?: string
  scheduledTime?: string
  quotedPricePence?: number
  listingId?: string
  stripePaymentIntentId?: string
}

export type JobRow = {
  id: string
  installerProfileId: string
  clientUserId: string
  serviceCategory: string
  title: string
  description: string | null
  status: string
  scheduledDate: string | null
  scheduledTime: string | null
  quotedPricePence: number | null
  finalPricePence: number | null
  platformFeePence: number | null
  installerNetPence: number | null
  stripePaymentIntentId: string | null
  installerName: string | null
  createdAt: Date
}

/**
 * Installer marketplace service.
 */
export const InstallerService = {

  async searchNearby(params: {
    lat?: number
    lng?: number
    postcode?: string
    serviceCategory?: string
    ozevOnly?: boolean
    page?: number
    pageSize?: number
  } = {}): Promise<{ installers: InstallerRow[]; total: number }> {
    const db = await getDb()
    const page = params.page ?? 1
    const pageSize = Math.min(params.pageSize ?? 20, 50)
    const offset = (page - 1) * pageSize

    const conditions: string[] = [`ip.accepting_work = TRUE`, `ip.is_verified = TRUE`]
    const values: unknown[] = []
    let i = 1

    if (params.serviceCategory) {
      conditions.push(`ip.service_categories @> ARRAY[$${i++}]::service_category[]`)
      values.push(params.serviceCategory)
    }
    if (params.ozevOnly) {
      conditions.push(`ip.ozev_certified = TRUE`)
    }
    if (params.postcode) {
      // Simple postcode prefix match (first 3-4 chars)
      const prefix = params.postcode.slice(0, 4).toUpperCase()
      conditions.push(`EXISTS (
        SELECT 1 FROM unnest(ip.coverage_postcodes) cp
        WHERE cp ILIKE $${i++}
      )`)
      values.push(`${prefix}%`)
    }

    const where = conditions.join(' AND ')

    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS total FROM installer_profiles ip WHERE ${where}`,
      values,
    )
    const total = (countRes.rows[0] as { total: number }).total

    // Build ORDER BY and final query with stable parameter indexing
    const listValues = [...values, pageSize, offset]
    const limitIdx = listValues.length - 1
    const offsetIdx = listValues.length

    let orderBy: string

    if (params.lat !== undefined && params.lng !== undefined) {
      // Append lat/lng as new parameters at the end to avoid index shifting
      listValues.push(params.lng, params.lat)
      const lngIdx = listValues.length - 1
      const latIdx = listValues.length
      orderBy = `${distanceMetresSql('ip.base_latitude', 'ip.base_longitude', `${latIdx}`, `${lngIdx}`)} ASC NULLS LAST`
    } else {
      orderBy = 'ip.average_rating DESC NULLS LAST, ip.total_jobs DESC'
    }

    const res = await db.execute(
      `SELECT ip.id, ip.user_id, ip.business_name, ip.bio, ip.avatar_url,
              ip.portfolio_urls, ip.ozev_certified, ip.niceic_registered,
              ip.napit_registered, ip.coverage_postcodes, ip.coverage_radius_km,
              ip.service_categories, ip.hourly_rate_pence, ip.call_out_fee_pence,
              ip.is_verified, ip.total_jobs, ip.average_rating, ip.review_count,
              ip.accepting_work, ip.base_postcode
       FROM installer_profiles ip
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listValues,
    )

    return { installers: res.rows.map(this._mapInstallerRow), total }
  },

  async getById(installerId: string): Promise<InstallerRow> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT ip.id, ip.user_id, ip.business_name, ip.bio, ip.avatar_url,
              ip.portfolio_urls, ip.ozev_certified, ip.niceic_registered,
              ip.napit_registered, ip.coverage_postcodes, ip.coverage_radius_km,
              ip.service_categories, ip.hourly_rate_pence, ip.call_out_fee_pence,
              ip.is_verified, ip.total_jobs, ip.average_rating, ip.review_count,
              ip.accepting_work, ip.base_postcode
       FROM installer_profiles ip
       WHERE ip.id = $1 LIMIT 1`,
      [installerId],
    )
    if (res.rows.length === 0) throw new NotFoundError('Installer', installerId)
    return this._mapInstallerRow(res.rows[0] as Record<string, unknown>)
  },

  async bookJob(input: BookJobInput): Promise<JobRow> {
    const db = await getDb()

    const installer = await this.getById(input.installerProfileId)
    if (!installer.acceptingWork) throw new ValidationError('This installer is not currently accepting new jobs.')

    const jobId = uuidv4()
    const commissionRate = 12.00
    let platformFeePence: number | null = null
    let installerNetPence: number | null = null

    if (input.quotedPricePence) {
      platformFeePence = Math.round(input.quotedPricePence * commissionRate / 100)
      installerNetPence = input.quotedPricePence - platformFeePence
    }

    await db.execute(
      `INSERT INTO installer_jobs (
         id, installer_profile_id, client_user_id, listing_id,
         service_category, title, description, address,
         scheduled_date, scheduled_time,
         status, quoted_price_pence, commission_rate_pct,
         platform_fee_pence, installer_net_pence,
         stripe_payment_intent_id,
         created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         'pending',$11,12.00,$12,$13,$14,
         NOW(),NOW()
       )`,
      [
        jobId,
        input.installerProfileId,
        input.clientUserId,
        input.listingId ?? null,
        input.serviceCategory,
        input.title,
        input.description ?? null,
        JSON.stringify(input.address),
        input.scheduledDate ?? null,
        input.scheduledTime ?? null,
        input.quotedPricePence ?? null,
        platformFeePence,
        installerNetPence,
        input.stripePaymentIntentId ?? null,
      ],
    )

    return this.getJobById(jobId)
  },

  async getJobById(jobId: string): Promise<JobRow> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT ij.id, ij.installer_profile_id, ij.client_user_id,
              ij.service_category, ij.title, ij.description, ij.status,
              ij.scheduled_date::TEXT, ij.scheduled_time::TEXT,
              ij.quoted_price_pence, ij.final_price_pence,
              ij.platform_fee_pence, ij.installer_net_pence,
              ij.stripe_payment_intent_id, ij.created_at,
              ip.business_name AS installer_name
       FROM installer_jobs ij
       JOIN installer_profiles ip ON ip.id = ij.installer_profile_id
       WHERE ij.id = $1 LIMIT 1`,
      [jobId],
    )
    if (res.rows.length === 0) throw new NotFoundError('Job', jobId)
    return this._mapJobRow(res.rows[0] as Record<string, unknown>)
  },

  _mapInstallerRow(row: Record<string, unknown>): InstallerRow {
    return {
      id: row['id'] as string,
      userId: row['user_id'] as string,
      businessName: (row['business_name'] as string | null) ?? null,
      bio: (row['bio'] as string | null) ?? null,
      avatarUrl: (row['avatar_url'] as string | null) ?? null,
      portfolioUrls: (row['portfolio_urls'] as string[]) ?? [],
      ozevCertified: Boolean(row['ozev_certified']),
      niceicRegistered: Boolean(row['niceic_registered']),
      napitRegistered: Boolean(row['napit_registered']),
      coveragePostcodes: (row['coverage_postcodes'] as string[]) ?? [],
      coverageRadiusKm: Number(row['coverage_radius_km']),
      serviceCategories: (row['service_categories'] as string[]) ?? [],
      hourlyRatePence: row['hourly_rate_pence'] != null ? Number(row['hourly_rate_pence']) : null,
      callOutFeePence: Number(row['call_out_fee_pence']),
      isVerified: Boolean(row['is_verified']),
      totalJobs: Number(row['total_jobs']),
      averageRating: row['average_rating'] != null ? Number(row['average_rating']) : null,
      reviewCount: Number(row['review_count']),
      acceptingWork: Boolean(row['accepting_work']),
      basePostcode: (row['base_postcode'] as string | null) ?? null,
    }
  },

  _mapJobRow(row: Record<string, unknown>): JobRow {
    return {
      id: row['id'] as string,
      installerProfileId: row['installer_profile_id'] as string,
      clientUserId: row['client_user_id'] as string,
      serviceCategory: row['service_category'] as string,
      title: row['title'] as string,
      description: (row['description'] as string | null) ?? null,
      status: row['status'] as string,
      scheduledDate: (row['scheduled_date'] as string | null) ?? null,
      scheduledTime: (row['scheduled_time'] as string | null) ?? null,
      quotedPricePence: row['quoted_price_pence'] != null ? Number(row['quoted_price_pence']) : null,
      finalPricePence: row['final_price_pence'] != null ? Number(row['final_price_pence']) : null,
      platformFeePence: row['platform_fee_pence'] != null ? Number(row['platform_fee_pence']) : null,
      installerNetPence: row['installer_net_pence'] != null ? Number(row['installer_net_pence']) : null,
      stripePaymentIntentId: (row['stripe_payment_intent_id'] as string | null) ?? null,
      installerName: (row['installer_name'] as string | null) ?? null,
      createdAt: new Date(row['created_at'] as string),
    }
  },
}
