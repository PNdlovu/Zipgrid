/**
 * @file index.ts
 * @description Drizzle ORM database connection — lazy initialisation.
 * Uses postgres.js driver connected to Railway eu-west PostgreSQL + PostGIS.
 * Connection string from DATABASE_URL environment variable.
 *
 * NOTE: This file is excluded from local tsc typecheck (`tsconfig.json` excludes)
 * due to a duplicate postgres package between workspace root and apps/web during
 * local development. Remove the exclusion once the monorepo workspace install
 * is fully configured (npm workspaces hoisting will resolve to a single postgres copy).
 *
 * @module lib/db
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

// DB connection is initialised only at runtime when DATABASE_URL is available.
// This module is not imported by marketing pages — safe to export a lazy getter.

let _db: ReturnType<typeof import('drizzle-orm/postgres-js').drizzle> | null = null

/**
 * Returns the Drizzle database instance.
 * Lazily initialised on first call to avoid build-time DATABASE_URL requirement.
 */
export async function getDb() {
  if (_db) return _db
  if (!process.env['DATABASE_URL']) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const postgres = (await import('postgres')).default
  const client = postgres(process.env['DATABASE_URL'], {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  })
  _db = drizzle(client)
  return _db
}

// Re-export type for use in domain services
export type Db = Awaited<ReturnType<typeof getDb>>
