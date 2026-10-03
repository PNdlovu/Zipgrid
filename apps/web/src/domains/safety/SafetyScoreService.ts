/**
 * @file SafetyScoreService.ts
 * @description Safety score service — calculates a 0–100 safety score for
 * each listing from 6 weighted components, auto-pauses listings below 50.
 *
 * Score components and weights:
 *   charger_age           20%  — install year vs. current year (< 5 years = 100)
 *   rcd_protection        15%  — host-declared RCD present
 *   electrician_installed 15%  — host-declared professional install
 *   ocpp_fault_rate       20%  — faults per 100 sessions (0 faults = 100)
 *   driver_complaints     15%  — incident reports against listing
 *   platform_inspection   15%  — manual ops flag (0 or 100)
 *
 * Score bands:
 *   90–100  Excellent (green)
 *   70–89   Good (amber)
 *   50–69   Fair (orange)
 *   < 50    Needs attention → listing auto-paused
 *
 * @module domains/safety
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { getDb } from '@/lib/db'
import { NotFoundError } from '@/lib/errors/AppError'
import { eventBus } from '@/lib/events/event-bus'

/* ── Types ──────────────────────────────────────────────────── */

export type SafetyScoreBreakdown = {
  listingId: string
  overallScore: number
  band: 'excellent' | 'good' | 'fair' | 'needs_attention'
  bandLabel: string
  bandColor: string
  components: {
    chargerAge:            { score: number; weight: number; detail: string }
    rcdProtection:         { score: number; weight: number; detail: string }
    electricianInstalled:  { score: number; weight: number; detail: string }
    ocppFaultRate:         { score: number; weight: number; detail: string }
    driverComplaints:      { score: number; weight: number; detail: string }
    platformInspection:    { score: number; weight: number; detail: string }
  }
  autoPaused: boolean
  lastCalculatedAt: Date | null
}

/* ── Component weights ───────────────────────────────────────── */

const WEIGHTS = {
  chargerAge:           0.20,
  rcdProtection:        0.15,
  electricianInstalled: 0.15,
  ocppFaultRate:        0.20,
  driverComplaints:     0.15,
  platformInspection:   0.15,
} as const

/**
 * Safety score service.
 */
