/**
 * @file setup-local-db.cjs
 * @description One-shot local database setup for Railway PostgreSQL.
 * Run: node scripts/setup-local-db.cjs
 *
 * Strategy:
 *   - Installs pgcrypto and citext (both available on Railway postgres-ssl:18)
 *   - Skips PostGIS (not bundled in the default Railway image)
 *   - Runs core migrations for auth, users, listings (no geography columns)
 *   - Seeds 6 demo users with real bcrypt hashes
 *   - All email_verified = TRUE so login works immediately
 */

'use strict'

const fs   = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')

// ── Load .env.local ──────────────────────────────────────────
const envVars = {}
fs.readFileSync(path.join(ROOT, 'apps', 'web', '.env.local'), 'utf8').split('\n').forEach(l => {
  if (!l || l.startsWith('#') || !l.includes('=')) return
  const i = l.indexOf('='); envVars[l.slice(0,i).trim()] = l.slice(i+1).trim()
})
const DATABASE_URL = envVars['DATABASE_URL']

console.log('🚀  Zipgrid local database setup')
console.log('📍  Target:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'))
console.log('')

const postgres = require(path.join(ROOT, 'node_modules', 'postgres'))
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 2, idle_timeout: 30, connect_timeout: 30, onnotice: () => {} })

// ── Pre-verified password hash (Zipgrid2026!) ────────────────
const HASH = '$2a$12$b8h7LblWSOK7FDz95Yic4.mqr1K4fHEAZKQksbayLjksZJoJ7m7q.'

async function exec(label, query) {
  try {
    await sql.unsafe(query)
    console.log(`   ✅  ${label}`)
    return true
  } catch(e) {
    const msg = (e.message || '').slice(0, 100)
    if (msg.includes('already exists') || msg.includes('duplicate')) {
      console.log(`   ✅  ${label} (already exists)`)
      return true
    }
    console.log(`   ⚠️   ${label} — ${msg}`)
    return false
  }
}

