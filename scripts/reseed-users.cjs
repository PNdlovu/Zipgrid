'use strict'
/**
 * Re-seeds demo users with a freshly generated bcrypt hash.
 * Drops all existing demo users first to avoid stale hash conflicts.
 * Run: node scripts/reseed-users.cjs
 */
const fs   = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')

// Load .env.local
const envVars = {}
fs.readFileSync(path.join(ROOT, 'apps', 'web', '.env.local'), 'utf8')
  .split('\n')
  .forEach(l => {
    if (!l || l.startsWith('#') || !l.includes('=')) return
    const i = l.indexOf('=')
    envVars[l.slice(0, i).trim()] = l.slice(i + 1).trim()
  })

const DATABASE_URL = envVars['DATABASE_URL']
if (!DATABASE_URL) { console.error('No DATABASE_URL'); process.exit(1) }

const bcrypt   = require(path.join(ROOT, 'node_modules', 'bcryptjs'))
const postgres = require(path.join(ROOT, 'node_modules', 'postgres'))

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 2, idle_timeout: 20, connect_timeout: 30, onnotice: () => {} })

const PASSWORD = 'Zipgrid2026!'
const DEMO_USER_IDS = [
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000099',
]

async function main() {
  console.log(`🔑  Generating fresh bcrypt hash for: ${PASSWORD}`)
  const hash = await bcrypt.hash(PASSWORD, 12)
  console.log(`✅  Hash: ${hash}`)

  // Verify immediately
  const valid = await bcrypt.compare(PASSWORD, hash)
  console.log(`✅  Verification: ${valid ? 'PASS' : 'FAIL'}`)
  if (!valid) { console.error('Hash verification failed!'); process.exit(1) }

  console.log('\n🗑️   Removing stale demo users...')
  const idList = DEMO_USER_IDS.map(id => `'${id}'`).join(',')
  await sql.unsafe(`DELETE FROM users WHERE id IN (${idList})`).catch(() => {})
  console.log('✅  Cleared')

  console.log('\n🌱  Re-seeding demo users...')
  const users = [
    { id: '10000000-0000-0000-0000-000000000001', email: 'sarah@demo.zipgrid.co.uk',  name: 'Sarah Chen',    display: 'Sarah C.',  roles: 'driver,host'  },
    { id: '10000000-0000-0000-0000-000000000002', email: 'dev@demo.zipgrid.co.uk',    name: 'Dev Patel',     display: 'Dev P.',    roles: 'host'         },
    { id: '10000000-0000-0000-0000-000000000003', email: 'marcus@demo.zipgrid.co.uk', name: 'Marcus Wright', display: 'Marcus W.', roles: 'driver'       },
    { id: '10000000-0000-0000-0000-000000000004', email: 'andy@demo.zipgrid.co.uk',   name: 'Andy Okafor',   display: 'Andy O.',   roles: 'driver'       },
    { id: '10000000-0000-0000-0000-000000000005', email: 'claire@demo.zipgrid.co.uk', name: 'Claire Nkosi',  display: 'Claire N.', roles: 'installer'    },
    { id: '00000000-0000-0000-0000-000000000099', email: 'admin@zipgrid.co.uk',        name: 'Zipgrid Admin', display: 'Admin',     roles: 'admin'        },
  ]

  for (const u of users) {
    const rolesLit = '{' + u.roles.split(',').map(r => r.trim()).join(',') + '}'
    try {
      await sql.unsafe(`
        INSERT INTO users (
          id, email, full_name, display_name,
          password_hash, roles, account_status,
          kyc_status, kyc_verified_at,
          email_verified, email_verified_at,
          ai_mode, created_at, updated_at
        ) VALUES (
          '${u.id}', '${u.email}', '${u.name}', '${u.display}',
          '${hash}',
          '${rolesLit}'::user_role[],
          'active', 'verified',
          NOW() - INTERVAL '30 days',
          TRUE, NOW() - INTERVAL '30 days',
          'hybrid',
          NOW() - INTERVAL '60 days', NOW()
        )
      `)
      console.log(`   ✅  ${u.name} (${u.email})`)
    } catch (err) {
      console.log(`   ❌  ${u.name} — ${(err.message || '').slice(0, 100)}`)
    }
  }

  // Verify login will work by checking the hash matches
  console.log('\n🔍  Verifying stored hash matches password...')
  const row = await sql.unsafe(`SELECT password_hash FROM users WHERE email = 'sarah@demo.zipgrid.co.uk' LIMIT 1`)
  if (row.length > 0) {
    const storedHash = row[0].password_hash
    const loginCheck = await bcrypt.compare(PASSWORD, storedHash)
    console.log(`   ${loginCheck ? '✅  Login check PASSED' : '❌  Login check FAILED'}`)
  }

  console.log('\n════════════════════════════════════════════')
  console.log('  LOGIN CREDENTIALS — Password: Zipgrid2026!')
  console.log('  URL: http://localhost:3000/login')
  console.log('════════════════════════════════════════════')
  console.log('  sarah@demo.zipgrid.co.uk  → Host + Driver')
  console.log('  dev@demo.zipgrid.co.uk    → SMB Host')
  console.log('  marcus@demo.zipgrid.co.uk → Driver')
  console.log('  andy@demo.zipgrid.co.uk   → Driver')
  console.log('  claire@demo.zipgrid.co.uk → Installer')
  console.log('  admin@zipgrid.co.uk        → Admin')
  console.log('')
}

main()
  .catch(e => { console.error('Failed:', e.message); process.exit(1) })
  .finally(() => sql.end())
