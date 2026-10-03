/**
 * @file PropertyService.ts
 * @description Residential properties: a host (the property manager) groups
 * their listings into a building's bays, invites residents and decides how
 * bay revenue is split (EarningsAllocator applies the split at capture).
 *
 * Rules:
 *   - Only the property's host can manage it; bays must be that host's listings.
 *   - Residents join by an emailed single-use link (14 days). It must be
 *     accepted by the account with the invited email, because membership can
 *     route revenue to that account.
 *   - Removing a resident unassigns their bays; what they already earned stays
 *     theirs. Revenue-split changes apply to future sessions only.
 *   - Archiving releases the bays (listings go back to paying the host 100%)
 *     and ends every membership. Earnings already allocated are untouched.
 *   - Access (enforced by bookingRulesFor at booking time):
 *       public             → anyone
 *       residents_priority → residents book up to the listing's advance window,
 *                            everyone else up to PUBLIC_PRIORITY_WINDOW_HOURS ahead
 *       residents_only     → residents (and the host) only
 *     Residents get resident_discount_pct off the quoted tariff (not idle fees).
 *
 * @module domains/property
 */

import { createHash, randomBytes } from 'node:crypto'
import { getDb, transaction, type Db } from '@/lib/db'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors/AppError'
import { escapeHtml, sendEmail } from '@/lib/email'

export type RevenueModel = 'property' | 'resident' | 'split'
export type AccessMode = 'residents_only' | 'public' | 'residents_priority'

export const INVITE_TTL_DAYS = 14
/** How far ahead non-residents may book a bay at a residents_priority property. */
export const PUBLIC_PRIORITY_WINDOW_HOURS = 48

export type PropertyInput = {
  name: string
  addressLine1: string
  addressLine2?: string | null
  city: string
  postcode: string
  totalUnits?: number | null
  revenueModel: RevenueModel
  splitPropertyPct: number
  accessMode: AccessMode
  residentDiscountPct: number
}

export type PropertySummary = {
  id: string
  name: string
  addressLine1: string
  city: string
  postcode: string
  totalBays: number
  activeBays: number
  totalResidents: number
  pendingInvites: number
  last30DaysRevenuePence: number
  revenueModel: RevenueModel
  splitPropertyPct: number
  accessMode: AccessMode
}

export type PropertyBay = {
  id: string
  listingId: string
  listingTitle: string
  listingStatus: string
  bayLabel: string | null
  assignedResidentId: string | null
  assignedResidentEmail: string | null
}

export type PropertyResident = {
  id: string
  email: string
  unitNumber: string | null
  status: 'invited' | 'active'
  name: string | null
  invitedAt: string
  inviteExpiresAt: string | null
  acceptedAt: string | null
}

export type PropertyDetail = PropertySummary & {
  addressLine2: string | null
  totalUnits: number | null
  residentDiscountPct: number
  bays: PropertyBay[]
  residents: PropertyResident[]
  /** The host's listings not yet in any property, for "add bay". */
  availableListings: { id: string; title: string; status: string }[]
}

export type Residency = {
  residentId: string
  propertyId: string
  propertyName: string
  address: string
  unitNumber: string | null
  accessMode: AccessMode
  residentDiscountPct: number
  revenueModel: RevenueModel
  /** Resident's share of their bay's earnings, in percent (0 when they earn nothing). */
  residentSharePct: number
  bays: { id: string; listingId: string; listingTitle: string; bayLabel: string | null }[]
  earnedPence: number
}

export type InvitePreview = {
  propertyName: string
  city: string
  email: string
  unitNumber: string | null
  state: 'valid' | 'expired' | 'used'
}

