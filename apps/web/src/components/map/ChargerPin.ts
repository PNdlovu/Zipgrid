/**
 * @file ChargerPin.ts
 * @description Mapbox GL JS GeoJSON source + layer helpers for charger map pins.
 * Call addChargerLayer(map) once on map load, then updateChargerLayer(map, listings)
 * whenever the listing data changes.
 *
 * Pin colours:
 *   #00C853 (green)  — instant book enabled
 *   #1A73E8 (blue)   — manual approve required
 *   #EF4444 (red)    — faulted / unavailable
 *
 * @module components/map
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

export type ChargerPinData = {
  id: string
  latitude: number
  longitude: number
  title: string
  maxPowerKw: number
  pricePerKwhPence: number | null
  instantBookEnabled: boolean
  averageRating: number | null
  status?: string  // 'active' | 'faulted' | 'unavailable'
}

type GeoJsonFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    id: string
    title: string
    powerKw: number
    price: number | null
    instantBook: boolean
    rating: number | null
    status: string
    pinColor: string
  }
}

function pinColor(listing: ChargerPinData): string {
  if (listing.status && listing.status !== 'active') return '#EF4444'
  return listing.instantBookEnabled ? '#00C853' : '#1A73E8'
}

/** Converts listing data to a GeoJSON FeatureCollection. */
export function listingsToGeoJson(listings: ChargerPinData[]): {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
} {
  return {
    type: 'FeatureCollection',
    features: listings.map((l): GeoJsonFeature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.longitude, l.latitude] },
      properties: {
        id: l.id,
        title: l.title,
        powerKw: l.maxPowerKw,
        price: l.pricePerKwhPence,
        instantBook: l.instantBookEnabled,
        rating: l.averageRating,
        status: l.status ?? 'active',
        pinColor: pinColor(l),
      },
    })),
  }
}

/**
 * Adds the charger source + cluster + pin layers to the map.
 * Call once inside the map 'load' event.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addChargerLayer(map: any): void {
  map.addSource('chargers', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  })

  // Cluster circle
  map.addLayer({
    id: 'charger-clusters',
    type: 'circle',
    source: 'chargers',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#00C853',
      'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  })

  // Cluster count label
  map.addLayer({
    id: 'charger-cluster-count',
    type: 'symbol',
    source: 'chargers',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12,
    },
    paint: { 'text-color': '#ffffff' },
  })

  // Individual pin
  map.addLayer({
    id: 'charger-pins',
    type: 'circle',
    source: 'chargers',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['get', 'pinColor'],
      'circle-radius': 10,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
    },
  })

  // Pointer cursor on hover
  map.on('mouseenter', 'charger-pins', () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', 'charger-pins', () => { map.getCanvas().style.cursor = '' })
  map.on('mouseenter', 'charger-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', 'charger-clusters', () => { map.getCanvas().style.cursor = '' })
}

/**
 * Updates the charger GeoJSON source with fresh listing data.
 * Safe to call repeatedly — does nothing if the source doesn't exist yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateChargerLayer(map: any, listings: ChargerPinData[]): void {
  const source = map.getSource?.('chargers')
  if (!source) return
  source.setData(listingsToGeoJson(listings))
}
