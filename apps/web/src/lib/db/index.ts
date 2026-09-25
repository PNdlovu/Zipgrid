/**
 * @file index.ts
 * @description Drizzle ORM database connection — lazy initialisation.
 * Exports a typed `query` helper that wraps postgres.js for raw SQL execution.
 * Lazy init avoids build-time DATABASE_URL requirement on marketing/auth pages.
 *
 * NOTE: Excluded from local tsc typecheck (tsconfig.json) due to duplicate
 * postgres package between workspace root and apps/web during local dev.
 * Remove exclusion once monorepo workspace hoisting resolves a single copy.
 *
 * @module lib/db
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryResult = { rows: Record<string, unknown>[] }

let _sql: ((query: string, params?: unknown[]) => Promise<QueryResult>) | null = null

async function getSql(): Promise<(query: string, params?: unknown[]) => Promise<QueryResult>> {
  if (_sql) return _sql
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL environment variable is required')

  const postgres = (await import('postgres')).default
  const client = postgres(process.env['DATABASE_URL'], { max: 10, idle_timeout: 30 })

  _sql = async (query: string, params: unknown[] = []) => {
    // postgres.js uses tagged template literals; we bridge via unsafe()
    const result = await client.unsafe(query, params as never[])
    return { rows: result as unknown as Record<string, unknown>[] }
  }
  return _sql
}

/**
 * Executes a parameterised SQL query.
 * @param query - SQL string with $1, $2 ... placeholders
 * @param params - Parameter values (never interpolated into query string)
 * @returns Result rows as plain objects
 * @example
 *   const db = await getDb()
 *   const { rows } = await db.execute('SELECT id FROM users WHERE email = $1', [email])
 */
export async function getDb() {
  const execute = await getSql()
  return { execute }
}

export type Db = Awaited<ReturnType<typeof getDb>>