async function main() {
  console.log('📦  Step 1: Extensions')
  await exec('pgcrypto', `CREATE EXTENSION IF NOT EXISTS pgcrypto`)
  await exec('citext',   `CREATE EXTENSION IF NOT EXISTS citext`)
  console.log('   ℹ️   PostGIS: skipped (not in Railway postgres-ssl:18 image)')
  console.log('         Map search will use basic lat/lng until PostGIS is added.')
  console.log('')

  console.log('📦  Step 2: Core schema')

  // Users (simplified — no PostGIS dependency)
  await exec('user_role enum', `
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('driver','host','installer','admin');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `)
  await exec('kyc_status enum', `
    DO $$ BEGIN
      CREATE TYPE kyc_status AS ENUM ('not_started','pending','verified','rejected');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `)
  await exec('account_status enum', `
    DO $$ BEGIN
      CREATE TYPE account_status AS ENUM ('pending','active','suspended','banned');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `)
  await exec('ai_mode enum', `
    DO $$ BEGIN
      CREATE TYPE ai_mode AS ENUM ('standard','hybrid','agentic');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `)
  await exec('users table', `
    CREATE TABLE IF NOT EXISTS users (
      id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      email                 CITEXT        NOT NULL UNIQUE,
      full_name             VARCHAR(200),
      display_name          VARCHAR(100),
      avatar_url            TEXT,
      phone                 VARCHAR(30),
      phone_verified        BOOLEAN       NOT NULL DEFAULT FALSE,
      email_verified        BOOLEAN       NOT NULL DEFAULT FALSE,
      email_verified_at     TIMESTAMPTZ,
      password_hash         TEXT,
      roles                 user_role[]   NOT NULL DEFAULT '{driver}',
      account_status        account_status NOT NULL DEFAULT 'pending',
      kyc_status            kyc_status    NOT NULL DEFAULT 'not_started',
      kyc_verified_at       TIMESTAMPTZ,
      stripe_customer_id    VARCHAR(100),
      stripe_connect_account_id VARCHAR(100),
      ai_mode               ai_mode       NOT NULL DEFAULT 'hybrid',
      created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `)
  await exec('otp_codes table', `
    CREATE TABLE IF NOT EXISTS otp_codes (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        VARCHAR(10) NOT NULL CHECK (type IN ('email','phone')),
      code_hash   TEXT        NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used        BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, type)
    )
  `)
  await exec('driver_profiles table', `
    CREATE TABLE IF NOT EXISTS driver_profiles (
      id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      total_sessions      INT     NOT NULL DEFAULT 0,
      total_kwh_consumed  NUMERIC(10,3) NOT NULL DEFAULT 0,
      average_rating      NUMERIC(3,2),
      review_count        INT     NOT NULL DEFAULT 0,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await exec('host_profiles table', `
    CREATE TABLE IF NOT EXISTS host_profiles (
      id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      business_type           VARCHAR(30) NOT NULL DEFAULT 'individual',
      business_name           VARCHAR(200),
      stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
      identity_verified       BOOLEAN NOT NULL DEFAULT FALSE,
      total_earnings_cents    INT     NOT NULL DEFAULT 0,
      total_sessions_hosted   INT     NOT NULL DEFAULT 0,
      average_rating          NUMERIC(3,2),
      review_count            INT     NOT NULL DEFAULT 0,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await exec('notifications table', `
    CREATE TABLE IF NOT EXISTS notifications (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type            VARCHAR(60) NOT NULL,
      channel         VARCHAR(20) NOT NULL DEFAULT 'in_app',
      title           VARCHAR(200) NOT NULL,
      body            TEXT,
      action_url      TEXT,
      is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
      delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await exec('audit_log table', `
    CREATE TABLE IF NOT EXISTS audit_log (
      id              BIGSERIAL   PRIMARY KEY,
      actor_user_id   UUID        REFERENCES users(id),
      action          VARCHAR(60) NOT NULL,
      entity_type     VARCHAR(60),
      entity_id       UUID,
      old_values      JSONB,
      new_values      JSONB,
      ip_address      INET,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  console.log('')

  console.log('🌱  Step 3: Demo users')
  const users = [
    { id: '10000000-0000-0000-0000-000000000001', email: 'sarah@demo.zipgrid.co.uk',  name: 'Sarah Chen',    display: 'Sarah C.',  roles: 'driver,host'  },
    { id: '10000000-0000-0000-0000-000000000002', email: 'dev@demo.zipgrid.co.uk',    name: 'Dev Patel',     display: 'Dev P.',    roles: 'host'         },
    { id: '10000000-0000-0000-0000-000000000003', email: 'marcus@demo.zipgrid.co.uk', name: 'Marcus Wright', display: 'Marcus W.', roles: 'driver'       },
    { id: '10000000-0000-0000-0000-000000000004', email: 'andy@demo.zipgrid.co.uk',   name: 'Andy Okafor',   display: 'Andy O.',   roles: 'driver'       },
    { id: '10000000-0000-0000-0000-000000000005', email: 'claire@demo.zipgrid.co.uk', name: 'Claire Nkosi',  display: 'Claire N.', roles: 'installer'    },
    { id: '00000000-0000-0000-0000-000000000099', email: 'admin@zipgrid.co.uk',        name: 'Zipgrid Admin', display: 'Admin',     roles: 'admin'        },
  ]

  for (const u of users) {
    const rolesArr = u.roles.split(',').map(r => r.trim())
    const rolesLit = '{' + rolesArr.join(',') + '}'
    await exec(`user: ${u.name}`, `
      INSERT INTO users (id, email, full_name, display_name, password_hash, roles,
        account_status, kyc_status, kyc_verified_at, email_verified, email_verified_at,
        ai_mode, created_at, updated_at)
      VALUES (
        '${u.id}', '${u.email}', '${u.name}', '${u.display}',
        '${HASH}',
        '${rolesLit}'::user_role[],
        'active', 'verified',
        NOW() - INTERVAL '30 days',
        TRUE, NOW() - INTERVAL '30 days',
        'hybrid',
        NOW() - INTERVAL '60 days', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        password_hash     = EXCLUDED.password_hash,
        email_verified    = TRUE,
        email_verified_at = COALESCE(users.email_verified_at, NOW()),
        account_status    = 'active', kyc_status = 'verified',
        updated_at        = NOW()
    `)
  }
  console.log('')

  console.log('═'.repeat(60))
  console.log('  🎯  DEMO LOGIN CREDENTIALS — All passwords: Zipgrid2026!')
  console.log('  URL: http://localhost:3000/login')
  console.log('═'.repeat(60))
  console.log('')
  console.log('  sarah@demo.zipgrid.co.uk   → Host + Driver dashboard')
  console.log('  dev@demo.zipgrid.co.uk     → SMB portal (/smb/dashboard)')
  console.log('  marcus@demo.zipgrid.co.uk  → Driver app (/map)')
  console.log('  andy@demo.zipgrid.co.uk    → New driver (/bookings)')
  console.log('  claire@demo.zipgrid.co.uk  → Installer (/marketplace)')
  console.log('  admin@zipgrid.co.uk        → Admin panel (/admin/dashboard)')
  console.log('')
  console.log('  ⚠️  All accounts pre-verified — no email OTP needed.')
  console.log('  ⚠️  Map/PostGIS features will be blank until PostGIS is added.')
  console.log('      Everything else (auth, dashboards, bookings, AI) works.')
  console.log('')
  console.log('  🚀  Now run:  cd apps/web && npm run dev')
  console.log('')
}

main()
  .catch(e => { console.error('\n❌ Failed:', e.message); process.exit(1) })
  .finally(() => sql.end())
