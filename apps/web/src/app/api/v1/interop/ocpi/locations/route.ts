/**
 * @file route.ts
 * @description GET /api/v1/interop/ocpi/locations — OCPI 2.2.1 Locations module.
 * Returns Zipgrid charger listings as OCPI Location objects.
 * Used by partner networks (Zap-Map, roaming eMSPs) to discover Zipgrid chargers.
 *
 * OCPI Location object mapping:
 *   charger_listings.id          → location.id
 *   charger_listings.title       → location.name
 *   charger_listings.address_*   → location.address / location.city
 *   charger_listings.latitude/lng → location.coordinates
 *   charger_listings.plug_types  → evse.connectors[].standard
 *   charger_listings.max_power_kw → evse.connectors[].max_electric_power
 *
 * @module apps/web/api/v1/interop/ocpi/locations
 */

import { type NextRequest, NextResponse } from 'next/server'
import { verifyOcpiToken } from '@/lib/ocpi'

function mapPlugTypeToOcpi(plugType: string): string {
  const map: Record<string, string> = {
    CCS2: 'IEC_62196_T2_COMBO',
    CCS1: 'CHADEMO',     // approximate
    Type2: 'IEC_62196_T2',
    NACS: 'TESLA_S',
    CHAdeMO: 'CHADEMO',
    J1772: 'IEC_62196_T1',
    NEMA_14_50: 'NEMA_14_50',
    NEMA_5_15:  'NEMA_5_15',
  }
  return map[plugType] ?? 'UNKNOWN'
}

/** GET /api/v1/interop/ocpi/locations — paginated OCPI location list. */
export async function GET(request: NextRequest) {
  if (!(await verifyOcpiToken(request))) {
    return NextResponse.json({ data: null, status_code: 2001, status_message: 'Invalid or missing token', timestamp: new Date().toISOString() }, { status: 401 })
  }
  const { searchParams } = request.nextUrl
  const limit  = Math.min(100, parseInt(searchParams.get('limit') ?? '25', 10))
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const dateFrom = searchParams.get('date_from') // ISO 8601 last_updated filter

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const params: unknown[] = [limit, offset]
    let dateFilter = ''
    if (dateFrom) {
      params.push(dateFrom)
      dateFilter = `AND cl.updated_at >= $${params.length}`
    }

    const res = await db.execute(
      `SELECT
         cl.id, cl.title, cl.address_line1, cl.address_line2, cl.city,
         cl.state_province, cl.postal_code, cl.country_code,
         cl.latitude, cl.longitude,
         cl.max_power_kw, cl.plug_types, cl.charger_level,
         cl.status, cl.updated_at,
         cl.wifi_available, cl.restroom_available, cl.shelter_available
       FROM charger_listings cl
       WHERE cl.status = 'active' ${dateFilter}
       ORDER BY cl.updated_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    )

    type Row = Record<string, unknown>

    const locations = (res.rows as Row[]).map((cl) => ({
      id:           String(cl['id']),
      type:         'STATION',
      name:         String(cl['title']),
      address:      String(cl['address_line1']),
      city:         String(cl['city']),
      postal_code:  String(cl['postal_code']),
      country:      String(cl['country_code']),
      coordinates: {
        latitude:  String(cl['latitude']),
        longitude: String(cl['longitude']),
      },
      evses: [
        {
          uid:    `${cl['id']}-1`,
          evse_id: `ZG*UK*E${String(cl['id']).replace(/-/g, '').slice(0, 8).toUpperCase()}`,
          status: cl['status'] === 'active' ? 'AVAILABLE' : 'INOPERATIVE',
          connectors: (cl['plug_types'] as string[] ?? []).map((plug, i) => ({
            id:                    String(i + 1),
            standard:              mapPlugTypeToOcpi(plug),
            format:                'CABLE',
            power_type:            cl['charger_level'] === 'dc_fast' || cl['charger_level'] === 'dc_ultra_fast' ? 'DC' : 'AC_3_PHASE',
            max_voltage:           cl['charger_level'] === 'level_1' ? 120 : 230,
            max_amperage:          Math.round((Number(cl['max_power_kw']) * 1000) / 230),
            max_electric_power:    Math.round(Number(cl['max_power_kw']) * 1000),
            tariff_ids:            [`ZG-${String(cl['id']).slice(0, 8)}`],
            last_updated:          String(cl['updated_at']),
          })),
          last_updated: String(cl['updated_at']),
        },
      ],
      facilities: [
        ...(cl['wifi_available']     ? ['WIFI'] : []),
        ...(cl['restroom_available'] ? ['RESTROOM'] : []),
        ...(cl['shelter_available']  ? ['COVERED_PARKING'] : []),
      ],
      time_zone:    'Europe/London',
      last_updated: String(cl['updated_at']),
      operator: { name: 'Zipgrid' },
    }))

    return NextResponse.json({
      data: locations,
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'X-Total-Count': String(res.rows.length),
        'X-Limit': String(limit),
        'X-Offset': String(offset),
      },
    })
  } catch (err) {
    console.error('[ocpi/locations]', err)
    return NextResponse.json({ status_code: 3000, status_message: 'Server error', timestamp: new Date().toISOString() }, { status: 500 })
  }
}
