/**
 * @file route.ts
 * @description OCPI 2.2.1 versions endpoint — starting point for OCPI roaming.
 * Exposes the Zipgrid OCPI interface for roaming with other CPO/eMSP networks.
 *
 * OCPI 2.2.1 module endpoints implemented:
 *   /api/v1/interop/ocpi/versions  — version discovery
 *   /api/v1/interop/ocpi/2.2.1     — module list
 *   /api/v1/interop/ocpi/locations — Zipgrid listings as OCPI Location objects
 *   /api/v1/interop/ocpi/sessions  — OCPI session records
 *   /api/v1/interop/ocpi/cdrs      — Charge Detail Records
 *   /api/v1/interop/ocpi/tariffs   — pricing information
 *   /api/v1/interop/ocpi/tokens    — driver token management
 *
 * Authentication: OCPI Token (Bearer in Authorization header).
 * Each partner gets a unique OCPI token stored in ocpi_partners table.
 *
 * @module apps/web/api/v1/interop/ocpi
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const OCPI_VERSION = '2.2.1'
const BASE_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'

/** Standard OCPI response wrapper. */
function ocpiResponse(data: unknown, statusCode = 1000, statusMessage = 'Success') {
  return NextResponse.json({
    data,
    status_code: statusCode,
    status_message: statusMessage,
    timestamp: new Date().toISOString(),
  })
}

/** GET /api/v1/interop/ocpi — OCPI versions endpoint. */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Versions endpoint
  if (path.endsWith('/ocpi') || path.endsWith('/ocpi/versions')) {
    return ocpiResponse([
      {
        version: OCPI_VERSION,
        url: `${BASE_URL}/api/v1/interop/ocpi/2.2.1`,
      },
    ])
  }

  return NextResponse.json({ status_code: 2000, status_message: 'Not found', timestamp: new Date().toISOString() }, { status: 404 })
}
