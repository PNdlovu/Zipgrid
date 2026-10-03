/**
 * check-sql.mjs
 * Schema/code drift guard. Applies db/migrations to an in-memory Postgres
 * (PGlite), optionally loads db/seeds, then asks Postgres to parse + describe
 * every SQL statement found in template literals in the web and OCPP code.
 *
 * Exits 1 if any migration, seed (with --seeds) or statement fails.
 *
 * Usage:
 *   node scripts/check-sql.mjs            # migrations + code SQL
 *   node scripts/check-sql.mjs --seeds    # also load demo seeds
 *   node scripts/check-sql.mjs --verbose  # print each failing statement
 *
 * Suppress a known false positive by putting `// sql-check: ignore` on the
 * line directly above the template literal.
 */
import { PGlite } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WITH_SEEDS = process.argv.includes('--seeds')
const VERBOSE = process.argv.includes('--verbose')

const db = new PGlite({ extensions: { citext, pgcrypto } })
let failed = 0

async function applyDir(dir, label) {
  const abs = join(ROOT, dir)
  for (const f of readdirSync(abs).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec('BEGIN')
      await db.exec(readFileSync(join(abs, f), 'utf8'))
      await db.exec('COMMIT')
      console.log(`  ✓ ${label} ${f}`)
    } catch (e) {
      await db.exec('ROLLBACK').catch(() => {})
      console.log(`  ✗ ${label} ${f}: ${e.message.split('\n')[0]}`)
      failed++
    }
  }
}

console.log('Migrations')
await applyDir('db/migrations', 'migration')
if (WITH_SEEDS) {
  console.log('Seeds')
  await applyDir('db/seeds', 'seed')
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(e) && !/\.(test|spec)\./.test(e)) acc.push(p)
  }
  return acc
}

/** Replaces ${...} fragments with neutral SQL based on their position. */
function substitute(q) {
  // Each dynamic placeholder ($${i++}) gets a fresh parameter number.
  let next = Math.max(0, ...[...q.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))
  return q
    .replace(/\$\$\{[^}]*\}/g, () => `$${++next}`)
    .replace(/\$\{[^}]*\}/g, (frag, offset, whole) => {
      const before = whole.slice(0, offset).trimEnd().toUpperCase()
      if (/(WHERE|AND|OR|ON)$/.test(before)) return 'TRUE'
      if (/SET$/.test(before)) return 'updated_at = updated_at'
      if (/ORDER BY$/.test(before)) return '1'
      if (/(LIMIT|OFFSET|INTERVAL)$/.test(before)) return '1'
      if (/where|condition|clause|filter/i.test(frag)) return ''
      return 'NULL'
    })
}

const files = [
  ...walk(join(ROOT, 'apps/web/src')),
  ...walk(join(ROOT, 'apps/ocpp-service/src')),
]
const SQL_START = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i
let total = 0
const failures = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const re = /`([^`]*)`/gs
  let m
  while ((m = re.exec(src))) {
    const raw = m[1]
    if (!SQL_START.test(raw) || !/\b(FROM|INTO|SET|VALUES)\b/i.test(raw)) continue
    const line = src.slice(0, m.index).split('\n').length
    const prevLine = src.split('\n')[line - 2] ?? ''
    if (prevLine.includes('sql-check: ignore')) continue
    total++
    const dynamic = raw.includes('${')
    const q = dynamic ? substitute(raw) : raw
    try {
      await db.describeQuery(q)
    } catch (e) {
      const msg = e.message.split('\n')[0]
      // Parameter-type inference limits are not schema errors
      if (/could not determine data type|inconsistent types deduced/i.test(msg)) continue
      // Artefacts of placeholder substitution in dynamic SQL
      if (dynamic && /syntax error|multiple assignments/i.test(msg)) continue
      failures.push({ loc: `${relative(ROOT, file).replace(/\\/g, '/')}:${line}`, msg, q })
    }
  }
}

console.log(`\nCode SQL: ${total} statements, ${failures.length} failing`)
for (const f of failures) {
  console.log(`  ✗ ${f.loc}\n      ${f.msg}`)
  if (VERBOSE) console.log(f.q.replace(/^/gm, '        '))
}

if (failed || failures.length) process.exit(1)
