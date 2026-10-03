/**
 * In-memory Postgres (PGlite) exposing the same API as src/lib/db, with every
 * migration and seed applied. Integration tests mock '@/lib/db' with this so the
 * real domain services and SQL run against the real schema.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import type { Db, Execute } from '@/lib/db'

const ROOT = join(__dirname, '..', '..', '..', '..')

export const pg = new PGlite({ extensions: { citext, pgcrypto } })

let ready: Promise<void> | null = null

/** Applies db/migrations then db/seeds, once per test file. */
export function setupDatabase(): Promise<void> {
  ready ??= (async () => {
    for (const dir of ['db/migrations', 'db/seeds']) {
      const abs = join(ROOT, dir)
      for (const f of readdirSync(abs).filter((n) => n.endsWith('.sql')).sort()) {
        await pg.exec(readFileSync(join(abs, f), 'utf8'))
      }
    }
  })()
  return ready
}

export function wrap(q: PGlite | Transaction): Execute {
  return async (query, params = []) => ({ rows: (await q.query<Record<string, unknown>>(query, params)).rows })
}

export const dbModule = {
  getDb: async (): Promise<Db> => ({ execute: wrap(pg) }),
  transaction: <T>(fn: (tx: Db) => Promise<T>): Promise<T> => pg.transaction((tx) => fn({ execute: wrap(tx) })),
  pingDb: async () => true,
}
