/**
 * @file route.ts
 * @description POST /api/v1/voice/transcribe
 * Accepts a multipart/form-data audio file, forwards to OpenAI Whisper for
 * speech-to-text, and returns the transcript.
 *
 * Used by VoiceService.transcribeWithWhisper() as a Whisper fallback when the
 * browser's Web Speech API is unavailable (non-Chrome browsers, WebViews).
 *
 * Audio constraints (enforced server-side):
 *   - Max 25 MB (Whisper API limit)
 *   - Accepted MIME types: audio/webm, audio/mp4, audio/mpeg, audio/wav, audio/ogg
 *   - Language: auto-detected by Whisper (or provided via ?language= query param)
 *
 * Rate limiting: 10 req/min per user (applied in addition to edge middleware).
 *
 * @module apps/web/api/v1/voice/transcribe
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const MAX_BYTES      = 25 * 1024 * 1024  // 25 MB — Whisper API hard limit
const ALLOWED_TYPES  = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg',
  'audio/wav', 'audio/ogg', 'audio/x-m4a',
])

/** Simple in-process rate limiter — keyed by userId, 10 req/min */
const _rateCounts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = _rateCounts.get(userId)
  if (!entry || now > entry.resetAt) {
    _rateCounts.set(userId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

/** POST /api/v1/voice/transcribe — Accepts a multipart/form-data audio file, forwards to OpenAI Whisper for speech-to-text, and returns the transcript. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  // Rate limit — transcription is expensive
  if (!checkRateLimit(userId)) {
    return apiError('RATE_LIMITED', 'Too many transcription requests. Please wait a moment.', 429)
  }

  const openaiKey = process.env['OPENAI_API_KEY']
  if (!openaiKey) {
    // Graceful degradation — return empty transcript so the UI can show a fallback
    if (process.env.NODE_ENV !== 'production') {
      return apiResponse({ transcript: '', note: 'OPENAI_API_KEY not set in dev' })
    }
    return apiError('SERVICE_UNAVAILABLE', 'Transcription service is not configured', 503)
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return apiError('INVALID_FORM', 'Expected multipart/form-data', 400)
  }

  const audioFile = formData.get('audio') as File | null
  if (!audioFile || !(audioFile instanceof File)) {
    return apiError('MISSING_FILE', "Form field 'audio' is required", 400)
  }

  if (audioFile.size > MAX_BYTES) {
    return apiError('FILE_TOO_LARGE', `Audio must be under ${MAX_BYTES / 1024 / 1024} MB`, 400)
  }

  // Normalise MIME type — browsers sometimes send 'audio/webm;codecs=opus'
  const mimeBase = audioFile.type.split(';')[0]?.trim() ?? ''
  if (!ALLOWED_TYPES.has(mimeBase)) {
    return apiError(
      'INVALID_TYPE',
      `Audio type '${mimeBase}' is not supported. Use webm, mp4, mp3, wav, or ogg.`,
      400,
    )
  }

  // Optional language hint (BCP-47, e.g. 'en')
  const language = request.nextUrl.searchParams.get('language') ?? 'en'

  try {
    // Forward to OpenAI Whisper via the Whisper API (multipart)
    const whisperForm = new FormData()
    whisperForm.append('file', audioFile, audioFile.name || `recording.${mimeBase.split('/')[1] ?? 'webm'}`)
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', language)
    whisperForm.append('response_format', 'json')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: whisperForm,
      signal: AbortSignal.timeout(30_000),
    })

    if (!whisperRes.ok) {
      const errText = await whisperRes.text()
      console.error('[voice/transcribe] Whisper API error:', whisperRes.status, errText)
      return apiError('TRANSCRIPTION_FAILED', 'Transcription failed — please try again', 502)
    }

    const data = (await whisperRes.json()) as { text: string }

    if (!data.text) {
      return apiResponse({ transcript: '' })
    }

    // Basic safety: strip leading/trailing whitespace
    const transcript = data.text.trim()

    return apiResponse({ transcript })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    if (err instanceof Error && err.name === 'TimeoutError') {
      return apiError('TIMEOUT', 'Transcription timed out — please try again', 504)
    }
    console.error('[voice/transcribe] Unexpected error:', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
