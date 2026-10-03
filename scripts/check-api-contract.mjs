/**
 * check-api-contract.mjs
 * Finds frontend API calls (fetch / axios-style helpers) whose URL + method has
 * no matching Next.js route handler under apps/web/src/app/api.
 *
 * Usage: node scripts/check-api-contract.mjs
 * Exits 1 when any call has no handler.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'apps/web/src')
const API = join(APP, 'app/api')

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

// ── Route table: path pattern → set of methods ──
const routes = []
for (const file of walk(API).filter((f) => f.endsWith(`${sep}route.ts`))) {
  const rel = relative(join(APP, 'app'), dirname(file)).split(sep).join('/')
  const pattern = '^/' + rel.split('/').map((seg) => (/^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.]/g, '\\.'))).join('/') + '$'
  const src = readFileSync(file, 'utf8')
  const methods = new Set([...src.matchAll(/export\s+(?:async\s+function|const|\{)\s*(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]))
  for (const m of src.matchAll(/export\s*\{\s*([A-Z, ]+)\s*\}/g)) for (const x of m[1].split(',')) methods.add(x.trim())
  routes.push({ re: new RegExp(pattern), methods, rel })
}

// ── Calls in client code ──
const calls = []
for (const file of walk(APP).filter((f) => /\.(tsx?|ts)$/.test(f) && !f.includes(`${sep}app${sep}api${sep}`))) {
  const src = readFileSync(file, 'utf8')
  const re = /fetch\(\s*([`'"])(\/api\/[^`'"]*)\1\s*(?:,\s*\{([\s\S]{0,400}?)\})?/g
  let m
  while ((m = re.exec(src))) {
    const rawUrl = m[2]
    const method = (/method:\s*['"`](\w+)['"`]/.exec(m[3] ?? '')?.[1] ?? 'GET').toUpperCase()
    const path = rawUrl.split('?')[0].replace(/\$\{[^}]+\}/g, 'X').replace(/\/$/, '')
    const line = src.slice(0, m.index).split('\n').length
    calls.push({ path, method, loc: `${relative(ROOT, file).split(sep).join('/')}:${line}` })
  }
}

const missing = []
for (const c of calls) {
  const route = routes.find((r) => r.re.test(c.path))
  if (!route) missing.push({ ...c, why: 'no route' })
  else if (!route.methods.has(c.method)) missing.push({ ...c, why: `no ${c.method} handler (has ${[...route.methods].join(',') || 'none'})` })
}

console.log(`API calls: ${calls.length}, routes: ${routes.length}, unmatched: ${missing.length}`)
for (const m of missing) console.log(`  ✗ ${m.method} ${m.path}  — ${m.why}\n      ${m.loc}`)
process.exit(missing.length ? 1 : 0)