export const SafetyScoreService = {

  /**
   * Calculates and persists the safety score for a listing.
   * Idempotent — safe to call repeatedly (nightly job or on-demand).
   * Auto-pauses the listing and fires an event if score < 50.
   */
  async calculate(listingId: string): Promise<SafetyScoreBreakdown> {
    const db = await getDb()

    // Verify listing exists
    const listRes = await db.execute(
      `SELECT id, status, host_profile_id FROM charger_listings WHERE id = $1 LIMIT 1`,
      [listingId],
    )
    if (listRes.rows.length === 0) throw new NotFoundError('Listing', listingId)
    const listing = listRes.rows[0] as { id: string; status: string; host_profile_id: string }

    // Fetch or create safety_scores row
    await db.execute(
      `INSERT INTO safety_scores (listing_id) VALUES ($1) ON CONFLICT (listing_id) DO NOTHING`,
      [listingId],
    )
    const ssRes = await db.execute(
      `SELECT has_rcd_protection, is_electrician_installed, charger_install_year,
              score_platform_inspection
       FROM safety_scores WHERE listing_id = $1`,
      [listingId],
    )
    const ss = ssRes.rows[0] as {
      has_rcd_protection: boolean | null
      is_electrician_installed: boolean | null
      charger_install_year: number | null
      score_platform_inspection: number
    }

    // ── Component 1: Charger age (20%) ────────────────────────
    const currentYear = new Date().getFullYear()
    let ageScore = 50  // default when unknown
    let ageDetail = 'Install year not provided'
    if (ss.charger_install_year) {
      const age = currentYear - ss.charger_install_year
      ageScore = age <= 0 ? 100 : age <= 2 ? 100 : age <= 5 ? 80 : age <= 8 ? 60 : age <= 12 ? 40 : 20
      ageDetail = `Installed ${ss.charger_install_year} (${age} year${age !== 1 ? 's' : ''} old)`
    }

    // ── Component 2: RCD protection (15%) ────────────────────
    const rcdScore = ss.has_rcd_protection === true ? 100 : ss.has_rcd_protection === false ? 0 : 50
    const rcdDetail = ss.has_rcd_protection === true ? 'RCD protection confirmed'
      : ss.has_rcd_protection === false ? 'No RCD protection declared'
      : 'Not declared by host'

    // ── Component 3: Electrician installed (15%) ──────────────
    const elecScore = ss.is_electrician_installed === true ? 100 : ss.is_electrician_installed === false ? 30 : 50
    const elecDetail = ss.is_electrician_installed === true ? 'Professionally installed'
      : ss.is_electrician_installed === false ? 'Self-installed (not certified)'
      : 'Not declared by host'

    // ── Component 4: OCPP fault rate (20%) ────────────────────
    // Faults per 100 sessions (last 90 days)
    const faultRes = await db.execute(
      `SELECT
         COUNT(*) FILTER (WHERE error_code IS NOT NULL AND resolved = false)::FLOAT AS fault_count,
         COUNT(DISTINCT b.id)::FLOAT AS total_sessions
       FROM ocpp_event_log oel
       JOIN charger_listings cl ON cl.ocpp_charge_point_id = oel.charge_point_id
       LEFT JOIN bookings b ON b.listing_id = cl.id AND b.status = 'completed'
         AND b.completed_at >= NOW() - INTERVAL '90 days'
       WHERE cl.id = $1
         AND oel.timestamp >= NOW() - INTERVAL '90 days'`,
      [listingId],
    )
    const { fault_count, total_sessions } = faultRes.rows[0] as {
      fault_count: number; total_sessions: number
    }
    const faultRate = total_sessions > 0 ? (fault_count / total_sessions) * 100 : 0
    const faultScore = faultRate === 0 ? 100
      : faultRate < 1 ? 90 : faultRate < 3 ? 70 : faultRate < 5 ? 50 : faultRate < 10 ? 30 : 0
    const faultDetail = total_sessions > 0
      ? `${faultRate.toFixed(1)} faults per 100 sessions (last 90 days)`
      : 'No session history'

    // ── Component 5: Driver complaints (15%) ──────────────────
    const complaintRes = await db.execute(
      `SELECT COUNT(*)::INT AS complaints FROM incident_reports
       WHERE listing_id = $1 AND incident_type NOT IN ('other')
         AND created_at >= NOW() - INTERVAL '180 days'`,
      [listingId],
    )
    const complaints = (complaintRes.rows[0] as { complaints: number }).complaints
    const complaintScore = complaints === 0 ? 100
      : complaints === 1 ? 70 : complaints === 2 ? 50 : complaints <= 4 ? 20 : 0
    const complaintDetail = complaints === 0 ? 'No complaints in last 6 months'
      : `${complaints} complaint${complaints !== 1 ? 's' : ''} in last 6 months`

    // ── Component 6: Platform inspection (15%) ────────────────
    const inspectionScore = Number(ss.score_platform_inspection ?? 50)
    const inspectionDetail = inspectionScore === 100 ? 'Platform inspection passed'
      : inspectionScore === 0 ? 'Failed platform inspection' : 'Not yet inspected'

    // ── Weighted overall score ────────────────────────────────
    const overall = Math.round(
      ageScore          * WEIGHTS.chargerAge +
      rcdScore          * WEIGHTS.rcdProtection +
      elecScore         * WEIGHTS.electricianInstalled +
      faultScore        * WEIGHTS.ocppFaultRate +
      complaintScore    * WEIGHTS.driverComplaints +
      inspectionScore   * WEIGHTS.platformInspection,
    )

    // ── Band classification ───────────────────────────────────
    const { band, bandLabel, bandColor } = this._getBand(overall)

    // ── Auto-pause if < 50 ────────────────────────────────────
    const shouldPause = overall < 50 && listing.status === 'active'
    if (shouldPause) {
      await db.execute(
        `UPDATE charger_listings SET status = 'under_review', updated_at = NOW() WHERE id = $1`,
        [listingId],
      )
    }

    // ── Persist score ─────────────────────────────────────────
    await db.execute(
      `UPDATE safety_scores SET
         overall_score = $2,
         score_charger_age = $3,
         score_rcd_protection = $4,
         score_electrician_installed = $5,
         score_ocpp_fault_rate = $6,
         score_driver_complaints = $7,
         auto_paused = $8,
         auto_paused_at = CASE WHEN $8 THEN NOW() ELSE auto_paused_at END,
         auto_pause_reason = CASE WHEN $8 THEN 'Safety score below 50' ELSE auto_pause_reason END,
         last_calculated_at = NOW(),
         updated_at = NOW()
       WHERE listing_id = $1`,
      [listingId, overall, ageScore, rcdScore, elecScore, faultScore, complaintScore, shouldPause],
    )

    if (shouldPause) {
      eventBus.publish({
        type: 'INCIDENT_REPORTED',
        incidentId: listingId,
        listingId,
        severity: 'high',
      })
    }

    return {
      listingId,
      overallScore: overall,
      band, bandLabel, bandColor,
      components: {
        chargerAge:            { score: ageScore,        weight: WEIGHTS.chargerAge * 100,           detail: ageDetail },
        rcdProtection:         { score: rcdScore,        weight: WEIGHTS.rcdProtection * 100,        detail: rcdDetail },
        electricianInstalled:  { score: elecScore,       weight: WEIGHTS.electricianInstalled * 100, detail: elecDetail },
        ocppFaultRate:         { score: faultScore,      weight: WEIGHTS.ocppFaultRate * 100,        detail: faultDetail },
        driverComplaints:      { score: complaintScore,  weight: WEIGHTS.driverComplaints * 100,     detail: complaintDetail },
        platformInspection:    { score: inspectionScore, weight: WEIGHTS.platformInspection * 100,   detail: inspectionDetail },
      },
      autoPaused: shouldPause,
      lastCalculatedAt: new Date(),
    }
  },

  /**
   * Returns the cached safety score for a listing (fast read path).
   * Falls back to live calculation if no row exists yet.
   */
  async get(listingId: string): Promise<SafetyScoreBreakdown> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT listing_id, overall_score,
              score_charger_age, score_rcd_protection, score_electrician_installed,
              score_ocpp_fault_rate, score_driver_complaints, score_platform_inspection,
              auto_paused, last_calculated_at
       FROM safety_scores WHERE listing_id = $1 LIMIT 1`,
      [listingId],
    )

    if (res.rows.length === 0) {
      // First time — calculate now
      return this.calculate(listingId)
    }

    const r = res.rows[0] as Record<string, unknown>
    const overall = Number(r['overall_score'])
    const { band, bandLabel, bandColor } = this._getBand(overall)

    return {
      listingId,
      overallScore: overall,
      band, bandLabel, bandColor,
      components: {
        chargerAge:            { score: Number(r['score_charger_age']),            weight: 20, detail: '' },
        rcdProtection:         { score: Number(r['score_rcd_protection']),         weight: 15, detail: '' },
        electricianInstalled:  { score: Number(r['score_electrician_installed']),  weight: 15, detail: '' },
        ocppFaultRate:         { score: Number(r['score_ocpp_fault_rate']),        weight: 20, detail: '' },
        driverComplaints:      { score: Number(r['score_driver_complaints']),      weight: 15, detail: '' },
        platformInspection:    { score: Number(r['score_platform_inspection']),    weight: 15, detail: '' },
      },
      autoPaused: Boolean(r['auto_paused']),
      lastCalculatedAt: r['last_calculated_at'] ? new Date(r['last_calculated_at'] as string) : null,
    }
  },

  _getBand(score: number): { band: SafetyScoreBreakdown['band']; bandLabel: string; bandColor: string } {
    if (score >= 90) return { band: 'excellent',       bandLabel: '✅ Excellent',       bandColor: '#22c55e' }
    if (score >= 70) return { band: 'good',            bandLabel: '🟡 Good',            bandColor: '#eab308' }
    if (score >= 50) return { band: 'fair',            bandLabel: '⚠️ Fair',            bandColor: '#f97316' }
    return               { band: 'needs_attention',  bandLabel: '🔴 Needs attention', bandColor: '#ef4444' }
  },
}
