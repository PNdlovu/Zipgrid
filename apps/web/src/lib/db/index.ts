/**
 * @file index.ts
 * @description PostgreSQL access — lazily initialised postgres.js pool exposing a
 * minimal parameterised `execute` API plus `transaction` for atomic work.
 * Lazy init avoids a build-time DATABASE_URL requirement.
 *
 * Connection options come from the URL (e.g. `?sslmode=require` for Railway's
 * public proxy; the private network needs no TLS). Pool size: DATABASE_POOL_MAX.
 *
 * @module lib/db
 */

import type postgres from 'postgres'

export type QueryResult = { rows: Record<string, unknown>[] }

/** Executes parameterised SQL ($1, $2 …). Values are never interpolated. */
export type Execute = (query: string, params?: unknown[]) => Promise<QueryResult>

export type Db = { execute: Execute }

let client: postgres.Sql | null = null

async function getClient(): Promise<postgres.Sql> {
  if (client) return client
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is required')

  const { default: createClient } = await import('postgres')
  client = createClient(url, {
    max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
    idle_timeout: 30,
    connect_timeout: 15,
    onnotice: () => {},
  })
  return client
}

function wrap(sql: postgres.Sql | postgres.TransactionSql): Execute {
  return async (query, params = []) => {
    const rows = await sql.unsafe(query, params as postgres.ParameterOrJSON<never>[])
    return { rows: rows as unknown as Record<string, unknown>[] }
  }
}

/**
 * Returns a handle for single-statement queries (autocommit).
 * @example
 *   const db = await getDb()
 *   const { rows } = await db.execute('SELECT id FROM users WHERE email = $1', [email])
 */
export async function getDb(): Promise<Db> {
  return { execute: wrap(await getClient()) }
}

/**
 * Runs `fn` inside a single transaction. Commits when `fn` resolves, rolls back
 * when it throws (the error is re-thrown).
 */
export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const sql = await getClient()
  return sql.begin((tx) => fn({ execute: wrap(tx) })) as Promise<T>
}

/** Lightweight connectivity probe used by the health endpoint. */
export async function pingDb(): Promise<boolean> {
  try {
    await (await getClient())`SELECT 1`
    return true
  } catch {
    return false
  }
}