/** What booking needs to know about a listing that may be a property bay. */
export type BayBookingRules = {
  propertyName: string
  accessMode: AccessMode
  isResident: boolean
  residentDiscountPct: number
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

function appUrl(): string {
  return process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
}

function residentSharePct(model: RevenueModel, splitPropertyPct: number): number {
  return model === 'resident' ? 100 : model === 'split' ? 100 - splitPropertyPct : 0
}

function validate(input: PropertyInput): void {
  if (input.revenueModel === 'split' && (input.splitPropertyPct <= 0 || input.splitPropertyPct >= 100)) {
    throw new ValidationError('For a split, the property share must be between 1% and 99%.')
  }
}

/** The caller's host profile id, or 403 when they are not a host. */
async function hostProfileId(db: Db, userId: string): Promise<string> {
  const res = await db.execute(`SELECT id FROM host_profiles WHERE user_id = $1`, [userId])
  const id = res.rows[0]?.['id'] as string | undefined
  if (!id) throw new ForbiddenError('Set up your host account before adding a property.')
  return id
}

/** Loads a live property owned by the caller, locking it when inside a transaction. */
async function ownedProperty(db: Db, userId: string, propertyId: string, lock = false): Promise<Record<string, unknown>> {
  const res = await db.execute(
    `SELECT p.* FROM properties p JOIN host_profiles hp ON hp.id = p.host_profile_id
     WHERE p.id = $1 AND hp.user_id = $2 AND p.archived_at IS NULL${lock ? ' FOR UPDATE OF p' : ''}`,
    [propertyId, userId],
  )
  const row = res.rows[0]
  if (!row) throw new NotFoundError('Property', propertyId)
  return row
}

async function sendInvite(db: Db, propertyId: string, residentId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const res = await db.execute(
    `UPDATE property_residents
     SET invite_token_hash = $3, invite_expires_at = NOW() + make_interval(days => $4::int), invited_at = NOW()
     WHERE id = $2 AND property_id = $1
     RETURNING email`,
    [propertyId, residentId, hashToken(token), INVITE_TTL_DAYS],
  )
  const email = res.rows[0]?.['email'] as string
  const p = await db.execute(
    `SELECT p.name, p.city, u.full_name
     FROM properties p JOIN host_profiles hp ON hp.id = p.host_profile_id JOIN users u ON u.id = hp.user_id
     WHERE p.id = $1`,
    [propertyId],
  )
  const row = p.rows[0]!
  const building = `${row['name'] as string}, ${row['city'] as string}`
  const manager = (row['full_name'] as string | null) || 'Your property manager'
  const link = `${appUrl()}/property/invite?token=${encodeURIComponent(token)}`
  await sendEmail({
    to: email,
    subject: `You're invited to EV charging at ${row['name'] as string}`,
    text: `${manager} has invited you to join ${building} on Zipgrid as a resident.\n\n`
      + `Accept the invite: ${link}\n\nSign in (or create an account) with ${email}. The link expires in ${INVITE_TTL_DAYS} days.`,
    html: `<p>${escapeHtml(manager)} has invited you to join <strong>${escapeHtml(building)}</strong> on Zipgrid as a resident.</p>`
      + `<p><a href="${link}">Accept the invite</a></p>`
      + `<p>Sign in (or create an account) with ${escapeHtml(email)}. The link expires in ${INVITE_TTL_DAYS} days.</p>`,
  })
}

const SUMMARY_SELECT = `
  SELECT p.id, p.name, p.address_line1, p.address_line2, p.city, p.postcode, p.total_units,
         p.revenue_model, p.split_property_pct, p.access_mode, p.resident_discount_pct,
         (SELECT COUNT(*) FROM property_bays pb WHERE pb.property_id = p.id) AS total_bays,
         (SELECT COUNT(*) FROM property_bays pb JOIN charger_listings cl ON cl.id = pb.listing_id
           WHERE pb.property_id = p.id AND cl.status = 'active') AS active_bays,
         (SELECT COUNT(*) FROM property_residents r WHERE r.property_id = p.id AND r.status = 'active') AS total_residents,
         (SELECT COUNT(*) FROM property_residents r WHERE r.property_id = p.id AND r.status = 'invited') AS pending_invites,
         (SELECT COALESCE(SUM(ea.amount_pence), 0)
            FROM earnings_allocations ea
            JOIN transactions t ON t.id = ea.transaction_id
            JOIN bookings b ON b.id = t.booking_id
            JOIN property_bays pb ON pb.listing_id = b.listing_id
           WHERE pb.property_id = p.id AND ea.created_at > NOW() - INTERVAL '30 days') AS revenue_30d
  FROM properties p`

function toSummary(r: Record<string, unknown>): PropertySummary {
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    addressLine1: r['address_line1'] as string,
    city: r['city'] as string,
    postcode: r['postcode'] as string,
    totalBays: Number(r['total_bays']),
    activeBays: Number(r['active_bays']),
    totalResidents: Number(r['total_residents']),
    pendingInvites: Number(r['pending_invites']),
    last30DaysRevenuePence: Number(r['revenue_30d']),
    revenueModel: r['revenue_model'] as RevenueModel,
    splitPropertyPct: Number(r['split_property_pct']),
    accessMode: r['access_mode'] as AccessMode,
  }
}

