/**
 * Scheduler against the real schema (PGlite): daily jobs run once per UTC day,
 * failures are isolated and retried, and deferred wallet bookings are secured
 * by the authorize_due_bookings job.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

import { pg, setupDatabase } from '../helpers/pglite-db'
import { JOBS, Scheduler } from '@/domains/scheduling/Scheduler'
import { BookingService } from '@/domains/booking/BookingService'
import { WalletService } from '@/domains/payments/WalletService'

beforeAll(async () => { await setupDatabase() })

describe('Scheduler', () => {
  it('runs daily jobs once per UTC day and every-tick jobs every time', async () => {
    const calls: string[] = []
    const jobs = [
      { name: 'test_daily', frequency: 'daily' as const, run: async () => { calls.push('daily'); return 1 } },
      { name: 'test_tick', frequency: 'every_tick' as const, run: async () => { calls.push('tick'); return 2 } },
    ]
    await Scheduler.tick(jobs)
    const second = await Scheduler.tick(jobs)
    expect(calls).toEqual(['daily', 'tick', 'tick'])
    expect(second[0]).toEqual({ job: 'test_daily', status: 'skipped', reason: 'already_ran_today' })
    const row = await pg.query(`SELECT result FROM scheduled_job_runs WHERE job_name = 'test_daily'`)
    expect(row.rows).toEqual([{ result: 1 }])
  })

  it('isolates a failing job and retries a failed daily job on the next tick', async () => {
    let attempts = 0
    const jobs = [
      { name: 'flaky_daily', frequency: 'daily' as const, run: async () => { if (++attempts === 1) throw new Error('boom'); return 'ok' } },
      { name: 'after', frequency: 'every_tick' as const, run: async () => 'still ran' },
    ]
    const first = await Scheduler.tick(jobs)
    expect(first).toEqual([
      { job: 'flaky_daily', status: 'failed', error: 'boom' },
      { job: 'after', status: 'ok', result: 'still ran' },
    ])
    const second = await Scheduler.tick(jobs)
    expect(second[0]).toEqual({ job: 'flaky_daily', status: 'ok', result: 'ok' })
  })

  it('runs every production job without error on the seeded database', async () => {
    const outcomes = await Scheduler.tick()
    expect(outcomes.map((o) => o.job)).toEqual(JOBS.map((j) => j.name))
    expect(outcomes.filter((o) => o.status === 'failed')).toEqual([])
  })

  it('authorize_due_bookings reserves wallet funds for a deferred recurring booking', async () => {
    const r = await pg.query<{ listing: string; du: string; veh: string }>(
      `SELECT cl.id AS listing, dp.user_id AS du, v.id AS veh
       FROM charger_listings cl JOIN host_profiles hp ON hp.id = cl.host_profile_id
       CROSS JOIN driver_profiles dp JOIN driver_vehicles v ON v.driver_profile_id = dp.id
       WHERE cl.status = 'active' AND hp.user_id <> dp.user_id LIMIT 1`,
    )
    const f = r.rows[0]!
    await pg.query(
      `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24,
              advance_booking_days = 365 WHERE id = $1`, [f.listing])
    await pg.query(
      `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence) VALUES ($1, 10000, 0)
       ON CONFLICT (user_id) DO UPDATE SET balance_pence = 10000, pending_pence = 0`, [f.du])

    // A recurring occurrence 10 days out is created without a reservation…
    const start = new Date(Date.now() + 10 * 86_400_000)
    start.setUTCMinutes(0, 0, 0)
    const booking = await BookingService.create({
      userId: f.du, listingId: f.listing, vehicleId: f.veh,
      scheduledStart: start, scheduledEnd: new Date(start.getTime() + 3_600_000),
      paymentMethodId: null, payWithWallet: true, recurringSeriesId: crypto.randomUUID(),
    })
    expect((await WalletService.getBalance(f.du)).pendingPence).toBe(0)

    // …and secured by the job once it is within 24 hours of starting.
    await pg.query(
      `UPDATE bookings SET scheduled_start = NOW() + INTERVAL '12 hours', scheduled_end = NOW() + INTERVAL '13 hours'
       WHERE id = $1`, [booking.id])
    expect(await Scheduler.runOne('authorize_due_bookings')).toMatchObject({ status: 'ok', result: { authorised: 1 } })
    expect((await WalletService.getBalance(f.du)).pendingPence).toBe(booking.estimatedCostPence)
    const t = await pg.query(`SELECT payment_source, status FROM transactions WHERE booking_id = $1`, [booking.id])
    expect(t.rows[0]).toEqual({ payment_source: 'wallet', status: 'hold_placed' })
  })
})
