/**
 * @file db.ts
 * @description Lightweight postgres.js connection for the OCPP service.
 * The OCPP service writes session state directly to the same Railway DB.
 * Uses postgres.js (already in package.json) without the full ORM layer.
 *
 * @module apps/ocpp-service/handlers
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import postgres from 'postgres'

type QueryResult = { rows: Record<string, unknown>[] }

let _client: ReturnType<typeof postgres> | null = null

function getClient(): ReturnType<typeof postgres> {
  if (_client) return _client
  const url = process.env['DATABASE_URL']
  if (!url) {
    throw new Error('DATABASE_URL is required for OCPP service DB access')
  }
  _client = postgres(url, { max: 5, idle_timeout: 30 })
  return _client
}

/**
 * Executes a parameterised SQL query.
 * @param query - SQL with $1, $2 ... placeholders
 * @param params - Values (never interpolated)
 */
export async function getDb(): Promise<{
  execute(query: string, params?: unknown[]): Promise<QueryResult>
}> {
  const sql = getClient()
  return {
    async execute(query: string, params: unknown[] = []): Promise<QueryResult> {
      const result = await sql.unsafe(query, params as never[])
      return { rows: result as unknown as Record<string, unknown>[] }
    },
  }
}