export const PropertyService = {
  /** The caller's live properties with headline stats. */
  async list(userId: string): Promise<PropertySummary[]> {
    const db = await getDb()
    const res = await db.execute(
      `${SUMMARY_SELECT}
       JOIN host_profiles hp ON hp.id = p.host_profile_id
       WHERE hp.user_id = $1 AND p.archived_at IS NULL
       ORDER BY p.created_at DESC`,
      [userId],
    )
    return res.rows.map(toSummary)
  },

  /** Full property view for its host: settings, bays, residents, listings that can become bays. */
  async get(userId: string, propertyId: string): Promise<PropertyDetail> {
    const db = await getDb()
    await ownedProperty(db, userId, propertyId)
    const [summary, bays, residents, available] = await Promise.all([
      db.execute(`${SUMMARY_SELECT} WHERE p.id = $1`, [propertyId]),
      db.execute(
        `SELECT pb.id, pb.listing_id, pb.bay_label, pb.assigned_resident_id,
                cl.title, cl.status, r.email AS resident_email
         FROM property_bays pb
         JOIN charger_listings cl ON cl.id = pb.listing_id
         LEFT JOIN property_residents r ON r.id = pb.assigned_resident_id
         WHERE pb.property_id = $1
         ORDER BY pb.bay_label NULLS LAST, pb.created_at`,
        [propertyId],
      ),
      db.execute(
        `SELECT r.id, r.email, r.unit_number, r.status, r.invited_at, r.invite_expires_at, r.accepted_at,
                u.full_name AS name
         FROM property_residents r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.property_id = $1 AND r.status <> 'removed'
         ORDER BY r.status, r.unit_number NULLS LAST, r.email`,
        [propertyId],
      ),
      db.execute(
        `SELECT cl.id, cl.title, cl.status
         FROM charger_listings cl
         JOIN properties p ON p.host_profile_id = cl.host_profile_id AND p.id = $1
         WHERE cl.status <> 'deactivated'
           AND NOT EXISTS (SELECT 1 FROM property_bays pb WHERE pb.listing_id = cl.id)
         ORDER BY cl.title`,
        [propertyId],
      ),
    ])
    const r = summary.rows[0]!
    return {
      ...toSummary(r),
      addressLine2: (r['address_line2'] as string | null) ?? null,
      totalUnits: r['total_units'] != null ? Number(r['total_units']) : null,
      residentDiscountPct: Number(r['resident_discount_pct']),
      bays: bays.rows.map((b) => ({
        id: b['id'] as string,
        listingId: b['listing_id'] as string,
        listingTitle: b['title'] as string,
        listingStatus: b['status'] as string,
        bayLabel: (b['bay_label'] as string | null) ?? null,
        assignedResidentId: (b['assigned_resident_id'] as string | null) ?? null,
        assignedResidentEmail: (b['resident_email'] as string | null) ?? null,
      })),
      residents: residents.rows.map((x) => ({
        id: x['id'] as string,
        email: x['email'] as string,
        unitNumber: (x['unit_number'] as string | null) ?? null,
        status: x['status'] as 'invited' | 'active',
        name: (x['name'] as string | null) ?? null,
        invitedAt: new Date(x['invited_at'] as string).toISOString(),
        inviteExpiresAt: x['invite_expires_at'] ? new Date(x['invite_expires_at'] as string).toISOString() : null,
        acceptedAt: x['accepted_at'] ? new Date(x['accepted_at'] as string).toISOString() : null,
      })),
      availableListings: available.rows.map((l) => ({ id: l['id'] as string, title: l['title'] as string, status: l['status'] as string })),
    }
  },

  async create(userId: string, input: PropertyInput): Promise<{ id: string }> {
    validate(input)
    const db = await getDb()
    const hpId = await hostProfileId(db, userId)
    const res = await db.execute(
      `INSERT INTO properties (host_profile_id, name, address_line1, address_line2, city, postcode, total_units,
                               revenue_model, split_property_pct, access_mode, resident_discount_pct)
       VALUES ($1, $2, $3, $4, $5, UPPER($6), $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        hpId, input.name, input.addressLine1, input.addressLine2 ?? null, input.city, input.postcode,
        input.totalUnits ?? null, input.revenueModel,
        input.revenueModel === 'split' ? input.splitPropertyPct : 100,
        input.accessMode, input.residentDiscountPct,
      ],
    )
    return { id: res.rows[0]!['id'] as string }
  },

  /** Updates settings. A new revenue split applies to sessions captured from now on. */
  async update(userId: string, propertyId: string, input: PropertyInput): Promise<void> {
    validate(input)
    const db = await getDb()
    await ownedProperty(db, userId, propertyId)
    await db.execute(
      `UPDATE properties SET name = $2, address_line1 = $3, address_line2 = $4, city = $5, postcode = UPPER($6),
              total_units = $7, revenue_model = $8, split_property_pct = $9, access_mode = $10,
              resident_discount_pct = $11
       WHERE id = $1`,
      [
        propertyId, input.name, input.addressLine1, input.addressLine2 ?? null, input.city, input.postcode,
        input.totalUnits ?? null, input.revenueModel,
        input.revenueModel === 'split' ? input.splitPropertyPct : 100,
        input.accessMode, input.residentDiscountPct,
      ],
    )
  },

  /** Archives a property: bays are released and memberships end. Allocated earnings stay. */
  async archive(userId: string, propertyId: string): Promise<void> {
    await transaction(async (tx) => {
      await ownedProperty(tx, userId, propertyId, true)
      await tx.execute(`DELETE FROM property_bays WHERE property_id = $1`, [propertyId])
      await tx.execute(
        `UPDATE property_residents SET status = 'removed', removed_at = NOW(), invite_token_hash = NULL
         WHERE property_id = $1 AND status <> 'removed'`,
        [propertyId],
      )
      await tx.execute(`UPDATE properties SET archived_at = NOW() WHERE id = $1`, [propertyId])
    })
  },

  /* ── Bays ─────────────────────────────────────────────────── */

  async addBay(userId: string, propertyId: string, listingId: string, bayLabel: string | null): Promise<{ id: string }> {
    return transaction(async (tx) => {
      const p = await ownedProperty(tx, userId, propertyId, true)
      const l = await tx.execute(
        `SELECT id, status FROM charger_listings WHERE id = $1 AND host_profile_id = $2`,
        [listingId, p['host_profile_id']],
      )
      if (!l.rows[0]) throw new ValidationError('You can only add your own listings as bays.')
      if (l.rows[0]['status'] === 'deactivated') throw new ValidationError('That listing is deactivated.')
      const existing = await tx.execute(`SELECT property_id FROM property_bays WHERE listing_id = $1`, [listingId])
      if (existing.rows[0]) throw new ConflictError('That listing is already a bay at a property.', 'BAY_EXISTS')
      const res = await tx.execute(
        `INSERT INTO property_bays (property_id, listing_id, bay_label) VALUES ($1, $2, $3) RETURNING id`,
        [propertyId, listingId, bayLabel],
      )
      return { id: res.rows[0]!['id'] as string }
    })
  },

  /** Relabels a bay and/or (un)assigns it to an active resident of the same property. */
  async updateBay(
    userId: string, propertyId: string, bayId: string,
    patch: { bayLabel?: string | null; assignedResidentId?: string | null },
  ): Promise<void> {
    await transaction(async (tx) => {
      await ownedProperty(tx, userId, propertyId, true)
      const bay = await tx.execute(`SELECT id FROM property_bays WHERE id = $1 AND property_id = $2`, [bayId, propertyId])
      if (!bay.rows[0]) throw new NotFoundError('Bay', bayId)
      if (patch.assignedResidentId) {
        const r = await tx.execute(
          `SELECT id FROM property_residents WHERE id = $1 AND property_id = $2 AND status = 'active'`,
          [patch.assignedResidentId, propertyId],
        )
        if (!r.rows[0]) throw new ValidationError('Bays can only be assigned to residents who have accepted their invite.')
      }
      if (patch.bayLabel !== undefined) {
        await tx.execute(`UPDATE property_bays SET bay_label = $2 WHERE id = $1`, [bayId, patch.bayLabel])
      }
      if (patch.assignedResidentId !== undefined) {
        await tx.execute(`UPDATE property_bays SET assigned_resident_id = $2 WHERE id = $1`, [bayId, patch.assignedResidentId])
      }
    })
  },

  /** Removes a bay; the listing stays live and earns for the host alone. */
  async removeBay(userId: string, propertyId: string, bayId: string): Promise<void> {
    const db = await getDb()
    await ownedProperty(db, userId, propertyId)
    const res = await db.execute(`DELETE FROM property_bays WHERE id = $1 AND property_id = $2 RETURNING id`, [bayId, propertyId])
    if (!res.rows[0]) throw new NotFoundError('Bay', bayId)
  },

  /* ── Residents ────────────────────────────────────────────── */

  /** Invites a resident by email (re-invites someone previously removed). */
  async inviteResident(userId: string, propertyId: string, email: string, unitNumber: string | null): Promise<{ id: string }> {
    const normalised = email.trim().toLowerCase()
    return transaction(async (tx) => {
      await ownedProperty(tx, userId, propertyId, true)
      const existing = await tx.execute(
        `SELECT id, status FROM property_residents WHERE property_id = $1 AND email = $2`,
        [propertyId, normalised],
      )
      const row = existing.rows[0]
      let id: string
      if (row && row['status'] !== 'removed') {
        throw new ConflictError(
          row['status'] === 'active' ? 'That person is already a resident.' : 'That person already has a pending invite — resend it instead.',
          'RESIDENT_EXISTS',
        )
      } else if (row) {
        id = row['id'] as string
        await tx.execute(
          `UPDATE property_residents SET status = 'invited', unit_number = $2, user_id = NULL,
                  accepted_at = NULL, removed_at = NULL
           WHERE id = $1`,
          [id, unitNumber],
        )
      } else {
        const res = await tx.execute(
          `INSERT INTO property_residents (property_id, email, unit_number) VALUES ($1, $2, $3) RETURNING id`,
          [propertyId, normalised, unitNumber],
        )
        id = res.rows[0]!['id'] as string
      }
      await sendInvite(tx, propertyId, id)
      return { id }
    })
  },

  /** Issues a fresh invite link (the old one stops working). */
  async resendInvite(userId: string, propertyId: string, residentId: string): Promise<void> {
    await transaction(async (tx) => {
      await ownedProperty(tx, userId, propertyId, true)
      const r = await tx.execute(
        `SELECT status FROM property_residents WHERE id = $1 AND property_id = $2`,
        [residentId, propertyId],
      )
      if (!r.rows[0]) throw new NotFoundError('Resident', residentId)
      if (r.rows[0]['status'] !== 'invited') throw new ValidationError('Only pending invites can be resent.')
      await sendInvite(tx, propertyId, residentId)
    })
  },

  async updateResident(userId: string, propertyId: string, residentId: string, unitNumber: string | null): Promise<void> {
    const db = await getDb()
    await ownedProperty(db, userId, propertyId)
    const res = await db.execute(
      `UPDATE property_residents SET unit_number = $3 WHERE id = $1 AND property_id = $2 AND status <> 'removed' RETURNING id`,
      [residentId, propertyId, unitNumber],
    )
    if (!res.rows[0]) throw new NotFoundError('Resident', residentId)
  },

  /** Removes a resident or cancels their invite; their bays are unassigned. */
  async removeResident(userId: string, propertyId: string, residentId: string): Promise<void> {
    await transaction(async (tx) => {
      await ownedProperty(tx, userId, propertyId, true)
      const res = await tx.execute(
        `UPDATE property_residents SET status = 'removed', removed_at = NOW(), invite_token_hash = NULL
         WHERE id = $1 AND property_id = $2 AND status <> 'removed' RETURNING id`,
        [residentId, propertyId],
      )
      if (!res.rows[0]) throw new NotFoundError('Resident', residentId)
      await tx.execute(`UPDATE property_bays SET assigned_resident_id = NULL WHERE assigned_resident_id = $1`, [residentId])
    })
  },

  /* ── Resident side ────────────────────────────────────────── */

  /** What an invite link is for, without accepting it. */
  async previewInvite(token: string): Promise<InvitePreview> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT r.email, r.unit_number, r.status, r.invite_expires_at < NOW() AS expired, p.name, p.city
       FROM property_residents r JOIN properties p ON p.id = r.property_id
       WHERE r.invite_token_hash = $1 AND p.archived_at IS NULL`,
      [hashToken(token)],
    )
    const r = res.rows[0]
    if (!r) throw new NotFoundError('Invite')
    return {
      propertyName: r['name'] as string,
      city: r['city'] as string,
      email: r['email'] as string,
      unitNumber: (r['unit_number'] as string | null) ?? null,
      state: r['status'] !== 'invited' ? 'used' : r['expired'] ? 'expired' : 'valid',
    }
  },

  /** Accepts an invite for the signed-in user, whose email must match it. */
  async acceptInvite(userId: string, token: string): Promise<{ propertyId: string }> {
    return transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT r.id, r.property_id, r.email, r.status, r.invite_expires_at < NOW() AS expired
         FROM property_residents r JOIN properties p ON p.id = r.property_id
         WHERE r.invite_token_hash = $1 AND p.archived_at IS NULL
         FOR UPDATE OF r`,
        [hashToken(token)],
      )
      const r = res.rows[0]
      if (!r || r['status'] !== 'invited') throw new NotFoundError('Invite')
      if (r['expired']) throw new ValidationError('This invite has expired. Ask your property manager to resend it.', 'INVITE_EXPIRED')
      const u = await tx.execute(`SELECT email FROM users WHERE id = $1`, [userId])
      const email = String(u.rows[0]?.['email'] ?? '').toLowerCase()
      if (email !== String(r['email']).toLowerCase()) {
        throw new ForbiddenError(`This invite was sent to ${r['email'] as string}. Sign in with that email to accept it.`)
      }
      await tx.execute(
        `UPDATE property_residents SET status = 'active', user_id = $2, accepted_at = NOW(),
                invite_token_hash = NULL, invite_expires_at = NULL
         WHERE id = $1`,
        [r['id'], userId],
      )
      return { propertyId: r['property_id'] as string }
    })
  },

  /** Properties the user lives at, with their bays and what they have earned. */
  async residencies(userId: string): Promise<Residency[]> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT r.id AS resident_id, r.unit_number, p.id AS property_id, p.name, p.address_line1, p.city, p.postcode,
              p.access_mode, p.resident_discount_pct, p.revenue_model, p.split_property_pct,
              COALESCE((SELECT json_agg(json_build_object('id', pb.id, 'listingId', pb.listing_id,
                                                          'listingTitle', cl.title, 'bayLabel', pb.bay_label)
                                        ORDER BY pb.bay_label)
                        FROM property_bays pb JOIN charger_listings cl ON cl.id = pb.listing_id
                        WHERE pb.assigned_resident_id = r.id), '[]'::json) AS bays,
              (SELECT COALESCE(SUM(ea.amount_pence), 0)
                 FROM earnings_allocations ea
                 JOIN transactions t ON t.id = ea.transaction_id
                 JOIN bookings b ON b.id = t.booking_id
                 JOIN property_bays pb ON pb.listing_id = b.listing_id AND pb.property_id = p.id
                WHERE ea.beneficiary_user_id = r.user_id AND ea.share = 'resident') AS earned
       FROM property_residents r JOIN properties p ON p.id = r.property_id
       WHERE r.user_id = $1 AND r.status = 'active' AND p.archived_at IS NULL
       ORDER BY p.name`,
      [userId],
    )
    return res.rows.map((r) => {
      const bays = (typeof r['bays'] === 'string' ? JSON.parse(r['bays']) : r['bays']) as Residency['bays']
      const model = r['revenue_model'] as RevenueModel
      return {
        residentId: r['resident_id'] as string,
        propertyId: r['property_id'] as string,
        propertyName: r['name'] as string,
        address: `${r['address_line1'] as string}, ${r['city'] as string} ${r['postcode'] as string}`,
        unitNumber: (r['unit_number'] as string | null) ?? null,
        accessMode: r['access_mode'] as AccessMode,
        residentDiscountPct: Number(r['resident_discount_pct']),
        revenueModel: model,
        residentSharePct: residentSharePct(model, Number(r['split_property_pct'])),
        bays,
        earnedPence: Number(r['earned']),
      }
    })
  },

  /** Leaves a property (the resident's own choice). Bays are unassigned; earnings stay. */
  async leave(userId: string, residentId: string): Promise<void> {
    await transaction(async (tx) => {
      const res = await tx.execute(
        `UPDATE property_residents SET status = 'removed', removed_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING id`,
        [residentId, userId],
      )
      if (!res.rows[0]) throw new NotFoundError('Residency', residentId)
      await tx.execute(`UPDATE property_bays SET assigned_resident_id = NULL WHERE assigned_resident_id = $1`, [residentId])
    })
  },

  /* ── Booking ──────────────────────────────────────────────── */

  /** Access rules for a listing that is a bay at a live property; null for ordinary listings. */
  async bookingRulesFor(db: Db, listingId: string, userId: string): Promise<BayBookingRules | null> {
    const res = await db.execute(
      `SELECT p.name, p.access_mode, p.resident_discount_pct,
              EXISTS (SELECT 1 FROM property_residents r
                      WHERE r.property_id = p.id AND r.user_id = $2 AND r.status = 'active') AS is_resident
       FROM property_bays pb JOIN properties p ON p.id = pb.property_id AND p.archived_at IS NULL
       WHERE pb.listing_id = $1`,
      [listingId, userId],
    )
    const r = res.rows[0]
    if (!r) return null
    return {
      propertyName: r['name'] as string,
      accessMode: r['access_mode'] as AccessMode,
      isResident: Boolean(r['is_resident']),
      residentDiscountPct: Number(r['resident_discount_pct']),
    }
  },
}
