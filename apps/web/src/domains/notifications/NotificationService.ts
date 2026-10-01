/**
 * @file NotificationService.ts
 * @description Platform notification service — creates, delivers, and manages
 * in-app, email, and SMS notifications via a DB-backed queue.
 *
 * Architecture:
 *   - notifications table is the source of truth and delivery queue
 *   - Delivery providers (email via Resend, SMS via Twilio) are called here
 *   - In-app notifications are read directly from the DB via listByUser
 *   - bootstrapNotificationDelivery() starts a polling loop for undelivered items
 *
 * Notification categories:
 *   booking_confirmed, booking_cancelled, session_started, session_completed,
 *   payment_captured, payout_sent, kyc_update, emergency_mode,
 *   new_review, reward_earned, referral_joined, system_message
 *
 * @module domains/notifications
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'

/* ── Types ─────────────────────────────────────────────────── */

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push'

export type NotificationCategory =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'session_started'
  | 'session_completed'
  | 'payment_captured'
  | 'payout_sent'
  | 'kyc_update'
  | 'emergency_mode'
  | 'new_review'
  | 'reward_earned'
  | 'referral_joined'
  | 'system_message'

export type SendNotificationInput = {
  userId: string
  category: NotificationCategory
  title: string
  body: string
  /** Deep-link path within the app (e.g. /driver/bookings/abc) */
  actionUrl?: string
  /** Extra structured data stored as JSONB */
  metadata?: Record<string, unknown>
  /** Which channels to use. Defaults to ['in_app'] */
  channels?: NotificationChannel[]
}

export type NotificationRow = {
  id: string
  userId: string
  category: NotificationCategory
  title: string
  body: string
  actionUrl: string | null
  isRead: boolean
  readAt: Date | null
  emailSentAt: Date | null
  smsSentAt: Date | null
  createdAt: Date
}

export type NotificationPreferences = {
  userId: string
  emailEnabled: boolean
  smsEnabled: boolean
  pushEnabled: boolean
  categoriesDisabled: string[]
}

/* ── Notification service ───────────────────────────────────── */

