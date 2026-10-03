/**
 * Data rights against the real schema (PGlite): the export includes concierge
 * chats, vehicles and building memberships; a deletion request is processed
 * by the daily job once its cooling-off ends, and removes chats, plates and
 * memberships while keeping financial records.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

import { pg, setupDatabase } from '../helpers/pglite-db'
import { DELETION_COOLING_OFF_DAYS, GdprService } from '@/domains/compliance/GdprService'

let userId: string
let vehicleId: string

beforeAll(async () => {
  await setupDatabase()
  // A driver with no open bookings, so they can request deletion.
  const d = await pg.query<{ uid: string; veh: string }>(
    `SELECT u.id AS uid, v.id AS veh FROM users u
     JOIN driver_profiles dp ON dp.user_id = u.id JOIN driver_vehicles v ON v.driver_profile_id = dp.id
     WHERE NOT EXISTS (SELECT 1 FROM host_profiles hp WHERE hp.user_id = u.id)
     ORDER BY u.id LIMIT 1`,
  )
  userId = d.rows[0]!.uid
  vehicleId = d.rows[0]!.veh
  await pg.query(
    `UPDATE bookings SET status = 'completed' WHERE driver_profile_id IN (SELECT id FROM driver_profiles WHERE user_id = $1)
       AND status IN ('pending', 'confirmed', 'active')`,
    [userId],
  )
  await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [userId])
  await pg.query(`DELETE FROM wallet_balances WHERE user_id = $1`, [userId])
  await pg.query(`UPDATE driver_vehicles SET license_plate = 'AB12 CDE' WHERE id = $1`, [vehicleId])
  await pg.query(
    `INSERT INTO concierge_conversations (user_id, messages, turn)
     VALUES ($1, $2::jsonb, 1)`,
    [userId, JSON.stringify([
      { role: 'user', content: [{ type: 'text', text: '[Context: it is Monday. The user shared their location: 51.5000, -0.1200.]\n\nGet me charged near home' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Booked.' }] },
    ])],
  )
  const hp = await pg.query<{ id: string }>(`SELECT id FROM host_profiles LIMIT 1`)
  const prop = await pg.query<{ id: string }>(
    `INSERT INTO properties (host_profile_id, name, address_line1, city, postcode, revenue_model, split_property_pct, access_mode, resident_discount_pct)
     VALUES ($1, 'Test Court', '1 Test St', 'Bristol', 'BS1 4DJ', 'property', 100, 'public', 0) RETURNING id`,
    [hp.rows[0]!.id],
  )
  await pg.query(
    `INSERT INTO property_residents (property_id, email, unit_number, status, user_id, accepted_at)
     SELECT $1, email, 'Flat 2', 'active', id, NOW() FROM users WHERE id = $2`,
    [prop.rows[0]!.id, userId],
  )
})

describe('data rights', () => {
  it('exports concierge chats (with shared locations), vehicles and residencies', async () => {
    const out = await GdprService.exportData(userId)
    expect(out.vehicles).toContainEqual(expect.objectContaining({ license_plate: 'AB12 CDE' }))
    expect(out.residencies).toContainEqual(expect.objectContaining({ property: 'Test Court', unit_number: 'Flat 2' }))
    expect(out.conciergeConversations).toHaveLength(1)
    expect(JSON.stringify(out.conciergeConversations)).toContain('51.5000, -0.1200')
  })

  it('processes a deletion once the cooling-off ends and removes chats, plates and memberships', async () => {
    const req = await GdprService.requestDeletion(userId, 'test')
    const days = (req.scheduledFor.getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(DELETION_COOLING_OFF_DAYS)

    // Not due yet: nothing happens.
    expect(await GdprService.processDue()).toEqual({ processed: 0, failed: 0 })

    await pg.query(`UPDATE gdpr_deletion_requests SET scheduled_for = NOW() - INTERVAL '1 minute' WHERE id = $1`, [req.id])
    expect(await GdprService.processDue()).toEqual({ processed: 1, failed: 0 })

    const user = await pg.query<{ email: string; full_name: string }>(`SELECT email, full_name FROM users WHERE id = $1`, [userId])
    expect(user.rows[0]).toMatchObject({ full_name: 'Deleted User', email: expect.stringMatching(/@deleted\.zipgrid\.internal$/) })
    const chats = await pg.query(`SELECT 1 FROM concierge_conversations WHERE user_id = $1`, [userId])
    expect(chats.rows).toEqual([])
    const plate = await pg.query<{ license_plate: string | null }>(`SELECT license_plate FROM driver_vehicles WHERE id = $1`, [vehicleId])
    expect(plate.rows[0]!.license_plate).toBeNull()
    const res = await pg.query<{ status: string; email: string }>(`SELECT status, email FROM property_residents WHERE user_id = $1`, [userId])
    expect(res.rows[0]).toMatchObject({ status: 'removed', email: expect.stringMatching(/@deleted\.zipgrid\.internal$/) })
    const done = await pg.query<{ status: string }>(`SELECT status FROM gdpr_deletion_requests WHERE id = $1`, [req.id])
    expect(done.rows[0]!.status).toBe('completed')
  })
})

describe('deletion audit trail', () => {
  it('records the completed deletion in the audit log', async () => {
    const r = await pg.query(`SELECT 1 FROM audit_log WHERE action = 'gdpr.deletion_completed' AND entity_id = $1`, [userId])
    expect(r.rows).toHaveLength(1)
  })
})
