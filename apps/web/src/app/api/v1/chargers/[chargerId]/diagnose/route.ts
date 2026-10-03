/**
 * @file route.ts
 * @description POST /api/v1/chargers/[chargerId]/diagnose
 *
 * Triggers the AI fault diagnosis workflow for a charger.
 * Steps:
 *   1. Fetch the last 20 OCPP events and status for the charger from the DB.
 *   2. Forward to the AI service fault_diagnosis workflow (ai-service).
 *   3. Persist the result as a maintenance log entry for the host to review.
 *   4. Return the diagnosis summary and recommended actions.
 *
 * If the AI service is unavailable the endpoint returns a deterministic
 * rule-based assessment from the error codes so the host always gets
 * actionable information.
 *
 * @module apps/web/api/v1/chargers/[chargerId]/diagnose
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ chargerId: string }> }

/* ── OCPP error code → human-readable advice map ─────────────── */
const OCPP_ADVICE: Record<string, string> = {
  ConnectorLockFailure: 'Check the connector locking mechanism — it may be jammed or worn.',
  EVCommunicationError: 'Communication with the vehicle failed. Ask the driver to re-seat the cable.',
  GroundFailure: 'Earth fault detected. Do not use the charger. Contact a qualified electrician immediately.',
  HighTemperature: 'Charger is overheating. Ensure ventilation is unobstructed. Allow 30 minutes to cool.',
  InternalError: 'Internal charger error. Try a soft restart first. If it persists, contact the manufacturer.',
  LocalListConflict: 'Local whitelist conflict. Clear the local list via a firmware update.',
  NoError: 'No fault code reported. The charger appears healthy.',
  OtherError: 'Unspecified error. Try a soft restart and monitor for recurrence.',
  OverCurrentFailure: 'Overcurrent detected. Check your building fuse and cable rating.',
  OverVoltage: 'Overvoltage on the supply. Contact your network operator.',
  PowerMeterFailure: 'Internal power meter fault. Contact the manufacturer for calibration or replacement.',
  PowerSwitchFailure: 'Power switch fault. Charger cannot start sessions. Contact the manufacturer.',
  ReaderFailure: 'RFID reader fault. RFID auth will be unavailable — app-based auth still works.',
  ResetFailure: 'Reset failed. Try power-cycling the charger at the breaker.',
  UnderVoltage: 'Supply voltage too low. Check your electrical installation.',
  WeakSignal: 'Poor connectivity signal. Move the charger closer to the router or use a network extender.',
}

function getAdviceForErrors(errorCodes: string[]): string {
  const relevant = errorCodes.filter((c) => c && c !== 'NoError')
  if (relevant.length === 0) return OCPP_ADVICE['NoError']!
  return relevant
    .map((code) => OCPP_ADVICE[code] ?? `Unknown error code: ${code}. Contact the manufacturer.`)
    .join(' ')
}

/**
 * POST /api/v1/chargers/[chargerId]/diagnose
 * Returns a diagnosis summary with recommended actions.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership
    const deviceRes = await db.execute(
      `SELECT cd.id, cd.charge_point_id, cd.brand, cd.model,
              cd.current_status, cd.error_code, cd.health_score, cd.firmware_version
       FROM charger_devices cd
       JOIN host_profiles hp ON hp.id = cd.host_profile_id
       WHERE cd.id = $1 AND hp.user_id = $2
       LIMIT 1`,
      [chargerId, userId],
    )
    if (deviceRes.rows.length === 0) {
      return apiError('NOT_FOUND', 'Charger not found', 404)
    }

    const device = deviceRes.rows[0] as {
      id: string
      charge_point_id: string
      brand: string
      model: string
      current_status: string | null
      error_code: string | null
      health_score: number | null
      firmware_version: string | null
    }

    // Fetch last 20 OCPP events for context
    const eventsRes = await db.execute(
      `SELECT event_type AS action, payload, timestamp AS created_at
       FROM ocpp_event_log
       WHERE charge_point_id = $1
       ORDER BY timestamp DESC
       LIMIT 20`,
      [device.charge_point_id],
    )

    const recentEvents = eventsRes.rows.map((r) => {
      const row = r as Record<string, unknown>
      return {
        action: row['action'] as string,
        payload: row['payload'],
        createdAt: row['created_at'] as string,
      }
    })

    // Collect all error codes from recent events
    const errorCodesFromEvents: string[] = recentEvents
      .filter((e) => e.action === 'StatusNotification')
      .map((e) => {
        const p = e.payload as Record<string, unknown> | null
        return (p?.['errorCode'] as string | undefined) ?? 'NoError'
      })
      .filter((c) => c !== 'NoError')

    // Add current device error code if present
    if (device.error_code && device.error_code !== 'NoError') {
      errorCodesFromEvents.unshift(device.error_code)
    }

    const uniqueErrors = [...new Set(errorCodesFromEvents)]

    // ── Attempt AI service diagnosis ──────────────────────────────────
    let summary = ''
    let recommendedActions: string[] = []
    let aiUsed = false

    const aiServiceUrl = process.env['AI_SERVICE_URL']
    if (aiServiceUrl) {
      try {
        const aiRes = await fetch(`${aiServiceUrl}/workflows/fault-diagnosis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env['AI_SERVICE_SECRET'] ?? ''}`,
          },
          body: JSON.stringify({
            chargePointId: device.charge_point_id,
            brand: device.brand,
            model: device.model,
            currentStatus: device.current_status,
            errorCodes: uniqueErrors,
            recentEvents,
            firmwareVersion: device.firmware_version,
          }),
          signal: AbortSignal.timeout(15_000),
        })

        if (aiRes.ok) {
          const aiData = await aiRes.json() as {
            summary?: string
            recommendedActions?: string[]
          }
          if (aiData.summary) {
            summary = aiData.summary
            recommendedActions = aiData.recommendedActions ?? []
            aiUsed = true
          }
        }
      } catch {
        // AI service unavailable — fall through to rule-based assessment
      }
    }

    // ── Rule-based fallback ────────────────────────────────────────────
    if (!aiUsed) {
      const advice = getAdviceForErrors(uniqueErrors)
      const healthScore = device.health_score ?? 85
      const statusLabel = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical'

      summary = uniqueErrors.length === 0
        ? `No active faults detected. Charger is operating normally (health score: ${healthScore}/100).`
        : `${uniqueErrors.length} fault code${uniqueErrors.length > 1 ? 's' : ''} detected: ${uniqueErrors.join(', ')}. Overall health: ${statusLabel} (${healthScore}/100).`

      recommendedActions = uniqueErrors.length === 0
        ? ['No immediate action required. Monitor for recurring faults.']
        : advice.split('. ').filter(Boolean).map((s) => s + (s.endsWith('.') ? '' : '.'))
    }

    // ── Persist diagnosis as a maintenance log entry ───────────────────
    const noteText = `[Auto-diagnosis] ${summary} Actions: ${recommendedActions.join(' ')}`
    try {
      await db.execute(
        `INSERT INTO charger_maintenance_log
           (id, charger_device_id, note, type, created_by_user_id, created_at)
         VALUES ($1, $2, $3, 'inspection', $4, NOW())`,
        [uuidv4(), chargerId, noteText.slice(0, 1000), userId],
      )
    } catch {
      // Non-fatal — diagnosis is still returned even if log write fails
    }

    return apiResponse({
      summary,
      recommendedActions,
      errorCodes: uniqueErrors,
      healthScore: device.health_score ?? 85,
      aiUsed,
      diagnosedAt: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/chargers/[id]/diagnose]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