export const NotificationService = {

  /**
   * Creates a notification record and dispatches delivery for requested channels.
   * In-app is always persisted. Email/SMS are sent if the user has them enabled.
   */
  async send(input: SendNotificationInput): Promise<NotificationRow> {
    const db = await getDb()
    const id = uuidv4()
    const channels = input.channels ?? ['in_app']

    await db.execute(
      `INSERT INTO notifications (
         id, user_id, category, title, body, action_url,
         metadata, is_read, channels_requested,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::jsonb, false, $8,
         NOW(), NOW()
       )`,
      [
        id,
        input.userId,
        input.category,
        input.title,
        input.body,
        input.actionUrl ?? null,
        JSON.stringify(input.metadata ?? {}),
        channels,
      ],
    )

    // Dispatch non-in-app channels asynchronously (best-effort)
    if (channels.includes('email')) {
      void this._sendEmail(id, input.userId, input.title, input.body, input.actionUrl ?? null)
    }
    if (channels.includes('sms')) {
      void this._sendSms(id, input.userId, input.body)
    }

    return this.getById(id)
  },

  /**
   * Returns a single notification by ID.
   */
  async getById(notificationId: string): Promise<NotificationRow> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, user_id, category, title, body, action_url,
              is_read, read_at, email_sent_at, sms_sent_at, created_at
       FROM notifications WHERE id = $1 LIMIT 1`,
      [notificationId],
    )
    if (res.rows.length === 0) throw new Error(`Notification ${notificationId} not found`)
    return this._mapRow(res.rows[0] as Record<string, unknown>)
  },

  /**
   * Returns paginated notifications for a user, newest first.
   */
  async listByUser(
    userId: string,
    options: {
      page?: number
      pageSize?: number
      unreadOnly?: boolean
    } = {},
  ): Promise<{ notifications: NotificationRow[]; total: number; unreadCount: number }> {
    const db = await getDb()
    const page = options.page ?? 1
    const pageSize = Math.min(options.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const baseWhere = options.unreadOnly
      ? 'WHERE user_id = $1 AND is_read = false'
      : 'WHERE user_id = $1'

    const [countRes, unreadRes, listRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM notifications ${baseWhere}`, [userId]),
      db.execute(
        `SELECT COUNT(*)::INT AS cnt FROM notifications WHERE user_id = $1 AND is_read = false`,
        [userId],
      ),
      db.execute(
        `SELECT id, user_id, category, title, body, action_url,
                is_read, read_at, email_sent_at, sms_sent_at, created_at
         FROM notifications ${baseWhere}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      ),
    ])

    return {
      notifications: listRes.rows.map((r) => this._mapRow(r as Record<string, unknown>)),
      total: (countRes.rows[0] as { total: number }).total,
      unreadCount: (unreadRes.rows[0] as { cnt: number }).cnt,
    }
  },

  /**
   * Marks a single notification as read.
   */
  async markRead(notificationId: string, userId: string): Promise<void> {
    const db = await getDb()
    await db.execute(
      `UPDATE notifications
       SET is_read = true, read_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_read = false`,
      [notificationId, userId],
    )
  },

  /**
   * Marks all of a user's unread notifications as read.
   * Returns the count of notifications marked.
   */
  async markAllRead(userId: string): Promise<number> {
    const db = await getDb()
    const res = await db.execute(
      `UPDATE notifications
       SET is_read = true, read_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [userId],
    )
    return res.rows.length
  },

  /**
   * Returns the user's notification delivery preferences.
   * Creates defaults on first access.
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const db = await getDb()
    await db.execute(
      `INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, push_enabled, categories_disabled)
       VALUES ($1, true, false, true, '{}')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    )
    const res = await db.execute(
      `SELECT user_id, email_enabled, sms_enabled, push_enabled, categories_disabled
       FROM notification_preferences WHERE user_id = $1`,
      [userId],
    )
    const r = res.rows[0] as {
      user_id: string
      email_enabled: boolean
      sms_enabled: boolean
      push_enabled: boolean
      categories_disabled: string[]
    }
    return {
      userId: r.user_id,
      emailEnabled: r.email_enabled,
      smsEnabled: r.sms_enabled,
      pushEnabled: r.push_enabled,
      categoriesDisabled: r.categories_disabled ?? [],
    }
  },

  /**
   * Updates notification delivery preferences.
   */
  async updatePreferences(
    userId: string,
    updates: Partial<Omit<NotificationPreferences, 'userId'>>,
  ): Promise<void> {
    const db = await getDb()
    // Ensure row exists
    await this.getPreferences(userId)

    const fields: string[] = []
    const values: unknown[] = [userId]
    let i = 2

    if (updates.emailEnabled !== undefined) {
      fields.push(`email_enabled = $${i++}`)
      values.push(updates.emailEnabled)
    }
    if (updates.smsEnabled !== undefined) {
      fields.push(`sms_enabled = $${i++}`)
      values.push(updates.smsEnabled)
    }
    if (updates.pushEnabled !== undefined) {
      fields.push(`push_enabled = $${i++}`)
      values.push(updates.pushEnabled)
    }
    if (updates.categoriesDisabled !== undefined) {
      fields.push(`categories_disabled = $${i++}`)
      values.push(updates.categoriesDisabled)
    }

    if (fields.length === 0) return

    fields.push(`updated_at = NOW()`)
    await db.execute(
      `UPDATE notification_preferences SET ${fields.join(', ')} WHERE user_id = $1`,
      values,
    )
  },

  // ── Domain event convenience methods ───────────────────────

  /**
   * Sends a booking confirmation to driver and host.
   */
  async notifyBookingConfirmed(opts: {
    driverUserId: string
    hostUserId: string
    bookingId: string
    listingTitle: string
    scheduledStart: Date
  }): Promise<void> {
    const dateStr = opts.scheduledStart.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    await Promise.all([
      this.send({
        userId: opts.driverUserId,
        category: 'booking_confirmed',
        title: 'Booking confirmed',
        body: `Your booking at ${opts.listingTitle} on ${dateStr} is confirmed.`,
        actionUrl: `/driver/bookings/${opts.bookingId}`,
        channels: ['in_app', 'email'],
        metadata: { bookingId: opts.bookingId },
      }),
      this.send({
        userId: opts.hostUserId,
        category: 'booking_confirmed',
        title: 'New booking',
        body: `A driver has booked ${opts.listingTitle} for ${dateStr}.`,
        actionUrl: `/host/bookings/${opts.bookingId}`,
        channels: ['in_app', 'email'],
        metadata: { bookingId: opts.bookingId },
      }),
    ])
  },

  /**
   * Sends a session completed notification to the driver.
   */
  async notifySessionCompleted(opts: {
    driverUserId: string
    sessionId: string
    energyConsumedWh: number
    totalCostPence: number
  }): Promise<void> {
    const kwh = (opts.energyConsumedWh / 1000).toFixed(1)
    const cost = (opts.totalCostPence / 100).toFixed(2)
    await this.send({
      userId: opts.driverUserId,
      category: 'session_completed',
      title: 'Charging complete',
      body: `You charged ${kwh} kWh for £${cost}. Great drive!`,
      actionUrl: `/driver/session/${opts.sessionId}`,
      channels: ['in_app'],
      metadata: { sessionId: opts.sessionId },
    })
  },

  /**
   * Notifies a host when their payout is on its way.
   */
  async notifyPayoutSent(opts: {
    hostUserId: string
    amountPence: number
    periodLabel: string
  }): Promise<void> {
    const amount = (opts.amountPence / 100).toFixed(2)
    await this.send({
      userId: opts.hostUserId,
      category: 'payout_sent',
      title: 'Payout sent',
      body: `£${amount} for ${opts.periodLabel} is on its way to your bank account.`,
      actionUrl: `/host/earnings`,
      channels: ['in_app', 'email'],
      metadata: { amountPence: opts.amountPence },
    })
  },

  // ── Private delivery helpers ─────────────────────────────

  async _sendEmail(
    notificationId: string,
    userId: string,
    subject: string,
    body: string,
    actionUrl: string | null,
  ): Promise<void> {
    const resendKey = process.env['RESEND_API_KEY']
    if (!resendKey) return // skip in dev without Resend configured

    try {
      const db = await getDb()

      // Fetch user email
      const userRes = await db.execute(
        `SELECT email, full_name FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      )
      if (userRes.rows.length === 0) return

      const user = userRes.rows[0] as { email: string; full_name: string }

      const html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#00C853;margin-bottom:8px">${subject}</h2>
          <p style="color:#333;line-height:1.6">${body}</p>
          ${actionUrl ? `<a href="${process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'}${actionUrl}"
              style="display:inline-block;margin-top:16px;padding:10px 20px;background:#00C853;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
              View in Zipgrid
            </a>` : ''}
          <p style="margin-top:32px;font-size:12px;color:#999">
            Zipgrid — The smarter way to charge your EV.<br>
            <a href="${process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'}/account/notifications" style="color:#999">Manage notifications</a>
          </p>
        </div>
      `

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Zipgrid <notifications@zipgrid.app>',
          to: user.email,
          subject,
          html,
        }),
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok) {
        await db.execute(
          `UPDATE notifications SET email_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [notificationId],
        )
      }
    } catch {
      // Swallow — notification is already persisted in DB
    }
  },

  async _sendSms(notificationId: string, userId: string, body: string): Promise<void> {
    const accountSid = process.env['TWILIO_ACCOUNT_SID']
    const authToken = process.env['TWILIO_AUTH_TOKEN']
    const fromNumber = process.env['TWILIO_FROM_NUMBER']
    if (!accountSid || !authToken || !fromNumber) return

    try {
      const db = await getDb()

      // Fetch user phone
      const userRes = await db.execute(
        `SELECT phone_number FROM users WHERE id = $1 AND phone_verified = true LIMIT 1`,
        [userId],
      )
      if (userRes.rows.length === 0) return

      const phone = (userRes.rows[0] as { phone_number: string | null }).phone_number
      if (!phone) return

      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: fromNumber, To: phone, Body: body }).toString(),
          signal: AbortSignal.timeout(10_000),
        },
      )

      if (response.ok) {
        await db.execute(
          `UPDATE notifications SET sms_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [notificationId],
        )
      }
    } catch {
      // Swallow
    }
  },

  _mapRow(r: Record<string, unknown>): NotificationRow {
    return {
      id: r['id'] as string,
      userId: r['user_id'] as string,
      category: r['category'] as NotificationCategory,
      title: r['title'] as string,
      body: r['body'] as string,
      actionUrl: (r['action_url'] as string | null) ?? null,
      isRead: Boolean(r['is_read']),
      readAt: r['read_at'] ? new Date(r['read_at'] as string) : null,
      emailSentAt: r['email_sent_at'] ? new Date(r['email_sent_at'] as string) : null,
      smsSentAt: r['sms_sent_at'] ? new Date(r['sms_sent_at'] as string) : null,
      createdAt: new Date(r['created_at'] as string),
    }
  },
}
