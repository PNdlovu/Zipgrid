/**
 * run-migrations.mjs
 * Applies all db/migrations/*.sql files to the target database in order.
 * Each migration runs in its own transaction so a failure doesn't poison later ones.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/run-migrations.mjs
 *   DATABASE_URL="postgresql://..." node scripts/run-migrations.mjs --reset
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const __dir = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dir, '..', 'db', 'migrations')
const RESET = process.argv.includes('--reset')

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL is required'); process.exit(1) }

// Use ssl:require for Railway TCP proxy
const sql = postgres(url, {
  max: 1,
  ssl: { rejectUnauthorized: false },
  connect_timeout: 30,
  idle_timeout: 60,
})

async function run() {
  if (RESET) {
    console.log('⚠  --reset: dropping and recreating all tables …')
    await sql.unsafe(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `)
    console.log('   Schema reset.\n')
  }

  // Migrations tracking table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const applied = new Set(
    (await sql`SELECT filename FROM _migrations ORDER BY id`).map(r => r.filename)
  )

  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql'))
    .sort()

  let ran = 0
  let skipped = 0
  let failed = 0

  for (const file of files) {
    if (applied.has(file)) {
      process.stdout.write(`  skip  ${file}\n`)
      skipped++
      continue
    }

    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    process.stdout.write(`  apply ${file} … `)

    try {
      // Each migration in its own transaction
      await sql.begin(async tx => {
        await tx.unsafe(content)
        await tx`INSERT INTO _migrations (filename) VALUES (${file})`
      })
      process.stdout.write('✓\n')
      ran++
    } catch (err) {
      process.stdout.write(`✗\n`)
      console.error(`         Error: ${err.message.split('\n')[0]}`)
      failed++
    }
  }

  const total = files.length
  console.log(`\n─────────────────────────────────────────────`)
  console.log(`Applied: ${ran}  │  Skipped: ${skipped}  │  Failed: ${failed}  │  Total: ${total}`)

  await sql.end()
  if (failed > 0) process.exit(1)
}

run().catch(err => { console.error(err); process.exit(1) })
