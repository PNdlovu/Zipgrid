/**
 * @file email.ts
 * @description Transactional email via Resend. When RESEND_API_KEY is not set:
 *   - development: the message (including codes/links) is logged for testing
 *   - production:  a warning is logged WITHOUT the message body (it may hold
 *                  secrets) and sendEmail resolves to false
 *
 * @module lib/email
 */

export type EmailMessage = {
  to: string
  subject: string
  html: string
  /** Plain-text version; also what is logged in development. */
  text: string
}

/** True when RESEND_API_KEY is set. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env['RESEND_API_KEY'])
}

/** Sends an email. Resolves true when accepted by the provider. Never throws. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const key = process.env['RESEND_API_KEY']
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[email] RESEND_API_KEY not set — "${message.subject}" to ${message.to} was not sent`)
    } else {
      console.warn(`[email:dev] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`)
    }
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env['EMAIL_FROM'] ?? 'Zipgrid <noreply@zipgrid.co.uk>',
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) console.error(`[email] Resend responded ${res.status} for "${message.subject}"`)
    return res.ok
  } catch (err) {
    console.error('[email] send failed', err)
    return false
  }
}

/** Escapes text for safe interpolation into HTML email bodies. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
