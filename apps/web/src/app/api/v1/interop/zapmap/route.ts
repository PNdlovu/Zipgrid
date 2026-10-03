/**
 * @file route.ts
 * @description GET /api/v1/interop/zapmap — Zap-Map data feed.
 * Returns Zipgrid listings in Zap-Map's POI data format for public charger overlay.
 * Zap-Map periodically calls this endpoint to sync Zipgrid chargers into their network.
 *
 * Also serves as the public charger overlay data source — includes Zap-Map OCPI
 * data if ZAPMAP_API_KEY is configured.
 *
 * @module apps/web/api/v1/interop/zapmap
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { distanceMetresSql, withinRadiusSql } from '@/lib/db/geo'

type ZapMapCharger = {
  id: string
  name: string
  latitude: number
  longitude: number
  chargerType: string
  connectors: string[]
  maxPowerKw: number
  status: string
  network: string
  address: string
  postcode: string
  isZipgrid: boolean
  bookingUrl: string | null
}

/** GET /api/v1/interop/zapmap — Zipgrid chargers + optional Zap-Map overlay. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat     = parseFloat(searchParams.get('lat') ?? '51.5')
  const lng     = parseFloat(searchParams.get('lng') ?? '-0.1')
  const radius  = Math.min(50000, parseInt(searchParams.get('radius') ?? '10000', 10)) // metres
  const includePublic = searchParams.get('includePublic') === 'true'

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'

    // Fetch Zipgrid chargers within radius
    const zipgridRes = await db.execute(
      `SELECT cl.id, cl.title, cl.latitude, cl.longitude,
              cl.charger_level, cl.plug_types, cl.max_power_kw,
              cl.status, cl.address_line1, cl.postal_code
       FROM charger_listings cl
       WHERE cl.status = 'active'
         AND ${withinRadiusSql('cl.latitude', 'cl.longitude', '$1', '$2', '$3')}
       ORDER BY ${distanceMetresSql('cl.latitude', 'cl.longitude', '$1', '$2')}
       LIMIT 200`,
      [lat, lng, radius],
    )

    const zipgridChargers: ZapMapCharger[] = (zipgridRes.rows as Record<string, unknown>[]).map((cl) => ({
      id:           `ZG-${String(cl['id'])}`,
      name:         String(cl['title']),
      latitude:     Number(cl['latitude']),
      longitude:    Number(cl['longitude']),
      chargerType:  String(cl['charger_level']).replace('_', ' '),
      connectors:   (cl['plug_types'] as string[] ?? []),
      maxPowerKw:   Number(cl['max_power_kw']),
      status:       'available',
      network:      'Zipgrid',
      address:      String(cl['address_line1']),
      postcode:     String(cl['postal_code']),
      isZipgrid:    true,
      bookingUrl:   `${appUrl}/listings/${String(cl['id'])}`,
    }))

    let publicChargers: ZapMapCharger[] = []

    // Optionally fetch public charger data from Zap-Map API
    if (includePublic) {
      const zapKey = process.env['ZAPMAP_API_KEY']
      if (zapKey) {
        try {
          const zapRes = await fetch(
            `https://api.zapmap.com/v2/chargepoints?lat=${lat}&lng=${lng}&radius=${radius / 1000}&limit=100`,
            {
              headers: { 'Authorization': `Bearer ${zapKey}` },
              signal: AbortSignal.timeout(5_000),
            },
          )
          if (zapRes.ok) {
            const zapData = await zapRes.json() as { chargepoints?: Record<string, unknown>[] }
            publicChargers = (zapData.chargepoints ?? []).map((cp) => ({
              id:          `ZM-${String(cp['id'] ?? '')}`,
              name:        String(cp['name'] ?? 'Public Charger'),
              latitude:    Number(cp['lat'] ?? 0),
              longitude:   Number(cp['lng'] ?? 0),
              chargerType: String(cp['charger_type'] ?? 'Level 2'),
              connectors:  (cp['connectors'] as string[] ?? []),
              maxPowerKw:  Number(cp['max_kw'] ?? 7),
              status:      String(cp['status'] ?? 'unknown'),
              network:     String(cp['network'] ?? 'Public'),
              address:     String(cp['address'] ?? ''),
              postcode:    String(cp['postcode'] ?? ''),
              isZipgrid:   false,
              bookingUrl:  null,
            }))
          }
        } catch { /* non-fatal */ }
      }
    }

    const all = [...zipgridChargers, ...publicChargers]
    return apiResponse({
      chargers: all,
      total: all.length,
      zipgridCount: zipgridChargers.length,
      publicCount: publicChargers.length,
      centre: { lat, lng },
      radiusMetres: radius,
    })
  } catch (err) {
    console.error('[interop/zapmap]', err)
    return apiError('INTERNAL_ERROR', 'Could not fetch charger data', 500)
  }
}
