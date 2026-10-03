/**
 * @file geo.ts
 * @description SQL fragments for proximity search on plain lat/lng NUMERIC
 * columns (no PostGIS). A bounding-box predicate lets Postgres use the
 * (latitude, longitude) B-tree index; the haversine expression then gives the
 * exact great-circle distance in metres.
 *
 * Arguments are SQL expressions — pass column names and `$n` placeholders,
 * never user input.
 *
 * @module lib/db
 */

const EARTH_RADIUS_M = 6_371_000
const METRES_PER_DEGREE_LAT = 111_320

/** Great-circle distance in metres between a row's coordinates and a point. */
export function distanceMetresSql(latCol: string, lngCol: string, latParam: string, lngParam: string): string {
  const lat1 = `radians(${latParam}::float8)`
  const lat2 = `radians(${latCol}::float8)`
  const dLat = `radians(${latCol}::float8 - ${latParam}::float8)`
  const dLng = `radians(${lngCol}::float8 - ${lngParam}::float8)`
  return `(${2 * EARTH_RADIUS_M} * asin(least(1, sqrt(
      power(sin(${dLat} / 2), 2)
      + cos(${lat1}) * cos(${lat2}) * power(sin(${dLng} / 2), 2)
    ))))`
}

/** True when the row lies within `radiusParam` metres of the point. */
export function withinRadiusSql(
  latCol: string,
  lngCol: string,
  latParam: string,
  lngParam: string,
  radiusParam: string,
): string {
  const dLat = `(${radiusParam}::float8 / ${METRES_PER_DEGREE_LAT})`
  const dLng = `(${radiusParam}::float8 / (${METRES_PER_DEGREE_LAT} * greatest(cos(radians(${latParam}::float8)), 0.01)))`
  return `(${latCol} BETWEEN ${latParam}::float8 - ${dLat} AND ${latParam}::float8 + ${dLat}
      AND ${lngCol} BETWEEN ${lngParam}::float8 - ${dLng} AND ${lngParam}::float8 + ${dLng}
      AND ${distanceMetresSql(latCol, lngCol, latParam, lngParam)} <= ${radiusParam}::float8)`
}
