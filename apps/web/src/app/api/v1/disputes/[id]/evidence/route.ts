/**
 * @file route.ts
 * @description POST /api/v1/disputes/[id]/evidence — upload evidence to a dispute.
 *              GET  /api/v1/disputes/[id]/evidence — list evidence files for a dispute.
 *
 * Evidence is uploaded to Vercel Blob (max 50 MB total per dispute, up to 10 files).
 * Both the driver and the host who are parties to the dispute may upload evidence.
 * Evidence is accepted during 'open', 'evidence_requested', or 'under_review' states.
 *
 * @module apps/web/api/v1/disputes/[id]/evidence
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const MAX_FILES = 10
const MAX_BYTES_TOTAL = 50 * 1024 * 1024  // 50 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'video/mp4', 'video/quicktime',
  'application/pdf',
])

type Params = { params: Promise<{ id: string }> }

async function resolveParty(disputeId: string, userId: string) {
  const { getDb } = await import('@/lib/db')
  const db = await getDb()

  const res = await db.execute(
    `SELECT d.id, d.status, d.raised_by_user_id, d.raised_against_user_id
     FROM disputes d
     WHERE d.id = $1 LIMIT 1`,
    [disputeId],
  )
  if (res.rows.length === 0) return { db, dispute: null, isParty: false }

  const dispute = res.rows[0] as {
    id: string
    status: string
    raised_by_user_id: string
    raised_against_user_id: string | null
  }

  const isParty = dispute.raised_by_user_id === userId ||
                  dispute.raised_against_user_id === userId

  return { db, dispute, isParty }
}

/** GET /api/v1/disputes/[id]/evidence */
export async function GET(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params

  try {
    const { db, dispute, isParty } = await resolveParty(id, userId)
    if (!dispute) return apiError('NOT_FOUND', 'Dispute not found', 404)

    // Admins can also view evidence
    const isAdmin = (request.headers.get('x-user-roles') ?? '').includes('admin')
    if (!isParty && !isAdmin) return apiError('FORBIDDEN', 'Not a party to this dispute', 403)

    const res = await db.execute(
      `SELECT id, file_url, file_name, file_type, file_size_bytes,
              uploaded_by_user_id, created_at
       FROM dispute_evidence
       WHERE dispute_id = $1
       ORDER BY created_at ASC`,
      [id],
    )

    return apiResponse(
      res.rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          id:             row['id'],
          fileUrl:        row['file_url'],
          fileName:       row['file_name'],
          fileType:       row['file_type'],
          fileSizeBytes:  Number(row['file_size_bytes']),
          uploadedByUserId: row['uploaded_by_user_id'],
          createdAt:      row['created_at'],
        }
      }),
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** POST /api/v1/disputes/[id]/evidence */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params

  try {
    const { db, dispute, isParty } = await resolveParty(id, userId)
    if (!dispute) return apiError('NOT_FOUND', 'Dispute not found', 404)
    if (!isParty) return apiError('FORBIDDEN', 'Not a party to this dispute', 403)

    const acceptedStatuses = ['open', 'evidence_requested', 'under_review']
    if (!acceptedStatuses.includes(dispute.status)) {
      return apiError(
        'DISPUTE_CLOSED',
        `Evidence cannot be submitted — dispute is ${dispute.status}.`,
        409,
      )
    }

    // Check existing file count and total size
    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS cnt,
              COALESCE(SUM(file_size_bytes), 0)::BIGINT AS total_bytes
       FROM dispute_evidence WHERE dispute_id = $1`,
      [id],
    )
    const { cnt, total_bytes } = countRes.rows[0] as { cnt: number; total_bytes: number }

    if (cnt >= MAX_FILES) {
      return apiError('LIMIT_REACHED', `Maximum ${MAX_FILES} files per dispute.`, 400)
    }
    if (Number(total_bytes) >= MAX_BYTES_TOTAL) {
      return apiError('SIZE_LIMIT', 'Maximum 50 MB of evidence per dispute.', 400)
    }

    // Parse multipart form
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return apiError('INVALID_FORM', 'Expected multipart/form-data', 400)
    }

    const file = formData.get('file') as File | null
    if (!file || !(file instanceof File)) {
      return apiError('MISSING_FILE', "Form field 'file' is required", 400)
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return apiError('INVALID_TYPE', 'Allowed types: JPEG, PNG, WebP, HEIC, MP4, MOV, PDF', 400)
    }
    if (Number(total_bytes) + file.size > MAX_BYTES_TOTAL) {
      return apiError(
        'SIZE_LIMIT',
        `This file would exceed the 50 MB limit. Current usage: ${Math.round(Number(total_bytes) / 1024 / 1024)}MB.`,
        400,
      )
    }

    // Upload to Vercel Blob (or dev placeholder)
    const blobToken = process.env['BLOB_READ_WRITE_TOKEN']
    const ext = file.name.split('.').pop() ?? 'bin'
    const pathname = `disputes/${id}/${uuidv4()}.${ext}`

    let fileUrl: string
    if (!blobToken) {
      // Dev: use placeholder URL
      fileUrl = `https://dev-placeholder.zipgrid.internal/${pathname}`
    } else {
      const blobRes = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${blobToken}`,
          'x-content-type': file.type,
        },
        body: file.stream(),
      })
      if (!blobRes.ok) {
        return apiError('UPLOAD_FAILED', 'File upload failed. Please try again.', 502)
      }
      const blobData = (await blobRes.json()) as { url: string }
      fileUrl = blobData.url
    }

    // Insert record
    const evidenceId = uuidv4()
    await db.execute(
      `INSERT INTO dispute_evidence
         (id, dispute_id, file_url, file_name, file_type, file_size_bytes,
          uploaded_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [evidenceId, id, fileUrl, file.name, file.type, file.size, userId],
    )

    // Mark dispute as 'evidence_received' if still 'open'
    if (dispute.status === 'open') {
      await db.execute(
        `UPDATE disputes SET status = 'evidence_received', updated_at = NOW() WHERE id = $1`,
        [id],
      )
    }

    return apiResponse(
      { evidenceId, fileUrl, fileName: file.name, fileSizeBytes: file.size },
      undefined,
      201,
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/disputes/[id]/evidence]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
