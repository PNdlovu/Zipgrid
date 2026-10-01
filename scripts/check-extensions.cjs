'use strict'
const path = require('path')
const fs = require('fs')
const ROOT = path.join(__dirname, '..')
const envVars = {}
fs.readFileSync(path.join(ROOT, 'apps', 'web', '.env.local'), 'utf8').split('\n').forEach(l => {
  if (!l || l.startsWith('#') || !l.includes('=')) return
  const i = l.indexOf('='); envVars[l.slice(0,i).trim()] = l.slice(i+1).trim()
})
const postgres = require(path.join(ROOT, 'node_modules', 'postgres'))
const sql = postgres(envVars['DATABASE_URL'], { ssl: 'require', max: 1, idle_timeout: 10, connect_timeout: 20 })
async function main() {
  // Check available extensions
  const exts = await sql`SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('postgis','pgcrypto','citext','uuid-ossp') ORDER BY name`
  console.log('Available extensions:')
  exts.forEach(e => console.log(`  ${e.name}: available=${e.default_version}, installed=${e.installed_version || 'no'}`))

  // Try installing them individually
  for (const ext of ['pgcrypto', 'citext', 'postgis']) {
    try {
      await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "${ext}"`)
      console.log(`  ✅ CREATE EXTENSION ${ext} — OK`)
    } catch(e) {
      console.log(`  ❌ CREATE EXTENSION ${ext} — ${e.message}`)
    }
  }
}
main().catch(e => console.error(e)).finally(() => sql.end())
