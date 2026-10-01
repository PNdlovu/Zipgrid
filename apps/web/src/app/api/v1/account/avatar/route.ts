/**
 * @file route.ts
 * @description POST /api/v1/account/avatar — upload a profile avatar.
 *
 * Accepts a multipart/form-data request with a single `file` field.
 * Stores the image in Cloudflare R2 (or falls back to a Vercel Blob URL in
 * development when R2 is not configured), then updates users.avatar_url.
 *
 * Constraints:
 *   - Max file size: 5 MB
 *   - Allowed MIME types: image/jpeg, image/png, image/webp, image/gif
 *   - File stored at: avatars/{userId}/{timestamp}.{ext}
 *   - Old avatar is NOT deleted (future: add cleanup cron)
 *
 * If neither R2 nor Vercel Blob is configured, returns the uploaded file as a
 * data URL so local development still works without external storage.
 *
 * @module apps/web/api/v1/account/avatar
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type AllowedMime = (typeof ALLOWED_TYPES)[number]

function ext(mime: AllowedMime): string {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'gif'
}

/**
 * Uploads a file to Cloudflare R2 via its S3-compatible REST API using
 * AWS Signature Version 4 — no SDK dependency required.
 *
 * Signs the request manually using the Web Crypto API (available in
 * Node 18+ and the Next.js Edge/Node runtimes).
 */
async function uploadToR2(
  key: string,
  buffer: Uint8Array,
  contentType: string,
): Promise<string> {
  const accountId       = process.env['R2_ACCOUNT_ID']!
  const accessKeyId     = process.env['R2_ACCESS_KEY_ID']!
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY']!
  const bucketName      = process.env['R2_BUCKET_NAME']!
  const publicUrl       = process.env['R2_PUBLIC_URL']!.replace(/\/$/, '')

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`
  const region   = 'auto'
  const service  = 's3'

  const now       = new Date()
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '')  // YYYYMMDD
  const amzDate   = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z' // YYYYMMDDTHHmmssZ

  // Hash the payload
  const payloadHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', buffer.buffer as ArrayBuffer)),
  ).map((b) => b.toString(16).padStart(2, '0')).join('')

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${accountId}.r2.cloudflarestorage.com\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'PUT',
    `/${bucketName}/${key}`,
    '',  // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const canonicalHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))),
  ).map((b) => b.toString(16).padStart(2, '0')).join('')

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalHash].join('\n')

  // Derive signing key
  async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
    const k = await crypto.subtle.importKey('raw', key instanceof Uint8Array ? key.buffer as ArrayBuffer : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))
  }

  const kDate    = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = Array.from(new Uint8Array(await hmac(kSigning, stringToSign)))
    .map((b) => b.toString(16).padStart(2, '0')).join('')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type':         contentType,
      'x-amz-date':           amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization':        authorization,
      'Cache-Control':        'public, max-age=31536000, immutable',
    },
    body: buffer.buffer as ArrayBuffer,
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`)
  }

  return `${publicUrl}/${key}`
}

/**
 * POST /api/v1/account/avatar
 * Accepts multipart/form-data with `file` field.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return apiError('INVALID_REQUEST', 'Request must be multipart/form-data', 400)
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return apiError('MISSING_FILE', 'No file provided — include a "file" field', 400)
  }

  if (file.size > MAX_SIZE_BYTES) {
    return apiError('FILE_TOO_LARGE', 'Image must be under 5 MB', 413)
  }

  const mimeType = file.type as AllowedMime
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return apiError(
      'INVALID_FILE_TYPE',
      'Only JPEG, PNG, WebP, and GIF images are allowed',
      415,
    )
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const timestamp = Date.now()
    const key = `avatars/${userId}/${timestamp}.${ext(mimeType)}`

    let avatarUrl: string

    if (process.env['R2_ACCOUNT_ID'] && process.env['R2_ACCESS_KEY_ID']) {
      // Production: upload to R2
      avatarUrl = await uploadToR2(key, buffer, mimeType)
    } else {
      // Dev fallback: store as data URL (no external deps required)
      const base64 = btoa(String.fromCharCode(...buffer))
      avatarUrl = `data:${mimeType};base64,${base64}`
    }

    // Persist to users table
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    await db.execute(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
      [avatarUrl, userId],
    )

    return apiResponse({ avatarUrl }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/account/avatar]', err)
    return apiError('INTERNAL_ERROR', 'Upload failed — please try again', 500)
  }
}
